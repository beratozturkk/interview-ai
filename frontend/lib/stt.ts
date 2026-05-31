/**
 * STT (Speech-to-Text) Client
 * Aday sesini backend'e göndererek canlı transkript oluşturur
 */

// Backend URL - environment variable'dan al
const getBackendUrl = (): string => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://ik-mulakat-ai.onrender.com";
  // HTTP/HTTPS'i WS/WSS'e çevir
  return apiUrl.replace(/^http/, "ws").replace(/\/$/, "");
};

export type SttRole = "candidate" | "interviewer";

interface SttClientOptions {
  sessionId: string;
  role: SttRole;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
}

/**
 * Audio stream'i STT WebSocket'ine gönderen client
 */
export class SttClient {
  private ws: WebSocket | null = null;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;

  private sessionId: string;
  private role: SttRole;

  private onOpen?: () => void;
  private onClose?: () => void;
  private onError?: (error: Event) => void;

  private reconnectAttempts = 0;
  private reconnectTimeout: number | null = null;
  private shouldReconnect = true;
  private readonly maxReconnectAttempts = 5;

  private recordingActive = false;
  private segmentTimer: number | null = null;
  private readonly segmentMs = 4000;

  constructor(options: SttClientOptions) {
    this.sessionId = options.sessionId;
    this.role = options.role;
    this.onOpen = options.onOpen;
    this.onClose = options.onClose;
    this.onError = options.onError;
  }

  private connect(): void {
    if (!this.stream) {
      console.warn("[STT] Stream yok, WebSocket açılamadı");
      return;
    }

    const backendUrl = getBackendUrl();
    const wsUrl = `${backendUrl}/api/v1/stt/ws/stt?session_id=${this.sessionId}&role=${this.role}`;

    console.log("[STT] WebSocket bağlantısı kuruluyor:", wsUrl);

    this.ws = new WebSocket(wsUrl);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      console.log("[STT] ✅ WebSocket opened");
      this.reconnectAttempts = 0;
      this.startRecording();
      this.onOpen?.();
    };

    this.ws.onclose = (event) => {
      console.log("[STT] WebSocket closed:", event.code, event.reason);

      this.stopRecording();
      this.ws = null;
      this.onClose?.();

      if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
        const delay = Math.min(1000 * (this.reconnectAttempts + 1), 8000);
        this.reconnectAttempts += 1;

        this.reconnectTimeout = window.setTimeout(() => {
          this.connect();
        }, delay);
      }
    };

    this.ws.onerror = (error) => {
      console.error("[STT] ❌ WebSocket error:", error);
      this.onError?.(error);
    };

    this.ws.onmessage = (event) => {
      if (event.data === "ping") {
        this.ws?.send("pong");
        return;
      }

      if (event.data === "pong") {
        return;
      }

      console.log("[STT] Message from server:", event.data);
    };
  }

  /**
   * STT'yi başlat - audio stream'i backend'e göndermeye başla
   */
  start(stream: MediaStream): void {
    if (this.ws) {
      console.warn("[STT] Zaten bağlı, önce stop() çağırın");
      return;
    }

    this.stream = stream;
    this.shouldReconnect = true;
    this.connect();
  }

  /**
   * MediaRecorder'ı segment bazlı çalıştırır.
   * Önemli: recorder.start(timeslice) kullanılmaz.
   * Her segment ayrı başlatılıp durdurulduğu için backend'e bağımsız WebM dosyası gider.
   */
  private startRecording(): void {
    if (!this.stream || !this.ws) {
      console.error("[STT] Stream veya WebSocket yok");
      return;
    }

    const audioTracks = this.stream.getAudioTracks();

    if (audioTracks.length === 0) {
      console.error("[STT] Stream'de audio track yok");
      return;
    }

    console.log(
      "[STT] Audio tracks:",
      audioTracks.map((track) => ({
        id: track.id,
        enabled: track.enabled,
        readyState: track.readyState,
      })),
    );

    const audioStream = new MediaStream(audioTracks);

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    if (!MediaRecorder.isTypeSupported(mimeType)) {
      console.error("[STT] Desteklenen MIME type bulunamadı");
      return;
    }

    console.log("[STT] MediaRecorder MIME type:", mimeType);

    this.recordingActive = true;

    const recordNextSegment = (): void => {
      if (!this.recordingActive) return;
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      const chunks: BlobPart[] = [];

      let recorder: MediaRecorder;

      try {
        recorder = new MediaRecorder(audioStream, { mimeType });
      } catch (error) {
        console.error("[STT] MediaRecorder oluşturma hatası:", error);
        return;
      }

      this.recorder = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error("[STT] MediaRecorder error:", event);
      };

      recorder.onstart = () => {
        console.log("[STT] ✅ MediaRecorder segment started");
      };

      recorder.onstop = async () => {
        console.log("[STT] MediaRecorder segment stopped");

        if (this.segmentTimer) {
          window.clearTimeout(this.segmentTimer);
          this.segmentTimer = null;
        }

        if (this.recorder === recorder) {
          this.recorder = null;
        }

        const blob = new Blob(chunks, { type: mimeType });

        if (blob.size > 1800 && this.ws?.readyState === WebSocket.OPEN) {
          const arrayBuffer = await blob.arrayBuffer();
          console.log("[STT] Sending complete WebM segment:", arrayBuffer.byteLength, "bytes");
          this.ws.send(arrayBuffer);
        } else {
          console.log("[STT] Segment gönderilmedi:", {
            blobSize: blob.size,
            wsState: this.ws?.readyState,
          });
        }

        if (this.recordingActive && this.ws?.readyState === WebSocket.OPEN) {
          recordNextSegment();
        }
      };

      // ÖNEMLİ: timeslice verme.
      // Segment bağımsız WebM olarak oluşsun diye start -> stop döngüsü kullanıyoruz.
      recorder.start();

      this.segmentTimer = window.setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      }, this.segmentMs);
    };

    recordNextSegment();
  }

  /**
   * MediaRecorder'ı durdur
   */
  private stopRecording(): void {
    this.recordingActive = false;

    if (this.segmentTimer) {
      window.clearTimeout(this.segmentTimer);
      this.segmentTimer = null;
    }

    if (this.recorder && this.recorder.state !== "inactive") {
      console.log("[STT] MediaRecorder durduruluyor...");
      this.recorder.stop();
    }

    this.recorder = null;
  }

  /**
   * STT'yi durdur ve temizle
   */
  stop(): void {
    console.log("[STT] Durduruluyor...");

    this.shouldReconnect = false;

    if (this.reconnectTimeout) {
      window.clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.stopRecording();

    if (this.ws) {
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close(1000, "Client closing");
      }

      this.ws = null;
    }

    this.stream = null;
  }

  /**
   * Bağlantı durumunu kontrol et
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

/**
 * Aday sesini STT'ye göndermeye başla
 *
 * @param stream Aday audio stream'i (WebRTC ontrack'ten gelen)
 * @param sessionId Mülakat oturum ID'si
 * @returns SttClient instance (durdurmak için stop() çağırın)
 */
export function startCandidateStt(stream: MediaStream, sessionId: string): SttClient {
  const client = new SttClient({
    sessionId,
    role: "candidate",
    onOpen: () => {
      console.log("[STT] 🎤 Aday ses kaydı başladı");
    },
    onClose: () => {
      console.log("[STT] 🛑 Aday ses kaydı durdu");
    },
    onError: (error) => {
      console.error("[STT] Aday ses kaydı hatası:", error);
    },
  });

  client.start(stream);
  return client;
}
