"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { upsertInterviewReport } from "@/lib/db";

const getBackendUrl = (): string => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://ik-mulakat-ai.onrender.com";
  return apiUrl.replace(/\/$/, "");
};

interface Sentiment {
  positive: number;
  neutral: number;
  negative: number;
}

interface InterviewReport {
  overall_score: number;
  overall_comment: string;
  sentiment: Sentiment;
  key_topics: string[];
  strengths: string[];
  improvements: string[];
}

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins} dk ${secs} sn`;
};

const normalizeTranscriptText = (text: string) => {
  return text
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

const isTranscriptNoiseText = (text: string) => {
  const normalized = normalizeTranscriptText(text);
  const noisePhrases = [
      "abone olmayi",
      "abone olun",
      "abone ol",
      "begeni butonuna",
      "begen butonuna",
      "yorum yapmayi",
      "yorum yapin",
      "kanalima abone",
      "izlediginiz icin tesekkur ederim",
      "izlediginiz icin tesekkurler",
      "beni izlediginiz icin tesekkur ederim",
      "yeni videolarda gorusmek uzere",
      "hoscakal",
      "hoscakalin",
      "altyazi",
      "altyazi m k",
      "altyazilar",
      "ceviri",
      "seslendiren",
      "dont forget subscribe",
      "do not forget subscribe",
      "like and subscribe",
      "subscribe to the channel",
      "thanks for watching",
      "thank you for watching",
      "subtitles by",
      "captions by",
      "amara org",
    ];

  return noisePhrases.some((phrase) => normalized.includes(phrase));
};

const sanitizeTranscriptForReport = (transcript: string) => {
  return transcript
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isTranscriptNoiseText(line))
    .join("\n");
};


function ProgressLine({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-sm">
        <span className="font-semibold text-slate-600">{label}</span>
        <span className="font-black text-slate-950">{value}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function BulletCard({ title, items, tone }: { title: string; items: string[]; tone: "green" | "orange" }) {
  const dotClass = tone === "green" ? "bg-emerald-500" : "bg-amber-500";
  return (
    <Card className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm shadow-slate-200/70">
      <h2 className="text-lg font-black text-slate-950">{title}</h2>
      <ul className="mt-5 space-y-4 text-sm leading-6 text-slate-700">
        {items.length > 0 ? (
          items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
              <span>{item}</span>
            </li>
          ))
        ) : (
          <li className="text-slate-400">Henüz belirlenmedi</li>
        )}
      </ul>
    </Card>
  );
}

export default function InterviewReportPage() {
  const router = useRouter();
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const savedDuration = localStorage.getItem("interview_duration");
    if (savedDuration) {
      setDuration(parseInt(savedDuration, 10));
    }

    const storedInterviewId = localStorage.getItem("active_interview_id");
    const storedSessionId = localStorage.getItem("interview_session_id");
    const rawTranscript = localStorage.getItem("interview_transcript");
    const transcript = rawTranscript ? sanitizeTranscriptForReport(rawTranscript) : "";

    if (!transcript || transcript.trim().length < 20) {
      setError("Transkript bulunamadı veya çok kısa. Lütfen mülakatı tamamlayın.");
      setLoading(false);
      return;
    }

    const fetchReport = async () => {
      try {
        setLoading(true);
        setError(null);

        const backendUrl = getBackendUrl();
        const response = await fetch(`${backendUrl}/api/v1/ai/report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript, language: "tr" }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ detail: "Unknown error" }));
          throw new Error(errorData.detail || `HTTP ${response.status}`);
        }

        const data = (await response.json()) as InterviewReport;
        setReport(data);

        if (storedInterviewId && storedSessionId) {
          await upsertInterviewReport({
            interviewId: storedInterviewId,
            sessionId: storedSessionId,
            report: data as unknown as Record<string, unknown>,
          });
        }
      } catch (err) {
        const message = err instanceof Error && err.message ? err.message : "Rapor oluşturulurken bir hata oluştu. Lütfen tekrar deneyin.";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, []);

  const sentiment = report?.sentiment ?? { positive: 0, neutral: 0, negative: 0 };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/dashboard")} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-600">Mülakat Raporu</p>
              <h1 className="mt-1 text-2xl font-black text-slate-950">AI Görüşme Geri Bildirimi</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-right">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Görüşme Süresi</p>
              <p className="text-lg font-black text-slate-950">{formatDuration(duration)}</p>
            </div>
            <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${loading ? "bg-amber-50 text-amber-700" : error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
              <span className={`h-2 w-2 rounded-full ${loading ? "bg-amber-500" : error ? "bg-red-500" : "bg-emerald-500"}`} />
              {loading ? "Analiz hazırlanıyor" : error ? "Hata oluştu" : "Analiz tamamlandı"}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl space-y-7 px-6 py-8">
        {loading && (
          <Card className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white py-16 shadow-sm">
            <div className="mb-5 h-12 w-12 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
            <p className="font-semibold text-slate-600">AI analizi hazırlanıyor...</p>
          </Card>
        )}

        {error && (
          <Card className="rounded-3xl border border-red-200 bg-red-50 p-7">
            <p className="font-semibold text-red-700">{error}</p>
            <Button onClick={() => router.push("/interview-admin")} className="mt-5 rounded-2xl bg-red-600 text-white hover:bg-red-700">
              Mülakat Sayfasına Dön
            </Button>
          </Card>
        )}

        {!loading && !error && report && (
          <>
            <section className="grid gap-5 lg:grid-cols-[1.15fr,0.85fr,0.9fr]">
              <Card className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm shadow-slate-200/70">
                <p className="text-sm font-bold text-slate-500">Genel AI Skoru</p>
                <div className="mt-4 flex items-end gap-2">
                  <span className="text-6xl font-black text-violet-700">{report.overall_score}</span>
                  <span className="pb-2 text-sm font-bold text-slate-400">/100</span>
                </div>
                <p className="mt-5 leading-7 text-slate-600">{report.overall_comment || "Değerlendirme yapılamadı."}</p>
              </Card>

              <Card className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm shadow-slate-200/70">
                <p className="text-sm font-bold text-slate-500">Duygu Analizi</p>
                <div className="mt-5 space-y-5">
                  <ProgressLine label="Pozitif" value={sentiment.positive} tone="bg-emerald-500" />
                  <ProgressLine label="Nötr" value={sentiment.neutral} tone="bg-slate-400" />
                  <ProgressLine label="Negatif" value={sentiment.negative} tone="bg-red-400" />
                </div>
              </Card>

              <Card className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm shadow-slate-200/70">
                <p className="text-sm font-bold text-slate-500">Öne Çıkan Konular</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {report.key_topics.length > 0 ? (
                    report.key_topics.map((topic, idx) => (
                      <span key={idx} className="rounded-full bg-violet-50 px-3 py-1.5 text-sm font-bold text-violet-700">
                        {topic}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-400">Henüz konu belirlenmedi</span>
                  )}
                </div>
              </Card>
            </section>

            <section className="grid gap-5 md:grid-cols-2">
              <BulletCard title="Güçlü Yönler" items={report.strengths} tone="green" />
              <BulletCard title="Geliştirilmesi Gerekenler" items={report.improvements} tone="orange" />
            </section>
          </>
        )}

        <div className="flex justify-end">
          <Button onClick={() => router.push("/dashboard")} className="rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 text-white shadow-lg shadow-violet-500/20 hover:opacity-95">
            Dashboard'a Dön
          </Button>
        </div>
      </main>
    </div>
  );
}
