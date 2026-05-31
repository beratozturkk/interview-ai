"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "@/lib/auth";
import {
  fetchInterviewReports,
  fetchPastInterviews,
  fetchTranscriptSegments,
  fetchUpcomingInterviews,
  InterviewRecord,
  InterviewReportRecord,
  TranscriptSegmentRecord,
} from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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

export default function CandidateDashboardPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [upcomingInterviews, setUpcomingInterviews] = useState<InterviewRecord[]>([]);
  const [pastInterviews, setPastInterviews] = useState<InterviewRecord[]>([]);
  const [reportMap, setReportMap] = useState<Record<string, InterviewReportRecord>>({});
  const [recentTranscript, setRecentTranscript] = useState<TranscriptSegmentRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

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

      const reportList = await fetchInterviewReports(past.map((item) => item.id));
      const nextReportMap: Record<string, InterviewReportRecord> = {};
      reportList.forEach((report) => {
        nextReportMap[report.interview_id] = report;
      });
      setReportMap(nextReportMap);

      const completed = past.find((item) => item.status === "completed") ?? past[0];
      if (completed) {
        const transcriptSegments = await fetchTranscriptSegments(completed.id, 8);
        setRecentTranscript(transcriptSegments.reverse());
      } else {
        setRecentTranscript([]);
      }

      setDataLoading(false);
    };

    loadData();
  }, [user, loading]);

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-lg text-gray-700">Yukleniyor...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-purple-500 font-semibold">Aday Paneli</p>
            <h1 className="text-3xl font-bold text-gray-900 mt-2">Hos geldin, {user?.email}</h1>
            <p className="text-gray-600 mt-2">Mülakat takvimini, raporlarını ve kayıtlarını buradan takip edebilirsin.</p>
          </div>
          <Button variant="outline" onClick={handleLogout} className="border-gray-300 text-gray-700">
            Cikis Yap
          </Button>
        </div>

        <Card className="p-6 bg-white shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">Yaklasan Mülakat</h2>
          {dataLoading ? (
            <p className="text-sm text-gray-500 mt-4">Veriler yukleniyor...</p>
          ) : nextInterview ? (
            <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-wider text-purple-500 font-semibold">{nextInterview.title || "Teknik Mülakat"}</p>
                <p className="text-lg font-semibold text-gray-900 mt-2">{formatDateTime(nextInterview.scheduled_at)}</p>
                <p className="text-sm text-gray-500 mt-1">Durum: {nextInterview.status}</p>
                {nextInterview.meeting_url && (
                  <a
                    href={nextInterview.meeting_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-purple-600 underline mt-2 inline-block"
                  >
                    Gorüsme linki
                  </a>
                )}
              </div>
              <Button
                onClick={() => router.push("/interview-info")}
                className="bg-purple-600 hover:bg-purple-700 text-white px-6"
              >
                Mülakat Oncesi Hazirlik
              </Button>
            </div>
          ) : (
            <p className="text-sm text-gray-500 mt-4">Planli bir mülakat gorunmuyor.</p>
          )}
        </Card>

        <div className="grid lg:grid-cols-[1.2fr,0.8fr] gap-6">
          <Card className="p-6 bg-white">
            <h2 className="text-lg font-semibold text-gray-900">Gecmis Mülakatlar ve Raporlar</h2>
            <div className="mt-4 space-y-3">
              {dataLoading ? (
                <p className="text-sm text-gray-500">Yukleniyor...</p>
              ) : pastInterviews.length === 0 ? (
                <p className="text-sm text-gray-500">Henuz tamamlanmis mulakat yok.</p>
              ) : (
                pastInterviews.map((interview) => {
                  const report = reportMap[interview.id];
                  return (
                    <div key={interview.id} className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3">
                      <div>
                        <p className="font-semibold text-gray-900">{interview.title || "Mülakat"}</p>
                        <p className="text-sm text-gray-500">{formatDateTime(interview.scheduled_at)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-500">Skor</p>
                        <p className="text-lg font-semibold text-purple-600">
                          {report?.overall_score ?? "-"}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          <Card className="p-6 bg-white">
            <h2 className="text-lg font-semibold text-gray-900">Son Transkriptler</h2>
            <div className="mt-4 space-y-3 max-h-72 overflow-y-auto">
              {dataLoading ? (
                <p className="text-sm text-gray-500">Yukleniyor...</p>
              ) : recentTranscript.length === 0 ? (
                <p className="text-sm text-gray-500">Kayitli transkript bulunamadi.</p>
              ) : (
                recentTranscript.map((segment) => (
                  <div key={segment.id} className="text-sm text-gray-700 border-b border-gray-100 pb-2">
                    <span className="text-purple-600 font-medium">{segment.speaker_role}</span>
                    <p className="mt-1">{segment.content}</p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
