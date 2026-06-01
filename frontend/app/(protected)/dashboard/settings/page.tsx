"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabaseClient";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
    reports: true,
  });

  useEffect(() => {
    if (user?.email) {
      setEmail(user.email);
    }
  }, [user]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    if (newPassword !== confirmPassword) {
      setError("Yeni şifreler eşleşmiyor.");
      setLoading(false);
      return;
    }

    if (newPassword.length < 6) {
      setError("Şifre en az 6 karakter olmalıdır.");
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setError(updateError.message);
      } else {
        setSuccessMessage("Şifre başarıyla güncellendi.");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (err) {
      setError("Şifre güncellenirken bir hata oluştu.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    if (email === user?.email) {
      setError("E-posta adresi değişmedi.");
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({ email });
      if (updateError) {
        setError(updateError.message);
      } else {
        setSuccessMessage("E-posta adresi güncellendi. Lütfen yeni e-posta adresinizi doğrulayın.");
      }
    } catch (err) {
      setError("E-posta güncellenirken bir hata oluştu.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationChange = (key: keyof typeof notifications) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-lg">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-950">
      <aside className="sticky top-0 flex h-screen w-64 flex-col border-r border-white/10 bg-[#070b1a] text-slate-300">
        <div className="border-b border-white/10 p-6">
          <h1 className="text-2xl font-black text-white">AI Mülakat</h1>
        </div>
        <nav className="flex flex-1 flex-col p-4">
          <div className="flex-1 space-y-2">
            <button onClick={() => router.push("/dashboard")} className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-slate-300 transition hover:bg-white/10 hover:text-white">
              <span>▦</span>
              Panel
            </button>
            <button onClick={() => router.push("/dashboard/settings")} className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3 font-bold text-white shadow-lg shadow-violet-950/30">
              <span>⚙</span>
              Ayarlar
            </button>
          </div>
          <button onClick={handleLogout} className="mt-auto flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-red-300 transition hover:bg-red-500/10">
            <span>↪</span>
            Çıkış Yap
          </button>
        </nav>
      </aside>

      <main className="h-screen flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl p-8">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-600">Hesap Yönetimi</p>
              <h1 className="mt-2 text-3xl font-black text-slate-950">Ayarlar</h1>
              <p className="mt-2 text-slate-500">Hesap bilgilerinizi ve bildirim tercihlerinizi yönetin.</p>
            </div>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {successMessage && (
            <Alert className="mb-6 border-emerald-200 bg-emerald-50 text-emerald-800">
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-6">
            <Card className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm shadow-slate-200/70">
              <h2 className="text-xl font-black text-slate-950">Hesap Bilgileri</h2>
              <form onSubmit={handleEmailUpdate} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-posta Adresi</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} className="h-12 max-w-md rounded-2xl border-slate-200 bg-slate-50" />
                </div>
                <Button type="submit" disabled={loading || email === user?.email} className="rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 text-white shadow-lg shadow-violet-500/20 hover:opacity-95">
                  {loading ? "Güncelleniyor..." : "E-posta Adresini Güncelle"}
                </Button>
              </form>
            </Card>

            <Card className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm shadow-slate-200/70">
              <h2 className="text-xl font-black text-slate-950">Şifre Değiştir</h2>
              <form onSubmit={handlePasswordChange} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Yeni Şifre</Label>
                  <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={loading} placeholder="En az 6 karakter" className="h-12 max-w-md rounded-2xl border-slate-200 bg-slate-50" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Yeni Şifre Tekrar</Label>
                  <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={loading} placeholder="Yeni şifreyi tekrar girin" className="h-12 max-w-md rounded-2xl border-slate-200 bg-slate-50" />
                </div>
                <Button type="submit" disabled={loading || !newPassword || !confirmPassword} className="rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 text-white shadow-lg shadow-violet-500/20 hover:opacity-95">
                  {loading ? "Güncelleniyor..." : "Şifreyi Güncelle"}
                </Button>
              </form>
            </Card>

            <Card className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm shadow-slate-200/70">
              <h2 className="text-xl font-black text-slate-950">Bildirim Tercihleri</h2>
              <div className="mt-6 space-y-4">
                {([
                  ["email", "E-posta Bildirimleri", "Mülakat davetleri ve sistem duyuruları."],
                  ["push", "Anlık Bildirimler", "Tarayıcı üzerinden hızlı bilgilendirmeler."],
                  ["reports", "Rapor Bildirimleri", "Rapor oluşturulduğunda bilgilendirme."],
                ] as const).map(([key, title, description]) => (
                  <label key={key} className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
                    <span>
                      <span className="block font-bold text-slate-900">{title}</span>
                      <span className="mt-1 block text-sm text-slate-500">{description}</span>
                    </span>
                    <input type="checkbox" checked={notifications[key]} onChange={() => handleNotificationChange(key)} className="h-5 w-5 accent-violet-600" />
                  </label>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
