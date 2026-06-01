"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { ensureProfile } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (password !== confirmPassword) {
      setError("Şifreler eşleşmiyor.");
      return;
    }

    if (password.length < 6) {
      setError("Şifre en az 6 karakter olmalıdır.");
      return;
    }

    setLoading(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (data.user) {
        if (!data.session) {
          setSuccessMessage("Kayıt başarılı! Lütfen e-postanızı kontrol edin ve doğrulama linkine tıklayın.");
        } else {
          await ensureProfile(data.user);
          router.push("/candidate-dashboard");
        }
      }
    } catch {
      setError("Bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell min-h-screen bg-slate-50">
      <aside className="auth-brand-panel relative hidden overflow-hidden bg-[#18084a] p-10 text-white lg:flex lg:w-[42%] lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(168,85,247,0.38),transparent_30%),linear-gradient(145deg,#120733,#2f0f73)]" />
        <div className="relative z-10 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500 shadow-lg shadow-violet-500/30">✦</span>
          <span className="text-xl font-black">AI Mülakat Asistanı</span>
        </div>
        <div className="relative z-10 max-w-md">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-violet-200/70">Yapay zekâ destekli</p>
          <h1 className="mt-6 text-5xl font-black leading-tight">Mülakat deneyimini bir üst seviyeye taşı</h1>
          <p className="mt-6 text-lg leading-8 text-violet-100/75">Hesabını oluştur, planlanan mülakatlarını takip et ve görüşme sürecine tek panelden katıl.</p>
        </div>
        <p className="relative z-10 text-sm text-white/40">© 2026 AI Mülakat Asistanı</p>
      </aside>

      <main className="flex min-h-screen flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/80">
          <div className="mb-8">
            <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-violet-700 lg:hidden">✦ AI Mülakat Asistanı</Link>
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-violet-600">Yeni Hesap</p>
            <h1 className="mt-3 text-3xl font-black text-slate-950">Hesabını oluştur</h1>
            <p className="mt-2 text-slate-500">Aday paneline erişmek için kayıt bilgilerini gir.</p>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-5">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {successMessage && (
            <Alert className="mb-5 border-emerald-200 bg-emerald-50 text-emerald-800">
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSignup} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">E-posta adresi</label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="ornek@sirket.com" className="h-12 rounded-2xl border-slate-200 bg-slate-50" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Şifre</label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required placeholder="En az 6 karakter" className="h-12 rounded-2xl border-slate-200 bg-slate-50" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Şifre tekrar</label>
              <Input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type="password" required placeholder="Şifreni tekrar gir" className="h-12 rounded-2xl border-slate-200 bg-slate-50" />
            </div>
            <Button type="submit" disabled={loading} className="h-12 w-full rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-500/20 hover:opacity-95">
              {loading ? "Kayıt oluşturuluyor..." : "Kayıt Ol"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Zaten hesabın var mı? <Link href="/login" className="font-bold text-violet-700 hover:text-violet-900">Giriş Yap</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
