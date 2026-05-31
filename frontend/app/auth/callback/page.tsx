"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const checkUserAndRedirect = async (user: any) => {
      if (!user) return;

      // Kullanıcının admin olup olmadığını kontrol et
      const userEmail = user.email?.toLowerCase() ?? "";
      const DEFAULT_ADMIN_EMAILS = ["berattozturk6@gmail.com"];
      const rawEnvAdmins = process.env.NEXT_PUBLIC_ADMIN_EMAILS;
      const ADMIN_EMAILS = (
        rawEnvAdmins && rawEnvAdmins.trim().length > 0
          ? rawEnvAdmins.split(",")
          : DEFAULT_ADMIN_EMAILS
      )
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

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

      // Kullanıcı tipine göre yönlendir
      const targetPath = isAdminUser ? "/dashboard" : "/candidate-dashboard";
      router.replace(targetPath);
    };

    // Auth state değişikliklerini dinle
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        await checkUserAndRedirect(session.user);
      } else if (event === "SIGNED_OUT") {
        router.replace("/login");
      } else if (event === "TOKEN_REFRESHED" && session?.user) {
        // Token yenilendiğinde de kontrol et
        await checkUserAndRedirect(session.user);
      }
    });

    // Mevcut session'ı kontrol et (sayfa yenilendiğinde veya direkt erişildiğinde)
   const handleAuthCallback = async () => {
      const code = searchParams.get("code");

      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          console.error("Code exchange hatası:", error.message);
          router.replace("/login?error=auth_callback_failed");
          return;
        }

        if (data.session?.user) {
          await checkUserAndRedirect(data.session.user);
          return;
        }
      }

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

      router.replace("/login");
    };

    handleAuthCallback();

    // Cleanup: subscription'ı temizle
    return () => {
      subscription.unsubscribe();
    };
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-400 via-purple-500 to-purple-700">
      <div className="text-white text-lg">Giriş doğrulanıyor...</div>
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-400 via-purple-500 to-purple-700">
        <div className="text-white text-lg">Giriş doğrulanıyor...</div>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}

