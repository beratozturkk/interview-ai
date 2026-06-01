"""
STT (Speech-to-Text) and Transcript WebSocket endpoints
Canlı transkript sistemi için WebSocket endpoint'leri
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from typing import Deque, Dict, List
import asyncio
import logging
import re
import sys
from collections import deque
from contextlib import suppress
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from time import perf_counter

logger = logging.getLogger(__name__)

# Backend root dizinini path'e ekle (services/whisper_stt.py için)
backend_dir = Path(__file__).resolve().parent.parent.parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

try:
    from services.whisper_stt import transcribe_with_whisper_chunk
except ImportError as e:
    # Fallback: Eğer import başarısız olursa dummy fonksiyon kullan
    logger.warning(f"[STT] Whisper STT import edilemedi: {e}, dummy fonksiyon kullanılıyor")

    async def transcribe_with_whisper_chunk(audio_bytes: bytes, language: str = "tr") -> str:
        return "[Whisper STT import hatası - OPENAI_API_KEY kontrol edin]"


router = APIRouter()

# session_id -> transcript websocket client list
transcript_clients: Dict[str, List[WebSocket]] = {}

# STT pipeline tuning constants
MIN_CHUNK_BYTES = 1800
FIRST_WINDOW_CHUNKS = 1
REGULAR_WINDOW_CHUNKS = 1
REGULAR_WINDOW_STEP_CHUNKS = 1
MAX_WINDOW_CHUNKS = 1
MAX_STT_QUEUE_SIZE = 8
STT_PROVIDER_TIMEOUT_SEC = 25
KEEPALIVE_PING_INTERVAL_SEC = 20

# Transcript quality / dedup tuning
MIN_TEXT_CHARS = 3
MAX_OVERLAP_WORDS = 14
PUBLISHED_TAIL_WORDS = 120
NEAR_DUPLICATE_SIMILARITY = 0.92
RECENT_EMIT_WINDOW = 12

# Whisper'ın sessizlik/bozuk ses durumunda üretebildiği sahte altyazı kalıpları
NOISE_PHRASES = [
    "abone olmayı",
    "beğen butonuna",
    "yorum yapmayı",
    "altyazı",
    "m.k",
]


@dataclass
class IncrementalTranscriptState:
    """Session-local incremental transcript state for dedup/merge."""

    published_tail: str = ""
    last_emitted: str = ""
    recent_norms: Deque[str] = field(default_factory=lambda: deque(maxlen=RECENT_EMIT_WINDOW))


def get_session_clients(session_id: str) -> List[WebSocket]:
    """Session'a ait transcript client'larını döndür."""
    if session_id not in transcript_clients:
        transcript_clients[session_id] = []
    return transcript_clients[session_id]


def _clean_spaces(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def _normalize_token(token: str) -> str:
    return re.sub(r"[^\w]", "", token.lower()).strip()


def _normalize_for_compare(text: str) -> str:
    cleaned = _clean_spaces(text.lower())
    cleaned = re.sub(r"[^\w\s]", "", cleaned)
    return _clean_spaces(cleaned)


def _tail_words(text: str, max_words: int) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text
    return " ".join(words[-max_words:])


def _looks_like_webm(audio_bytes: bytes) -> bool:
    """WebM/Matroska EBML header kontrolü: 1A 45 DF A3."""
    return len(audio_bytes) >= 4 and audio_bytes[:4] == b"\x1a\x45\xdf\xa3"


def _strip_turkish_and_accents(text: str) -> str:
    """
    Normalize Turkish/Unicode text for stable phrase matching.

    Important:
    - "İ".lower() can become "i" + combining dot, so simple replace is not enough.
    - We remove combining marks after manual Turkish replacements.
    """
    import unicodedata

    text = _clean_spaces(text).lower()
    replacements = {
        "ı": "i",
        "ğ": "g",
        "ü": "u",
        "ş": "s",
        "ö": "o",
        "ç": "c",
    }

    for src, dst in replacements.items():
        text = text.replace(src, dst)

    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return text


def _normalize_noise_text(text: str) -> str:
    text = _strip_turkish_and_accents(text)
    text = re.sub(r"[^\w\s]", " ", text)
    return _clean_spaces(text)


NOISE_PHRASES = [
    # Turkish YouTube/caption hallucinations
    "abone olmayi",
    "abone olun",
    "abone ol",
    "begeni butonuna",
    "begen butonuna",
    "yorum yapmayi",
    "yorum yapin",
    "izlediginiz icin tesekkur ederim",
    "izlediginiz icin tesekkurler",
    "beni izlediginiz icin tesekkur ederim",
    "yeni videolarda gorusmek uzere",
    "videolarda gorusmek uzere",
    "gorusmek uzere hoscakalin",
    "hoscakalin",
    "kanalima abone",
    "altyazi",
    "altyazi m k",
    "altyazilar",
    "ceviri",
    "seslendiren",

    # English YouTube/caption hallucinations
    "dont forget subscribe",
    "do not forget subscribe",
    "don't forget subscribe",
    "like and subscribe",
    "subscribe to the channel",
    "thanks for watching",
    "thank you for watching",
    "subtitles by",
    "captions by",
    "amara org",
]


def _is_noise_text(text: str) -> bool:
    cleaned = _clean_spaces(text)

    if not cleaned:
        return True

    if len(cleaned) < MIN_TEXT_CHARS:
        return True

    if re.fullmatch(r"[\.\,\;\:\!\?\-\_\(\)\[\]\{\}\'\"\`\~\s\/\\\|]+", cleaned):
        return True

    if re.fullmatch(r"[A-Za-z](?:\s*\.\s*[A-Za-z]){1,3}\.?", cleaned):
        return True

    alnum_count = sum(ch.isalnum() for ch in cleaned)
    if alnum_count < 2:
        return True

    normalized = _normalize_noise_text(cleaned)

    if any(phrase in normalized for phrase in NOISE_PHRASES):
        return True

    return False


def _is_near_duplicate(current_text: str, previous_text: str) -> bool:
    if not current_text or not previous_text:
        return False

    current_norm = _normalize_for_compare(current_text)
    previous_norm = _normalize_for_compare(previous_text)
    if not current_norm or not previous_norm:
        return False

    if current_norm == previous_norm:
        return True

    ratio = SequenceMatcher(None, current_norm, previous_norm).ratio()
    return ratio >= NEAR_DUPLICATE_SIMILARITY


def _extract_incremental_delta(previous_tail: str, candidate_text: str) -> str:
    """
    Extract only the new incremental piece from a candidate transcript.

    Uses token overlap on tail-suffix vs candidate-prefix to avoid sending
    growing variants of the same sentence repeatedly.
    """
    candidate_text = _clean_spaces(candidate_text)
    if not candidate_text:
        return ""

    if not previous_tail:
        return candidate_text

    previous_tail = _clean_spaces(previous_tail)
    candidate_norm = _normalize_for_compare(candidate_text)
    previous_norm = _normalize_for_compare(previous_tail)

    if not candidate_norm:
        return ""

    # Candidate tamamen daha önce yayınlanan tail içinde varsa tekrar etme.
    if candidate_norm in previous_norm:
        return ""

    prev_pairs = [(tok, _normalize_token(tok)) for tok in previous_tail.split()]
    cand_pairs = [(tok, _normalize_token(tok)) for tok in candidate_text.split()]
    prev_pairs = [(tok, norm) for tok, norm in prev_pairs if norm]
    cand_pairs = [(tok, norm) for tok, norm in cand_pairs if norm]

    if not cand_pairs:
        return ""

    prev_norm_tokens = [norm for _, norm in prev_pairs]
    cand_norm_tokens = [norm for _, norm in cand_pairs]

    max_overlap = min(len(prev_norm_tokens), len(cand_norm_tokens), MAX_OVERLAP_WORDS)
    for overlap in range(max_overlap, 0, -1):
        if prev_norm_tokens[-overlap:] == cand_norm_tokens[:overlap]:
            delta_tokens = [tok for tok, _ in cand_pairs[overlap:]]
            return _clean_spaces(" ".join(delta_tokens))

    return candidate_text


async def _send_keepalive_ping(ws: WebSocket, channel_name: str, session_id: str):
    """Send lightweight app-level ping frames to keep proxies/connections warm."""
    try:
        while True:
            await asyncio.sleep(KEEPALIVE_PING_INTERVAL_SEC)
            await ws.send_text("ping")
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        logger.debug(
            "[%s] Keepalive ping stopped: session_id=%s reason=%s",
            channel_name,
            session_id,
            exc,
        )


async def broadcast_transcript(session_id: str, role: str, text: str):
    """
    Transcript mesajını session'daki tüm client'lara gönder.

    Args:
        session_id: Mülakat oturum ID'si
        role: "Aday" veya "Görüşmeci"
        text: Transcribe edilmiş metin
    """
    clients = transcript_clients.get(session_id, [])

    if not clients:
        logger.debug("[STT] No transcript clients connected for session: %s", session_id)
        return

    logger.info(
        "[STT] Broadcasting transcript: session_id=%s clients=%d role=%s text_length=%d",
        session_id,
        len(clients),
        role,
        len(text),
    )

    disconnected_clients = []

    for client in list(clients):
        try:
            # Frontend'in beklediği format: { role, text }
            message = {
                "role": role,
                "text": text,
            }
            await client.send_json(message)
        except Exception as e:
            logger.warning("[STT] Transcript gönderim hatası: session_id=%s error=%s", session_id, e)
            disconnected_clients.append(client)

    # Bağlantısı kopan client'ları temizle
    for client in disconnected_clients:
        if client in clients:
            clients.remove(client)

    if not clients:
        transcript_clients.pop(session_id, None)


@router.websocket("/ws/transcript")
async def transcript_ws(
    ws: WebSocket,
    session_id: str = Query(..., description="Mülakat oturum ID'si"),
):
    """
    Transcript broadcast WebSocket endpoint.

    Client'lar bu endpoint'e bağlanarak canlı transkript mesajlarını alır.
    Sadece mesaj almak için kullanılır, mesaj göndermez.

    Query Params:
        session_id: Mülakat oturum ID'si
    """
    await ws.accept()
    logger.info("[Transcript WS] Client connected: session_id=%s", session_id)

    clients = get_session_clients(session_id)
    clients.append(ws)
    ping_task = asyncio.create_task(_send_keepalive_ping(ws, "Transcript WS", session_id))

    try:
        # Bağlantıyı açık tut, app-level ping/pong mesajlarını işle.
        while True:
            message = await ws.receive()
            message_type = message.get("type")

            if message_type == "websocket.disconnect":
                break

            if message_type != "websocket.receive":
                continue

            text = message.get("text")
            if text is not None:
                if text == "ping":
                    await ws.send_text("pong")
                continue
    except WebSocketDisconnect as exc:
        logger.info("[Transcript WS] Client disconnected: session_id=%s code=%s", session_id, exc.code)
    except Exception:
        logger.exception("[Transcript WS] Unexpected error: session_id=%s", session_id)
    finally:
        ping_task.cancel()
        with suppress(asyncio.CancelledError):
            await ping_task

        if ws in clients:
            clients.remove(ws)

        if not clients:
            transcript_clients.pop(session_id, None)

        logger.info("[Transcript WS] Cleanup complete: session_id=%s", session_id)


@router.websocket("/ws/stt")
async def stt_ws(
    ws: WebSocket,
    session_id: str = Query(..., description="Mülakat oturum ID'si"),
    role: str = Query("candidate", description="Konuşmacı rolü: candidate veya interviewer"),
):
    """
    STT (Speech-to-Text) WebSocket endpoint.

    Client bağımsız WebM segmentleri gönderir.
    Backend her segmenti tek başına işler, dedup uygular ve transcript WS client'larına yayınlar.

    Query Params:
        session_id: Mülakat oturum ID'si
        role: "candidate" (Aday) veya "interviewer" (Görüşmeci)
    """
    await ws.accept()
    logger.info("[STT] WebSocket connected: session_id=%s role=%s", session_id, role)

    role_display = "Aday" if role == "candidate" else "Görüşmeci"
    transcript_state = IncrementalTranscriptState()
    audio_queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=MAX_STT_QUEUE_SIZE)
    window_chunks: Deque[bytes] = deque(maxlen=MAX_WINDOW_CHUNKS)
    stop_event = asyncio.Event()

    chunk_count = 0
    first_publish_done = False
    chunks_since_last_window = 0

    async def transcribe_window(chunks: List[bytes]) -> str:
        """Transcribe a single complete WebM segment with timeout."""
        if not chunks:
            return ""

        # MAX_WINDOW_CHUNKS = 1 olduğu için normalde zaten tek segment gelir.
        # Yine de güvenli olmak için her zaman son bağımsız segmenti işliyoruz.
        payload = chunks[-1]
        started = perf_counter()

        if not _looks_like_webm(payload):
            logger.warning(
                "[STT] Dropped invalid standalone WebM segment: session_id=%s role=%s bytes=%d first_bytes=%s",
                session_id,
                role,
                len(payload),
                payload[:16].hex(),
            )
            return ""

        try:
            text = await asyncio.wait_for(
                transcribe_with_whisper_chunk(payload, language="tr"),
                timeout=STT_PROVIDER_TIMEOUT_SEC,
            )

            latency_ms = int((perf_counter() - started) * 1000)
            logger.info(
                "[STT] Transcription finished: session_id=%s role=%s bytes=%d latency_ms=%d",
                session_id,
                role,
                len(payload),
                latency_ms,
            )

            return text or ""

        except asyncio.TimeoutError:
            logger.warning(
                "[STT] Provider timeout: session_id=%s role=%s bytes=%d timeout_s=%d",
                session_id,
                role,
                len(payload),
                STT_PROVIDER_TIMEOUT_SEC,
            )
            return ""

        except Exception:
            logger.exception(
                "[STT] Provider call failed: session_id=%s role=%s bytes=%d",
                session_id,
                role,
                len(payload),
            )
            return ""

    async def stt_worker():
        nonlocal first_publish_done, chunks_since_last_window

        while not stop_event.is_set():
            try:
                chunk = await asyncio.wait_for(audio_queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                raise

            if not chunk:
                continue

            window_chunks.append(chunk)
            chunks_since_last_window += 1

            window_size = 0
            if not first_publish_done and len(window_chunks) >= FIRST_WINDOW_CHUNKS:
                window_size = FIRST_WINDOW_CHUNKS
            elif (
                first_publish_done
                and len(window_chunks) >= REGULAR_WINDOW_CHUNKS
                and chunks_since_last_window >= REGULAR_WINDOW_STEP_CHUNKS
            ):
                window_size = REGULAR_WINDOW_CHUNKS

            if window_size == 0:
                continue

            chunks_since_last_window = 0
            candidate_text = await transcribe_window(list(window_chunks)[-window_size:])
            candidate_text = _clean_spaces(candidate_text)

            if _is_noise_text(candidate_text):
                if candidate_text:
                    logger.info(
                        "[STT] Dropped noisy transcript: session_id=%s role=%s text=%s",
                        session_id,
                        role,
                        candidate_text[:120],
                    )
                continue

            delta_text = _extract_incremental_delta(transcript_state.published_tail, candidate_text)
            delta_text = _clean_spaces(delta_text)
            if not delta_text:
                logger.info(
                    "[STT] Dropped duplicate/overlap transcript: session_id=%s role=%s",
                    session_id,
                    role,
                )
                continue

            if _is_noise_text(delta_text):
                logger.info(
                    "[STT] Dropped low-quality delta: session_id=%s role=%s delta=%s",
                    session_id,
                    role,
                    delta_text[:120],
                )
                continue

            delta_norm = _normalize_for_compare(delta_text)
            if not delta_norm:
                continue

            if delta_norm in transcript_state.recent_norms:
                logger.info(
                    "[STT] Dropped recent duplicate delta: session_id=%s role=%s delta=%s",
                    session_id,
                    role,
                    delta_text[:120],
                )
                continue

            if _is_near_duplicate(delta_text, transcript_state.last_emitted):
                logger.info(
                    "[STT] Dropped near-duplicate delta: session_id=%s role=%s delta=%s",
                    session_id,
                    role,
                    delta_text[:120],
                )
                continue

            await broadcast_transcript(session_id, role_display, delta_text)
            first_publish_done = True
            transcript_state.last_emitted = delta_text
            transcript_state.recent_norms.append(delta_norm)
            transcript_state.published_tail = _tail_words(
                _clean_spaces(f"{transcript_state.published_tail} {delta_text}"),
                PUBLISHED_TAIL_WORDS,
            )

            logger.info(
                "[STT] Published transcript: session_id=%s role=%s delta_chars=%d text=%s",
                session_id,
                role,
                len(delta_text),
                delta_text[:120],
            )

    worker_task = asyncio.create_task(stt_worker())
    ping_task = asyncio.create_task(_send_keepalive_ping(ws, "STT WS", session_id))

    try:
        while True:
            message = await ws.receive()
            message_type = message.get("type")

            if message_type == "websocket.disconnect":
                disconnect_code = message.get("code", 1000)
                logger.info(
                    "[STT] WebSocket disconnect frame: session_id=%s role=%s code=%s",
                    session_id,
                    role,
                    disconnect_code,
                )
                break

            if message_type != "websocket.receive":
                continue

            text_data = message.get("text")
            if text_data is not None:
                if text_data == "ping":
                    await ws.send_text("pong")
                continue

            audio_bytes = message.get("bytes")
            if not audio_bytes:
                continue

            chunk_count += 1

            # Çok küçük chunk'ları ignore et (noise)
            if len(audio_bytes) < MIN_CHUNK_BYTES:
                logger.debug(
                    "[STT] Chunk too small: session_id=%s role=%s chunk=%d size=%d",
                    session_id,
                    role,
                    chunk_count,
                    len(audio_bytes),
                )
                continue

            if audio_queue.full():
                try:
                    dropped_chunk = audio_queue.get_nowait()
                    logger.warning(
                        "[STT] Queue full, dropping oldest chunk: session_id=%s role=%s dropped_bytes=%d",
                        session_id,
                        role,
                        len(dropped_chunk),
                    )
                except asyncio.QueueEmpty:
                    pass

            try:
                audio_queue.put_nowait(audio_bytes)
            except asyncio.QueueFull:
                logger.warning(
                    "[STT] Queue still full after drop: session_id=%s role=%s chunk_bytes=%d",
                    session_id,
                    role,
                    len(audio_bytes),
                )

            logger.debug(
                "[STT] Queued audio chunk: session_id=%s role=%s chunk=%d size=%d queue_size=%d first_bytes=%s",
                session_id,
                role,
                chunk_count,
                len(audio_bytes),
                audio_queue.qsize(),
                audio_bytes[:8].hex(),
            )

    except WebSocketDisconnect as exc:
        logger.info(
            "[STT] WebSocket disconnected: session_id=%s role=%s code=%s",
            session_id,
            role,
            exc.code,
        )
    except Exception:
        logger.exception("[STT] Unexpected error in STT websocket")
    finally:
        stop_event.set()

        worker_task.cancel()
        with suppress(asyncio.CancelledError):
            await worker_task

        ping_task.cancel()
        with suppress(asyncio.CancelledError):
            await ping_task

        logger.info(
            "[STT] Cleanup complete: session_id=%s role=%s received_chunks=%d remaining_queue=%d",
            session_id,
            role,
            chunk_count,
            audio_queue.qsize(),
        )
