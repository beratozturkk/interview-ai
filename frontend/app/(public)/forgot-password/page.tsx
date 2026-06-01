"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setSuccess(true);
    } catch {
      setError("Bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8">
        <Link href="/" className="flex items-center gap-3 font-black text-slate-950">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-500/20">✦</span>
          AI Mülakat Asistanı
        </Link>
        <Link href="/login" className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-100">
          Giriş Yap
        </Link>
      </header>

      <main className="flex min-h-[calc(100vh-112px)] items-center justify-center px-6 pb-14">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/80">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">?</div>
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-violet-600">Şifre Kurtarma</p>
            <h1 className="mt-3 text-3xl font-black text-slate-950">Şifreni sıfırla</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">E-posta adresini gir; şifre sıfırlama bağlantısını sana gönderelim.</p>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-5">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert className="mb-5 border-emerald-200 bg-emerald-50 text-emerald-800">
              <AlertDescription>Şifre sıfırlama linki e-posta adresinize gönderildi.</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleResetPassword} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">E-posta adresi</label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="ornek@sirket.com" className="h-12 rounded-2xl border-slate-200 bg-slate-50" />
            </div>
            <Button type="submit" disabled={loading} className="h-12 w-full rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-500/20 hover:opacity-95">
              {loading ? "Gönderiliyor..." : "Sıfırlama Linki Gönder"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Hatırladın mı? <Link href="/login" className="font-bold text-violet-700">Girişe dön</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
