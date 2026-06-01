"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import {
  fetchPastInterviews,
  fetchUpcomingInterviews,
  InterviewRecord,
} from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const formatDateTime = (value?: string | null) => {
  if (!value) return "Tarih belirlenmedi";
  const date = new Date(value);
  return date.toLocaleString("tr-TR", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getStatusLabel = (status?: string | null) => {
  switch (status) {
    case "scheduled":
      return "Planlandı";
    case "in_progress":
      return "Devam ediyor";
    case "completed":
      return "Tamamlandı";
    case "canceled":
      return "İptal edildi";
    default:
      return status || "-";
  }
};

export default function CandidateDashboardPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [upcomingInterviews, setUpcomingInterviews] = useState<InterviewRecord[]>([]);
  const [pastInterviews, setPastInterviews] = useState<InterviewRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [incomingInterview, setIncomingInterview] = useState<InterviewRecord | null>(null);

  const nextInterview = useMemo(() => upcomingInterviews[0], [upcomingInterviews]);

  useEffect(() => {
    if (!user || loading) return;

    const loadData = async () => {
      setDataLoading(true);

      const [upcoming, past] = await Promise.all([
        fetchUpcomingInterviews(user.id, false),
        fetchPastInterviews(user.id, false),
      ]);

      setUpcomingInterviews(upcoming);
      setPastInterviews(past);
      setDataLoading(false);
    };

    loadData();
  }, [user, loading]);

  useEffect(() => {
    if (!user || loading) return;

    const channel = supabase
      .channel(`candidate-interviews-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "interviews",
          filter: `candidate_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as InterviewRecord;

          if (updated.status === "in_progress") {
            setIncomingInterview(updated);
            setJoinDialogOpen(true);
          }

          setUpcomingInterviews((prev) => {
            const exists = prev.some((item) => item.id === updated.id);

            if (updated.status === "completed" || updated.status === "canceled") {
              return prev.filter((item) => item.id !== updated.id);
            }

            if (exists) {
              return prev.map((item) => (item.id === updated.id ? updated : item));
            }

            return [updated, ...prev];
          });

          if (updated.status === "completed" || updated.status === "canceled") {
            setPastInterviews((prev) => {
              const exists = prev.some((item) => item.id === updated.id);
              if (exists) {
                return prev.map((item) => (item.id === updated.id ? updated : item));
              }
              return [updated, ...prev];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loading]);

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
  };

  const handleJoinInterview = (interview: InterviewRecord) => {
    setJoinDialogOpen(false);
    router.push(`/interview?session=${interview.session_id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-lg text-gray-700">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-purple-500 font-semibold">Aday Paneli</p>
            <h1 className="text-3xl font-bold text-gray-900 mt-2">Hoş geldin, {user?.email}</h1>
            <p className="text-gray-600 mt-2">
              Mülakat takvimini ve görüşme durumunu buradan takip edebilirsin.
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout} className="border-gray-300 text-gray-700">
            Çıkış Yap
          </Button>
        </div>

        <Card className="p-6 bg-white shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">Yaklaşan Mülakat</h2>
          {dataLoading ? (
            <p className="text-sm text-gray-500 mt-4">Veriler yükleniyor...</p>
          ) : nextInterview ? (
            <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-wider text-purple-500 font-semibold">
                  {nextInterview.title || "Teknik Mülakat"}
                </p>
                <p className="text-lg font-semibold text-gray-900 mt-2">
                  {formatDateTime(nextInterview.scheduled_at)}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Durum: {getStatusLabel(nextInterview.status)}
                </p>
              </div>

              {nextInterview.status === "in_progress" ? (
                <Button
                  onClick={() => handleJoinInterview(nextInterview)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6"
                >
                  Mülakata Gir
                </Button>
              ) : (
                <Button disabled className="bg-purple-200 text-purple-700 px-6 cursor-not-allowed">
                  Yönetici başlatınca aktif
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 mt-4">Planlı bir mülakat görünmüyor.</p>
          )}
        </Card>

        <Card className="p-6 bg-white shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">Geçmiş Mülakatlar</h2>
          <p className="text-sm text-gray-500 mt-1">
            Mülakat raporları ve transkriptler yalnızca yönetici panelinde görüntülenir.
          </p>

          <div className="mt-5 space-y-3">
            {dataLoading ? (
              <p className="text-sm text-gray-500">Yükleniyor...</p>
            ) : pastInterviews.length === 0 ? (
              <p className="text-sm text-gray-500">Henüz tamamlanmış mülakat yok.</p>
            ) : (
              pastInterviews.map((interview) => (
                <div
                  key={interview.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border border-gray-200 rounded-lg px-4 py-3"
                >
                  <div>
                    <p className="font-semibold text-gray-900">{interview.title || "Mülakat"}</p>
                    <p className="text-sm text-gray-500">{formatDateTime(interview.scheduled_at)}</p>
                  </div>
                  <span className="text-sm text-gray-600 bg-gray-100 rounded-full px-3 py-1 w-fit">
                    {getStatusLabel(interview.status)}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>Mülakat başladı</DialogTitle>
            <DialogDescription>
              Yönetici görüşmeyi başlattı. Hazırsan hemen katılabilirsin.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                if (incomingInterview) {
                  handleJoinInterview(incomingInterview);
                } else {
                  setJoinDialogOpen(false);
                }
              }}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              Mülakata Gir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
