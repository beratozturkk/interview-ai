"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useEffect, useMemo, useState } from "react";
import {
  createInterview,
  fetchInterviewReports,
  fetchPastInterviews,
  fetchProfiles,
  fetchUpcomingInterviews,
  InterviewRecord,
  InterviewReportRecord,
  ProfileRecord,
} from "@/lib/db";

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [upcomingInterviews, setUpcomingInterviews] = useState<InterviewRecord[]>([]);
  const [pastInterviews, setPastInterviews] = useState<InterviewRecord[]>([]);
  const [reportMap, setReportMap] = useState<Record<string, InterviewReportRecord>>({});
  const [candidateProfiles, setCandidateProfiles] = useState<ProfileRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [scheduleForm, setScheduleForm] = useState({
    candidateId: "",
    scheduledAt: "",
    title: "",
    meetingUrl: "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
  };

  useEffect(() => {
    if (!user || loading) return;

    const loadData = async () => {
      setDataLoading(true);
      const [profiles, upcoming, past] = await Promise.all([
        fetchProfiles(),
        fetchUpcomingInterviews(user.id, true),
        fetchPastInterviews(user.id, true),
      ]);

      const reportList = await fetchInterviewReports(past.map((item) => item.id));
      const nextReportMap: Record<string, InterviewReportRecord> = {};
      reportList.forEach((report) => {
        nextReportMap[report.interview_id] = report;
      });

      setCandidateProfiles(profiles.filter((profile) => profile.role !== "admin"));
      setUpcomingInterviews(upcoming);
      setPastInterviews(past);
      setReportMap(nextReportMap);
      setDataLoading(false);
    };

    loadData();
  }, [user, loading]);

  const candidateEmailMap = useMemo(() => {
    const map: Record<string, string> = {};
    candidateProfiles.forEach((profile) => {
      if (profile.user_id && profile.email) {
        map[profile.user_id] = profile.email;
      }
    });
    return map;
  }, [candidateProfiles]);

  const metrics = useMemo(() => {
    const allInterviews = [...upcomingInterviews, ...pastInterviews];
    const totalInterviews = allInterviews.length;
    const reportValues = Object.values(reportMap);
    const completedReports = reportValues.length;
    const avgScore = reportValues.length
      ? reportValues.reduce((sum, report) => sum + (report.overall_score ?? 0), 0) / reportValues.length
      : 0;
    const avgPositive = reportValues.length
      ? reportValues.reduce((sum, report) => sum + (report.sentiment?.positive ?? 0), 0) / reportValues.length
      : 0;

    return {
      totalInterviews,
      avgScore: avgScore ? avgScore.toFixed(1) : "0",
      positiveRate: avgPositive ? Math.round(avgPositive) : 0,
      completedReports,
    };
  }, [upcomingInterviews, pastInterviews, reportMap]);

  const metricCards = useMemo(
    () => [
      {
        title: "Toplam Mülakat",
        value: metrics.totalInterviews.toString(),
        accent: "text-purple-600",
        icon: (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        ),
      },
      {
        title: "Ortalama Aday Skoru",
        value: metrics.avgScore,
        accent: "text-purple-600",
        icon: (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        ),
      },
      {
        title: "Pozitif Duygu Oranı",
        value: `${metrics.positiveRate}%`,
        accent: "text-green-600",
        icon: (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        ),
      },
      {
        title: "Tamamlanan Raporlar",
        value: metrics.completedReports.toString(),
        accent: "text-purple-600",
        icon: (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
    ],
    [metrics]
  );

  const handleScheduleChange = (field: keyof typeof scheduleForm, value: string) => {
    setScheduleForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleScheduleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;

    setFormError(null);
    setFormSuccess(null);

    if (!scheduleForm.candidateId || !scheduleForm.scheduledAt) {
      setFormError("Lutfen aday ve tarih alanlarini doldurun.");
      return;
    }

    const sessionId = crypto.randomUUID();
    const scheduledAtIso = new Date(scheduleForm.scheduledAt).toISOString();
    const created = await createInterview({
      candidateId: scheduleForm.candidateId,
      interviewerId: user.id,
      scheduledAt: scheduledAtIso,
      title: scheduleForm.title || undefined,
      meetingUrl: scheduleForm.meetingUrl || undefined,
      sessionId,
    });

    if (!created) {
      setFormError("Mülakat olusturulamadi. Lutfen tekrar deneyin.");
      return;
    }

    setFormSuccess("Mülakat basariyla planlandi.");
    setScheduleForm({
      candidateId: "",
      scheduledAt: "",
      title: "",
      meetingUrl: "",
    });

    const upcoming = await fetchUpcomingInterviews(user.id, true);
    setUpcomingInterviews(upcoming);
  };

  const graphData = useMemo(() => {
    const values = Array(7).fill(0);
    const now = new Date();

    pastInterviews.forEach((interview) => {
      if (!interview.scheduled_at) return;
      const date = new Date(interview.scheduled_at);
      const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays < 7) {
        values[6 - diffDays] += 1;
      }
    });

    return values;
  }, [pastInterviews]);

  const recentSessions = useMemo(() => {
    return pastInterviews.slice(0, 5).map((interview) => {
      const report = reportMap[interview.id];
      const score = report?.overall_score ?? 0;

      return {
        id: interview.id,
        name: candidateEmailMap[interview.candidate_id ?? ""] || "Aday",
        date: interview.scheduled_at ? new Date(interview.scheduled_at).toLocaleDateString("tr-TR") : "-",
        score: score ? `${score}/100` : "-",
        recommendation: score >= 80 ? "Güçlü Aday" : score >= 60 ? "İkinci Görüşme" : "Uygun Değil",
        status: score >= 80 ? "success" : score >= 60 ? "warning" : "error",
      };
    });
  }, [pastInterviews, reportMap, candidateEmailMap]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-lg">Yükleniyor...</div>
      </div>
    );
  }

  const maxValue = Math.max(...graphData, 1);
  const graphHeight = 200;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col sticky top-0 h-screen">
        {/* Logo */}
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-purple-600">AI Mülakat</h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 flex flex-col">
          <div className="space-y-2 flex-1 overflow-y-auto">
            <a
              href="#"
              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-purple-50 text-purple-600 font-medium"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              Panel
            </a>
            <button
              onClick={() => router.push("/dashboard/settings")}
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Ayarlar
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="mt-auto flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 w-full border-t border-gray-200 pt-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Çıkış Yap
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 h-screen overflow-y-auto">
        <div className="p-8">
          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Yönetim Paneli</h1>
              <p className="text-gray-600">Tekrar hoş geldiniz! İşte mülakat analizleriniz.</p>
            </div>
            <Button
              onClick={() => router.push("/interview-admin")}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              Yeni Mülakat Başlat
            </Button>
          </div>

          <Card className="p-6 bg-white mb-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Mülakat Planla</h2>
                <p className="text-sm text-gray-600">Adaylar icin yeni mülakat tarihi olusturun.</p>
              </div>
              {formSuccess && <span className="text-sm text-green-600">{formSuccess}</span>}
            </div>

            {formError && <p className="text-sm text-red-600 mt-3">{formError}</p>}

            <form onSubmit={handleScheduleSubmit} className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-1">
                <label className="text-xs text-gray-500">Aday</label>
                <select
                  value={scheduleForm.candidateId}
                  onChange={(event) => handleScheduleChange("candidateId", event.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  disabled={dataLoading}
                >
                  <option value="">Aday secin</option>
                  {candidateProfiles.map((profile) => (
                    <option key={profile.user_id} value={profile.user_id}>
                      {profile.email || profile.user_id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-1">
                <label className="text-xs text-gray-500">Tarih</label>
                <input
                  type="datetime-local"
                  value={scheduleForm.scheduledAt}
                  onChange={(event) => handleScheduleChange("scheduledAt", event.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-1">
                <label className="text-xs text-gray-500">Baslik</label>
                <input
                  type="text"
                  value={scheduleForm.title}
                  onChange={(event) => handleScheduleChange("title", event.target.value)}
                  placeholder="Teknik Mülakat"
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-1">
                <label className="text-xs text-gray-500">Görüsme Linki</label>
                <input
                  type="text"
                  value={scheduleForm.meetingUrl}
                  onChange={(event) => handleScheduleChange("meetingUrl", event.target.value)}
                  placeholder="https://meet.google.com/..."
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-4 flex justify-end">
                <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white">
                  Mülakat Planla
                </Button>
              </div>
            </form>
          </Card>

          {/* Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {metricCards.map((metric, index) => (
              <Card key={index} className="p-6 bg-white">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-purple-50 rounded-lg text-purple-600">
                    {metric.icon}
                  </div>
                </div>
                <h3 className="text-sm text-gray-600 mb-1">{metric.title}</h3>
                <p className={`text-2xl font-bold ${metric.accent}`}>{metric.value}</p>
              </Card>
            ))}
          </div>

          {/* Weekly Interview Activity Graph */}
          <Card className="p-6 bg-white mb-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-1">Haftalık Mülakat Aktivitesi</h2>
              <p className="text-sm text-gray-600">Son 7 gün</p>
            </div>
            <div className="relative" style={{ height: `${graphHeight}px` }}>
              <svg width="100%" height={graphHeight} className="overflow-visible">
                {/* Grid lines */}
                {[0, 7, 14, 21, 28].map((value) => (
                  <line
                    key={value}
                    x1="0"
                    y1={graphHeight - (value / maxValue) * graphHeight}
                    x2="100%"
                    y2={graphHeight - (value / maxValue) * graphHeight}
                    stroke="#e5e7eb"
                    strokeWidth="1"
                  />
                ))}
                {/* Graph line */}
                <polyline
                  points={graphData
                    .map(
                      (value, index) =>
                        `${(index / (graphData.length - 1)) * 100}%,${graphHeight - (value / maxValue) * graphHeight}`
                    )
                    .join(" ")}
                  fill="none"
                  stroke="#9333ea"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Data points */}
                {graphData.map((value, index) => (
                  <circle
                    key={index}
                    cx={`${(index / (graphData.length - 1)) * 100}%`}
                    cy={graphHeight - (value / maxValue) * graphHeight}
                    r="6"
                    fill="#9333ea"
                  />
                ))}
              </svg>
              {/* X-axis labels */}
              <div className="flex justify-between mt-2 text-xs text-gray-600">
                {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              {/* Y-axis labels */}
              <div className="absolute left-0 top-0 flex flex-col justify-between h-full text-xs text-gray-600">
                {[28, 21, 14, 7, 0].map((value) => (
                  <span key={value}>{value}</span>
                ))}
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-white mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Planlanan Mülakatlar</h2>
            {dataLoading ? (
              <p className="text-sm text-gray-500">Yukleniyor...</p>
            ) : upcomingInterviews.length === 0 ? (
              <p className="text-sm text-gray-500">Planli mülakat bulunmuyor.</p>
            ) : (
              <div className="space-y-3">
                {upcomingInterviews.slice(0, 5).map((interview) => (
                  <div
                    key={interview.id}
                    className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3"
                  >
                    <div>
                      <p className="font-semibold text-gray-900">{interview.title || "Mülakat"}</p>
                      <p className="text-sm text-gray-600">
                        {interview.scheduled_at
                          ? new Date(interview.scheduled_at).toLocaleString("tr-TR")
                          : "Tarih belirlenmedi"}
                      </p>
                    </div>
                    <Button
                      onClick={() => router.push(`/interview-admin?interview_id=${interview.id}`)}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      Oturuma Git
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Recent Sessions */}
          <Card className="p-6 bg-white">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Son Seanslar</h2>
            <div className="space-y-4">
              {recentSessions.map((session, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">{session.name}</h3>
                    <p className="text-sm text-gray-600">{session.date}</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">{session.score}</p>
                      <p className="text-xs text-gray-600">Puan</p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        session.status === "success"
                          ? "bg-green-100 text-green-800"
                          : session.status === "warning"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {session.recommendation}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
