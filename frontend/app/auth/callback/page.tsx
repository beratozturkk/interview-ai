"use client";

import { useEffect, Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasHandledCallback = useRef(false);
  const [message, setMessage] = useState("Giriş doğrulanıyor...");

  useEffect(() => {
    if (hasHandledCallback.current) return;
    hasHandledCallback.current = true;

    const checkUserAndRedirect = async (user: any) => {
      if (!user) {
        router.replace("/login?error=no_user");
        return;
      }

      const userEmail = user.email?.toLowerCase() ?? "";

      const ADMIN_EMAILS = ["berattozturk6@gmail.com"];

      const metadataRole =
        typeof user.user_metadata?.role === "string"
          ? user.user_metadata.role.toLowerCase()
          : undefined;

      const appMetadataRoles = Array.isArray(user.app_metadata?.roles)
        ? user.app_metadata.roles.map((role: string) => role.toLowerCase())
        : [];

      let dbAdminMatch = false;

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

      const isAdminUser =
        ADMIN_EMAILS.includes(userEmail) ||
        metadataRole === "admin" ||
        appMetadataRoles.includes("admin") ||
        dbAdminMatch;

      const targetPath = isAdminUser ? "/dashboard" : "/candidate-dashboard";

      router.replace(targetPath);
    };

    const handleAuthCallback = async () => {
      try {
        const code = searchParams.get("code");

        if (code) {
          setMessage("Oturum oluşturuluyor...");

          const { data, error } = await supabase.auth.exchangeCodeForSession(
            code
          );

          if (error) {
            console.error("Code exchange hatası:", error.message);
            setMessage(`Giriş hatası: ${error.message}`);
            return;
          }

          if (data.session?.user) {
            await checkUserAndRedirect(data.session.user);
            return;
          }
        }

        setMessage("Oturum kontrol ediliyor...");

        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("Session kontrolü hatası:", error.message);
          router.replace("/login?error=auth_failed");
          return;
        }

        if (session?.user) {
          await checkUserAndRedirect(session.user);
          return;
        }

        router.replace("/login?error=no_session");
      } catch (error) {
        console.error("Callback genel hata:", error);
        router.replace("/login?error=callback_unexpected_error");
      }
    };

    handleAuthCallback();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-400 via-purple-500 to-purple-700">
      <div className="text-white text-lg">{message}</div>
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-400 via-purple-500 to-purple-700">
          <div className="text-white text-lg">Giriş doğrulanıyor...</div>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}