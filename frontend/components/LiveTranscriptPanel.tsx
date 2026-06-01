"use client";

/**
 * Canlı Transkript Paneli
 * WebSocket üzerinden gelen transcript mesajlarını gerçek zamanlı gösterir.
 * Bu dosyada frontend tarafında da noise/halüsinasyon filtresi vardır.
 */

import { useEffect, useState, useRef } from "react";
import { Card } from "@/components/ui/card";

const getBackendUrl = (): string => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://ik-mulakat-ai.onrender.com";
  return apiUrl.replace(/^http/, "ws").replace(/\/$/, "");
};

export interface TranscriptItem {
  id: string;
  role: "Aday" | "Görüşmeci";
  text: string;
  timestamp: Date;
}

interface LiveTranscriptPanelProps {
  sessionId: string;
  onTranscriptChange?: (items: TranscriptItem[]) => void;
}

const normalizeTranscriptText = (text: string): string => {
  return (text || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const isTranscriptNoise = (text: string): boolean => {
  const raw = (text || "").trim();
  const normalized = normalizeTranscriptText(raw);

  if (!normalized) return true;

  const words = normalized.split(" ").filter(Boolean);

  const allowedShortAnswers = new Set([
    "evet",
    "hayir",
    "tamam",
    "olur",
    "peki",
    "merhaba",
  ]);

  if (words.length === 1 && !allowedShortAnswers.has(normalized)) {
    return true;
  }

  if (raw.length < 12 && !allowedShortAnswers.has(normalized)) {
    return true;
  }

  const noisePhrases = [
    "abone olmayi",
    "abone olun",
    "abone ol",
    "kanalima abone",
    "begeni butonuna",
    "begen butonuna",
    "yorum yapmayi",
    "yorum yapin",
    "altyazi",
    "altyazilar",
    "altyazi m k",
    "ceviri",
    "seslendiren",
    "izlediginiz icin tesekkur ederim",
    "izlediginiz icin tesekkurler",
    "beni izlediginiz icin tesekkur ederim",
    "yeni videolarda gorusmek uzere",
    "gorusmek uzere hoscakalin",
    "hoscakalin",
    "dont forget subscribe",
    "do not forget subscribe",
    "like and subscribe",
    "subscribe to the channel",
    "thanks for watching",
    "thank you for watching",
    "subtitles by",
    "captions by",
    "amara org",
    "sesim geliyor mu",
    "ses geliyor mu",
    "mikrofon test",
    "deneme deneme",
  ];

  if (noisePhrases.some((phrase) => normalized.includes(phrase))) {
    return true;
  }

  return false;
};

const isNearDuplicate = (text: string, items: TranscriptItem[]): boolean => {
  const normalized = normalizeTranscriptText(text);
  if (!normalized) return true;

  return items.slice(-12).some((item) => {
    const previous = normalizeTranscriptText(item.text);
    return previous === normalized || previous.includes(normalized) || normalized.includes(previous);
  });
};

export function LiveTranscriptPanel({ sessionId, onTranscriptChange }: LiveTranscriptPanelProps) {
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const manualCloseRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  useEffect(() => {
    if (!sessionId) return;

    const backendUrl = getBackendUrl();
    const wsUrl = `${backendUrl}/api/v1/stt/ws/transcript?session_id=${sessionId}`;

    console.log("[Transcript] WebSocket bağlantısı kuruluyor:", wsUrl);

    manualCloseRef.current = false;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[Transcript] ✅ WebSocket connected");
      setIsConnected(true);
      setConnectionError(null);
      reconnectAttemptsRef.current = 0;
    };

    ws.onclose = (event) => {
      console.log("[Transcript] WebSocket closed:", event.code, event.reason);
      setIsConnected(false);

      if (!manualCloseRef.current && reconnectAttemptsRef.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * (reconnectAttemptsRef.current + 1), 8000);
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = window.setTimeout(() => {
          setReconnectAttempt((prev) => prev + 1);
        }, delay);
      } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
        setConnectionError("Transkript bağlantısı tekrar kurulamadı");
      }
    };

    ws.onerror = (error) => {
      console.error("[Transcript] ❌ WebSocket error:", error);
      setConnectionError("Transkript bağlantısı kurulamadı");
    };

    ws.onmessage = (event) => {
      try {
        if (event.data === "ping") {
          ws.send("pong");
          return;
        }

        if (event.data === "pong") {
          return;
        }

        const data = JSON.parse(event.data) as { role?: string; text?: string };

        if (!data.role || !data.text) {
          console.warn("[LiveTranscript] Geçersiz mesaj formatı:", data);
          return;
        }

        if (isTranscriptNoise(data.text)) {
          console.warn("[LiveTranscript] Noise transcript dropped:", data.text);
          return;
        }

        setItems((prev) => {
          if (isNearDuplicate(data.text || "", prev)) {
            console.warn("[LiveTranscript] Duplicate transcript dropped:", data.text);
            return prev;
          }

          const newItem: TranscriptItem = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            role: data.role === "Aday" ? "Aday" : "Görüşmeci",
            text: data.text!.trim(),
            timestamp: new Date(),
          };

          return [...prev, newItem].slice(-80);
        });
      } catch (error) {
        console.error("[Transcript] Mesaj parse hatası:", error, event.data);
      }
    };

    return () => {
      console.log("[Transcript] Cleanup - WebSocket kapatılıyor");
      manualCloseRef.current = true;

      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, "Component unmount");
      }

      wsRef.current = null;
    };
  }, [sessionId, reconnectAttempt]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }

    onTranscriptChange?.(items);
  }, [items, onTranscriptChange]);

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <Card className="rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-950">Canlı Transkript</h2>
          <p className="text-xs text-slate-500">Aday cevapları gerçek zamanlı işlenir.</p>
        </div>

        <div className="ml-auto flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1">
          <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-500" : "bg-red-500"}`} />
          <span className="text-xs font-medium text-slate-500">
            {isConnected ? "Bağlı" : "Bağlantı Yok"}
          </span>
        </div>
      </div>

      {connectionError && (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {connectionError}
        </div>
      )}

      <div ref={scrollRef} className="max-h-72 space-y-3 overflow-y-auto pr-1">
        {items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-sm">
            <div className="mb-1 flex items-center gap-2">
              <span className={`font-semibold ${item.role === "Aday" ? "text-violet-700" : "text-blue-700"}`}>
                {item.role}
              </span>
              <span className="text-xs text-slate-400">({formatTime(item.timestamp)})</span>
            </div>
            <p className="leading-relaxed text-slate-700">{item.text}</p>
          </div>
        ))}

        {items.length === 0 && (
          <div className="rounded-3xl border border-dashed border-slate-200 py-10 text-center">
            <div className="mb-3 text-slate-300">
              <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-500">Henüz transkript yok</p>
            <p className="mt-1 text-xs text-slate-400">Konuşma başladığında burada görünecek.</p>
          </div>
        )}
      </div>
    </Card>
  );
}

export default LiveTranscriptPanel;
