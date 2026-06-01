"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { fetchUpcomingInterviews, InterviewRecord } from "@/lib/db";

const interviewFlow = [
  {
    title: "Hazırlık",
    description: "Kamera ve mikrofon izinlerini kontrol edin, sakin ve aydınlık bir ortam hazırlayın.",
  },
  {
    title: "Isınma Soruları",
    description: "Kısa tanıtım soruları ile başlarız. Cevaplarınızı net ve akıcı vermeniz yeterli.",
  },
  {
    title: "Teknik Bölüm",
    description: "Rolünüze uygun senaryolar ve problem çözme soruları ile ilerlenir.",
  },
  {
    title: "Kapanış",
    description: "Son değerlendirme ve sonraki adımlar hakkında bilgi paylaşılır.",
  },
];

const tips = [
  "Arka planınızı sade tutun ve iyi aydınlatılmış bir ortamda olun.",
  "Soruları yanıtlarken önce düşüncelerinizi kısaca organize edin.",
  "Sürenizi verimli kullanın; gerektiğinde kısa notlar alabilirsiniz.",
];

const formatDateTime = (value?: string | null) => {
  if (!value) return "Tarih belirlenmedi";
  return new Date(value).toLocaleString("tr-TR", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function InterviewInfoPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [upcomingInterviews, setUpcomingInterviews] = useState<InterviewRecord[]>([]);
  const [interviewLoading, setInterviewLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || loading) return;

    const loadInterviews = async () => {
      setInterviewLoading(true);
      const upcoming = await fetchUpcomingInterviews(user.id, false);
      setUpcomingInterviews(upcoming);
      setInterviewLoading(false);
    };

    loadInterviews();
  }, [user, loading]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading || (!loading && !user)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-lg text-slate-700">Yükleniyor...</div>
      </div>
    );
  }

  const nextInterview = upcomingInterviews[0];
  const canJoin = !!nextInterview && nextInterview.status === "in_progress";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-600">Mülakat Bilgilendirmesi</p>
            <h1 className="mt-2 text-2xl font-black text-slate-950 md:text-3xl">Görüşmeye Başlamadan Önce</h1>
          </div>
          <Button onClick={handleSignOut} variant="outline" className="rounded-2xl border-slate-200 bg-white px-5 text-slate-700 hover:bg-slate-50">
            Çıkış Yap
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10 pb-32">
        <div className="mb-8 max-w-3xl text-base leading-7 text-slate-600">
          Aşağıdaki adımlar mülakat sürecinde nelerle karşılaşacağınızı anlatır. Hazır olduğunuzda
          <span className="font-bold text-slate-900"> Mülakata Gir </span>
          butonuna tıklayarak görüntülü görüşmeyi başlatabilirsiniz.
        </div>

        <Card className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm shadow-slate-200/70">
          <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-600">Planlanan Mülakat</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">{nextInterview?.title || "Mülakat bilgisi"}</h2>
              <p className="mt-2 text-slate-500">
                {interviewLoading
                  ? "Bilgiler yükleniyor..."
                  : nextInterview
                  ? formatDateTime(nextInterview.scheduled_at)
                  : "Planlanmış bir mülakat bulunamadı."}
              </p>
            </div>
            <span className={`w-fit rounded-full px-4 py-2 text-sm font-bold ${canJoin ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              {canJoin ? "Yönetici toplantıyı başlattı" : "Yönetici başlattığında giriş açılacak"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </span>
            <h2 className="text-xl font-black text-slate-950">Mülakat Akışı</h2>
          </div>

          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {interviewFlow.map((step, index) => (
              <div key={step.title} className={`rounded-3xl border p-5 ${index === 3 ? "border-violet-200 bg-violet-50/50" : "border-slate-200 bg-slate-50"}`}>
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-sm font-black text-white shadow-lg shadow-violet-500/20">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="font-black text-slate-950">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="mt-7 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm shadow-slate-200/70">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">💡</span>
            <h2 className="text-xl font-black text-slate-950">Hızlı İpuçları</h2>
          </div>
          <ul className="mt-6 space-y-4 text-slate-700">
            {tips.map((tip) => (
              <li key={tip} className="flex items-start gap-3">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs text-violet-700">✓</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </Card>
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/90 px-6 py-5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Hazır mısınız?</p>
            <p className="mt-1 text-sm text-slate-600">Mülakat esnasında kameranızı ve mikrofonunuzu etkinleştirmeniz gerekecek.</p>
          </div>
          <Button
            onClick={() => {
              if (!nextInterview?.session_id) return;
              router.push(`/interview?session=${nextInterview.session_id}`);
            }}
            disabled={!canJoin}
            className="h-12 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-8 text-white shadow-lg shadow-violet-500/25 hover:opacity-95 disabled:from-violet-200 disabled:to-violet-200 disabled:text-violet-700"
          >
            Mülakata Gir
          </Button>
        </div>
      </footer>
    </div>
  );
}
