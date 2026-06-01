"use client";

import Link from "next/link";

const infoSections = [
  {
    title: "Biz Kimiz?",
    description:
      "AI Mülakat Asistanı, işe alım ekiplerinin görüşme sürecini daha ölçülebilir, tutarlı ve hızlı yönetmesi için geliştirilen yapay zekâ destekli bir analiz platformudur.",
  },
  {
    title: "Misyon",
    description:
      "Gerçek zamanlı transkript, duygu analizi ve performans skorlamayı tek ekranda birleştirerek mülakat değerlendirmelerini veri odaklı hale getirmek.",
  },
  {
    title: "Vizyon",
    description:
      "Yapay zekâ destekli görüşme deneyimini standartlaştırarak daha adil, izlenebilir ve kapsayıcı işe alım süreçleri oluşturmak.",
  },
];

const stats = [
  { label: "Mülakat", value: "142" },
  { label: "Ort. Skor", value: "7.8" },
  { label: "Pozitif", value: "68%" },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#120733] text-white">
      <section className="relative min-h-screen bg-[radial-gradient(circle_at_80%_20%,rgba(124,58,237,0.35),transparent_30%),linear-gradient(135deg,#120733_0%,#1b0b45_48%,#2f0f73_100%)]">
        <div className="absolute inset-x-0 top-0 border-b border-white/10 bg-white/[0.02] backdrop-blur-sm">
          <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
            <Link href="/" className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500 shadow-lg shadow-violet-500/30">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </span>
              <span className="text-lg font-bold tracking-tight">AI Mülakat Asistanı</span>
            </Link>

            <nav className="hidden items-center gap-10 text-sm font-semibold text-white/60 md:flex">
              {infoSections.map((section) => (
                <a key={section.title} href={`#${section.title}`} className="transition hover:text-white">
                  {section.title}
                </a>
              ))}
            </nav>

            <div className="flex items-center gap-3">
              <Link href="/login" className="hidden rounded-2xl px-5 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white sm:inline-flex">
                Giriş Yap
              </Link>
              <Link href="/signup" className="rounded-2xl bg-white px-5 py-2.5 text-sm font-bold text-violet-800 shadow-xl shadow-violet-950/20 transition hover:bg-violet-50">
                Kayıt Ol
              </Link>
            </div>
          </header>
        </div>

        <div className="mx-auto grid min-h-screen max-w-7xl items-center gap-16 px-6 pb-20 pt-36 lg:grid-cols-[1fr,0.95fr] lg:px-10">
          <div className="max-w-2xl">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-violet-100">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              AI Mülakat Asistanı
            </div>
            <h1 className="text-5xl font-black leading-tight tracking-tight md:text-6xl lg:text-7xl">
              Gerçek zamanlı yapay zekâ destekli mülakat analiz sistemi
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-violet-100/80">
              Doğal dil işleme, duygu analizi ve performans skorlamayı tek ekranda birleştirerek insan kaynakları ekiplerine güçlü içgörüler sunuyoruz.
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Link href="/login" className="inline-flex items-center justify-center gap-3 rounded-2xl bg-white px-8 py-4 text-sm font-bold text-violet-900 shadow-2xl shadow-black/20 transition hover:-translate-y-0.5 hover:bg-violet-50">
                Giriş Yap
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <Link href="/signup" className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-8 py-4 text-sm font-bold text-white transition hover:bg-white/10">
                Kayıt Ol
              </Link>
            </div>
          </div>

          <div className="relative hidden lg:block">
            <div className="absolute -right-6 top-6 z-20 rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-bold text-white shadow-2xl backdrop-blur-xl">
              <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs">✓</span>
              Güvenli & Şifreli
            </div>
            <div className="absolute -left-8 top-36 z-20 rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-sm font-semibold text-white shadow-2xl backdrop-blur-xl">
              ⚡ AI Destekli
            </div>
            <div className="absolute -bottom-6 left-0 z-20 rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-sm font-semibold text-white shadow-2xl backdrop-blur-xl">
              📊 Gerçek zamanlı analiz
            </div>

            <div className="rounded-[2rem] border border-white/15 bg-white/10 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
              <div className="rounded-[1.5rem] bg-[#0f0829] p-7">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500 text-lg font-black">AI</div>
                  <div>
                    <h2 className="font-bold">AI Mülakat Asistanı</h2>
                    <p className="text-sm text-white/50">Canlı analiz paneli</p>
                  </div>
                </div>
                <div className="mt-8 space-y-3">
                  <div className="h-3 w-4/5 rounded-full bg-white/15" />
                  <div className="h-3 w-full rounded-full bg-white/15" />
                  <div className="h-3 w-3/4 rounded-full bg-white/15" />
                </div>
                <div className="mt-8 grid grid-cols-3 gap-4">
                  {stats.map((item) => (
                    <div key={item.label} className="rounded-2xl border border-white/10 bg-white/10 p-5 text-center">
                      <div className="text-2xl font-black">{item.value}</div>
                      <div className="mt-1 text-xs font-semibold text-white/50">{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 px-6 py-20 text-slate-900 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3">
          {infoSections.map((section) => (
            <article key={section.title} id={section.title} className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm shadow-slate-200/70">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">✦</div>
              <h2 className="text-xl font-black">{section.title}</h2>
              <p className="mt-4 leading-7 text-slate-600">{section.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
