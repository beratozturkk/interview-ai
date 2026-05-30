"""
Google Gemini Question Suggestions Service
Aday transkriptine göre takip soruları üretir
"""

import os
import json
import re
import logging
from typing import List, Optional

try:
    from google import genai
except ImportError:
    genai = None
    logging.warning("[Gemini Questions] google-genai paketi bulunamadı")

logger = logging.getLogger(__name__)

# Gemini API Key - environment variable'dan al
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Gemini model - varsayılan gemini-2.5-flash
GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL_NAME", "gemini-2.5-flash")

# Minimum transcript uzunluğu
MIN_TRANSCRIPT_LENGTH = 50  # karakter


_client: Optional[object] = None


def configure_gemini_client():
    """Gemini client'ı yapılandır ve singleton döndür"""
    global _client

    if not genai:
        raise ImportError(
            "google-genai paketi yüklü değil. "
            "Lütfen requirements.txt'e google-genai>=0.1.0 ekleyin."
        )

    if not GEMINI_API_KEY:
        raise ValueError(
            "GEMINI_API_KEY environment variable bulunamadı. "
            "Lütfen .env dosyasına veya Render environment variables'a ekleyin."
        )

    if _client is None:
        _client = genai.Client(api_key=GEMINI_API_KEY)
        logger.info("[Gemini Questions] Gemini client yapılandırıldı (model: %s)", GEMINI_MODEL_NAME)

    return _client


def _extract_response_text(response: object) -> str:
    text = getattr(response, "text", None)
    if isinstance(text, str) and text.strip():
        return text.strip()

    candidates = getattr(response, "candidates", None)
    if not candidates:
        return ""

    parts_text = []
    for candidate in candidates:
        content = getattr(candidate, "content", None)
        parts = getattr(content, "parts", None) if content else None
        if not parts:
            continue
        for part in parts:
            part_text = getattr(part, "text", None)
            if part_text:
                parts_text.append(part_text)

    return "".join(parts_text).strip()


async def generate_question_suggestions(transcript: str, language: str = "tr") -> List[str]:
    """
    Aday transkriptine göre takip soruları üretir
    
    Args:
        transcript: Adayın verdiği cevapların transkripti
        language: Dil kodu (varsayılan: "tr" - Türkçe)
    
    Returns:
        Takip soruları listesi (Türkçe)
    """
    # Transcript boş veya çok kısa ise boş liste döndür
    if not transcript or len(transcript.strip()) < MIN_TRANSCRIPT_LENGTH:
        logger.info(
            "[Gemini Questions] Transcript çok kısa (%d karakter < %d), boş liste döndürülüyor",
            len(transcript) if transcript else 0,
            MIN_TRANSCRIPT_LENGTH,
        )
        return []
    
    # Gemini client'ı yapılandır
    try:
        client = configure_gemini_client()
    except (ImportError, ValueError) as e:
        logger.error(f"[Gemini Questions] Gemini client yapılandırma hatası: {e}")
        raise
    
    # Prompt oluştur
    prompt = f"""Sen bir mülakat asistanısın. Adayın verdiği cevaplara göre takip soruları üretmen gerekiyor.

Adayın cevapları:
{transcript}

Lütfen aşağıdaki kriterlere göre 3-5 takip sorusu üret:

1. Sorular Türkçe olmalı.
2. Adayın verdiği cevaplara özel ve derinlemesine olmalı.
3. "Kendinizden bahseder misiniz?" gibi genel sorulardan kaçınılmalı (eğer transkript zaten bunu kapsıyorsa).
4. Teknik derinlik, iletişim becerisi ve problem çözme yeteneği üzerine odaklanılmalı.
5. Adayın bahsettiği konulara göre özelleştirilmiş sorular olmalı.

Çıktı formatı: Sadece bir JSON array, başka metin yok. Örnek:
["Soru 1 burada", "Soru 2 burada", "Soru 3 burada"]

Sadece JSON array'i döndür, başka açıklama yapma."""

    logger.info(
        "[Gemini Questions] Gemini'ye soru önerisi isteniyor (model=%s, transcript_length=%d karakter)",
        GEMINI_MODEL_NAME,
        len(transcript),
    )
    
    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL_NAME,
            contents=prompt,
        )

        response_text = _extract_response_text(response)
        if not response_text:
            raise RuntimeError("Gemini yanıtı boş geldi")
        logger.debug(f"[Gemini Questions] Gemini response: {response_text[:200]}...")
        
        # JSON array'i bul (regex ile)
        json_match = re.search(r'\[.*?\]', response_text, re.DOTALL)
        if json_match:
            json_str = json_match.group(0)
            questions = json.loads(json_str)
            
            # Her soruyu temizle ve string'e çevir
            questions = [str(q).strip() for q in questions if q and str(q).strip()]
            
            # Maksimum 5 soru
            questions = questions[:5]
            
            logger.info(
                "[Gemini Questions] %d soru üretildi: %s",
                len(questions),
                ", ".join(questions[:2]) + ("..." if len(questions) > 2 else ""),
            )
            
            if not questions:
                raise RuntimeError("Gemini JSON cevabi bos veya gecersiz")

            return questions
        else:
            # JSON bulunamadı, fallback: newline ile split et
            logger.warning("[Gemini Questions] JSON array bulunamadı, fallback parsing kullanılıyor")
            lines = response_text.split("\n")
            questions = []
            
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                
                # Bullet karakterlerini temizle (-, •, *, vb.)
                line = re.sub(r'^[-•*]\s*', '', line)
                line = re.sub(r'^\d+\.\s*', '', line)  # Numaralandırmayı temizle
                
                if line and len(line) > 10:  # En az 10 karakter
                    questions.append(line)
            
            questions = questions[:5]  # Maksimum 5 soru
            
            logger.info(
                "[Gemini Questions] Fallback parsing ile %d soru üretildi",
                len(questions),
            )
            
            if not questions:
                raise RuntimeError("Gemini fallback parsing bos sonuc verdi")

            return questions

    except json.JSONDecodeError as e:
        logger.exception("[Gemini Questions] JSON parse hatası")
        raise
    except Exception:
        logger.exception("[Gemini Questions] Gemini API çağrısı hatası")
        raise

