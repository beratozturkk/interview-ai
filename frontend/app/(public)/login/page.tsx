"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginType, setLoginType] = useState<"user" | "admin">("user");
  
  // Supabase yapılandırmasını kontrol et
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const isSupabaseConfigured = supabaseUrl && supabaseAnonKey && supabaseAnonKey !== "your-anon-key-here";
  const DEFAULT_ADMIN_EMAILS = ["berattozturk6@gmail.com"];
  const rawEnvAdmins = process.env.NEXT_PUBLIC_ADMIN_EMAILS;
  const ADMIN_EMAILS = (
    rawEnvAdmins && rawEnvAdmins.trim().length > 0
      ? rawEnvAdmins.split(",")
      : DEFAULT_ADMIN_EMAILS
  )
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const router = useRouter();

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        console.error("Supabase giriş hatası:", signInError);
        // Network/Fetch hatası kontrolü
        if (signInError.message?.includes("Failed to fetch") || signInError.message?.includes("NetworkError") || signInError.status === 0) {
          setError(
            "Bağlantı hatası: Supabase servisine bağlanılamıyor. " +
            "Lütfen internet bağlantınızı kontrol edin veya daha sonra tekrar deneyin. " +
            "Eğer sorun devam ederse, Supabase URL ve API key yapılandırmanızı kontrol edin."
          );
        } else if (signInError.message.includes("Email not confirmed") || signInError.message.includes("email_not_confirmed")) {
          setError("E-posta adresiniz doğrulanmamış. Lütfen e-postanızı kontrol edin veya yeni doğrulama e-postası gönderin.");
        } else if (signInError.message.includes("Invalid login credentials") || signInError.message.includes("invalid_credentials")) {
          setError(
            "E-posta veya şifre hatalı. " +
            "Eğer şifrenizi unuttuysanız 'Şifremi Unuttum' linkini kullanabilirsiniz. " +
            "Kullanıcınız Google ile kayıt olmuşsa 'Google ile Giriş Yap' butonunu kullanın."
          );
        } else {
          setError(signInError.message || "Giriş yapılırken bir hata oluştu.");
        }
        setLoading(false);
        return;
      }

      const userEmail = data.user?.email?.toLowerCase() ?? "";
      const metadataRole =
        typeof data.user?.user_metadata?.role === "string"
          ? data.user.user_metadata.role.toLowerCase()
          : undefined;
      const appMetadataRoles = Array.isArray(data.user?.app_metadata?.roles)
        ? data.user.app_metadata.roles.map((role: string) => role.toLowerCase())
        : [];

      let dbAdminMatch = false;
      if (loginType === "admin") {
        try {
          const { data: adminRecord, error: adminError } = await supabase
            .from("admins")
            .select("email")
            .eq("email", userEmail)
            .maybeSingle();

          if (adminError && adminError.code !== "PGRST116") {
            console.warn("Admin kontrolü sırasında hata:", adminError.message);
          }

          dbAdminMatch = !!adminRecord;
        } catch (dbError) {
          console.warn("Admin tablosu kontrol edilirken hata oluştu:", dbError);
        }
      }

      const isAdminUser =
        ADMIN_EMAILS.includes(userEmail) ||
        metadataRole === "admin" ||
        appMetadataRoles.includes("admin") ||
        dbAdminMatch;

      if (loginType === "admin") {
        if (!isAdminUser) {
          setError(
            "Giriş başarısız. Bu hesap admin olarak yetkilendirilmemiş."
          );
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }
      }

      const targetPath = loginType === "admin" ? "/dashboard" : "/candidate-dashboard";

      if (data.user && data.session) {
        // Session'ın hazır olduğundan emin olalım
        // Kısa bir gecikme ile yönlendirme yapalım
        setTimeout(() => {
          window.location.href = targetPath;
        }, 100);
        // window.location.href kullanıldığı için loading state'i sıfırlamaya gerek yok
        return;
      } else if (data.user) {
        // Session henüz hazır değilse biraz bekleyelim
        let attempts = 0;
        const maxAttempts = 10;
        
        const interval = setInterval(async () => {
          attempts++;
          const { data: { session } } = await supabase.auth.getSession();
          
          if (session) {
            clearInterval(interval);
            window.location.href = targetPath;
          } else if (attempts >= maxAttempts) {
            clearInterval(interval);
            setError("Giriş yapıldı ancak oturum başlatılamadı. Lütfen tekrar deneyin.");
            setLoading(false);
          }
        }, 200);
        
        // Interval temizlenene kadar loading state'i koru
        return;
      } else {
        setError("Giriş başarısız. Lütfen tekrar deneyin.");
        setLoading(false);
      }
    } catch (err: any) {
      console.error("Giriş hatası:", err);
      // Network hatası kontrolü
      if (err?.message?.includes("Failed to fetch") || err?.message?.includes("NetworkError") || err?.code === "ECONNREFUSED") {
        setError(
          "Bağlantı hatası: Supabase servisine bağlanılamıyor. " +
          "Lütfen internet bağlantınızı kontrol edin veya daha sonra tekrar deneyin. " +
          "Eğer sorun devam ederse, Supabase yapılandırmanızı kontrol edin."
        );
      } else if (err?.message) {
        setError(`Hata: ${err.message}`);
      } else {
        setError("Bir hata oluştu. Lütfen tekrar deneyin.");
      }
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!email) {
      setError("Lütfen e-posta adresinizi girin.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      });

      if (resendError) {
        setError(resendError.message);
      } else {
        setSuccessMessage("Doğrulama e-postası gönderildi! Lütfen e-postanızı kontrol edin.");
      }
    } catch (err) {
      setError("E-posta gönderilirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
  setError(null);
  setSuccessMessage(null);
  setLoading(true);

  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
  } catch (err) {
    console.error("Google giriş hatası:", err);
    setError("Google ile giriş yapılırken bir hata oluştu.");
    setLoading(false);
  }
};

  return (
    <div className="min-h-screen bg-slate-50 grid lg:grid-cols-[0.9fr,1.4fr]">
      <aside className="hidden lg:flex relative overflow-hidden bg-[#16083f] text-white p-12 flex-col justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.42),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(124,58,237,0.34),transparent_34%)]" />
        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="h-10 w-10 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-900/40">
              <span className="text-sm font-bold">AI</span>
            </span>
            <span className="text-xl font-bold">AI Mülakat Asistanı</span>
          </Link>
        </div>

        <div className="relative z-10 max-w-md space-y-8">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-violet-200/70 font-semibold">
              Yapay zekâ destekli
            </p>
            <h1 className="mt-6 text-4xl font-bold leading-tight">
              Mülakat bir üst seviyeye taşı
            </h1>
            <p className="mt-6 text-base leading-7 text-violet-100/75">
              Gerçek zamanlı transkript, duygu analizi ve AI destekli soru önerileriyle mülakat sürecinizi modernleştirin.
            </p>
          </div>

          <div className="space-y-4 text-sm text-violet-100/80">
            {["Gerçek zamanlı AI transkripti", "Duygu & performans analizi", "Otomatik raporlama sistemi"].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <span className="h-6 w-6 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-violet-200">
                  ✓
                </span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-sm text-violet-200/50">© 2026 AI Mülakat Asistanı</p>
      </aside>

      <main className="min-h-screen flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8">
            <Link href="/" className="inline-flex items-center gap-3">
              <span className="h-10 w-10 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center text-white">
                AI
              </span>
              <span className="text-xl font-bold text-slate-950">AI Mülakat Asistanı</span>
            </Link>
          </div>

          <form onSubmit={handleLogin} className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/70 p-8 space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-slate-950">Hesabınıza girin</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Gerçek zamanlı yapay zekâ destekli mülakat analiz sistemi
              </p>
            </div>

            <div className="rounded-2xl bg-slate-100 p-1 grid grid-cols-2 text-sm font-semibold">
              <button
                type="button"
                onClick={() => setLoginType("user")}
                disabled={loading}
                className={`rounded-xl px-4 py-3 transition ${
                  loginType === "user" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Kullanıcı Girişi
              </button>
              <button
                type="button"
                onClick={() => setLoginType("admin")}
                disabled={loading}
                className={`rounded-xl px-4 py-3 transition ${
                  loginType === "admin" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Admin Girişi
              </button>
            </div>

            {!isSupabaseConfigured && (
              <Alert variant="destructive">
                <AlertDescription>
                  Supabase yapılandırması eksik. NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY değerlerini kontrol edin.
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>
                  <div className="space-y-2">
                    <p>{error}</p>
                    {error.includes("doğrulanmamış") && (
                      <button type="button" onClick={handleResendConfirmation} className="text-sm underline">
                        Yeni doğrulama e-postası gönder
                      </button>
                    )}
                    {error.includes("E-posta veya şifre hatalı") && (
                      <Link href="/forgot-password" className="block text-sm underline">
                        Şifremi Unuttum
                      </Link>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {successMessage && (
              <Alert className="bg-emerald-50 border-emerald-200 text-emerald-800">
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">E-posta adresi</label>
              <Input
                type="email"
                placeholder="ornek@sirket.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="h-12 rounded-2xl bg-slate-50 border-slate-200"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Şifre</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="h-12 rounded-2xl bg-slate-50 border-slate-200"
              />
              <div className="flex justify-end">
                <Link href="/forgot-password" className="text-sm font-medium text-violet-600 hover:text-violet-700">
                  Şifremi Unuttum
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button
                type="submit"
                disabled={loading}
                className={`${loginType === "admin" ? "col-span-2" : ""} h-12 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-500/20 hover:opacity-95`}
              >
                {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
              </Button>

              {loginType === "user" && (
                <Link href="/signup" className="block">
                  <Button type="button" variant="outline" className="w-full h-12 rounded-2xl border-slate-200">
                    Kayıt Ol
                  </Button>
                </Link>
              )}
            </div>

            {loginType === "user" && (
              <>
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="bg-white px-3 text-slate-400">veya</span>
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  variant="outline"
                  className="w-full h-12 rounded-2xl border-slate-200"
                >
                  Google ile Giriş Yap
                </Button>
              </>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}
