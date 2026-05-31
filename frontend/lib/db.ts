import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

export type InterviewStatus = "scheduled" | "in_progress" | "completed" | "canceled";

export interface ProfileRecord {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
}

export interface InterviewRecord {
  id: string;
  candidate_id: string | null;
  interviewer_id: string | null;
  session_id: string;
  title: string | null;
  scheduled_at: string | null;
  status: InterviewStatus;
  meeting_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TranscriptSegmentRecord {
  id: string;
  interview_id: string;
  session_id: string;
  speaker_role: string;
  content: string;
  created_at: string;
}

export interface InterviewReportRecord {
  id: string;
  interview_id: string;
  session_id: string;
  overall_score: number | null;
  overall_comment: string | null;
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
  } | null;
  key_topics: string[] | null;
  strengths: string[] | null;
  improvements: string[] | null;
  raw_report: Record<string, unknown> | null;
  created_at: string;
}

export async function ensureProfile(user: User) {
  if (!user?.id) return;

  const payload = {
    user_id: user.id,
    email: user.email ?? null,
    full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
    role: (user.user_metadata?.role as string | undefined) ?? "candidate",
  };

  await supabase.from("profiles").upsert(payload, {
    onConflict: "user_id",
  });
}

export async function fetchProfiles(): Promise<ProfileRecord[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, email, full_name, role")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[DB] fetchProfiles error:", error.message);
    return [];
  }

  return (data as ProfileRecord[]) ?? [];
}

export async function createInterview(input: {
  candidateId: string;
  interviewerId: string;
  scheduledAt: string;
  title?: string;
  meetingUrl?: string;
  sessionId: string;
}): Promise<InterviewRecord | null> {
  const { data, error } = await supabase
    .from("interviews")
    .insert({
      candidate_id: input.candidateId,
      interviewer_id: input.interviewerId,
      scheduled_at: input.scheduledAt,
      status: "scheduled",
      title: input.title ?? null,
      meeting_url: input.meetingUrl ?? null,
      session_id: input.sessionId,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[DB] createInterview error:", error.message);
    return null;
  }

  return data as InterviewRecord;
}

export async function updateInterviewStatus(interviewId: string, status: InterviewStatus) {
  const { error } = await supabase
    .from("interviews")
    .update({ status })
    .eq("id", interviewId);

  if (error) {
    console.error("[DB] updateInterviewStatus error:", error.message);
  }
}

export async function fetchInterviewById(interviewId: string) {
  const { data, error } = await supabase
    .from("interviews")
    .select("*")
    .eq("id", interviewId)
    .single();

  if (error) {
    console.error("[DB] fetchInterviewById error:", error.message);
    return null as InterviewRecord | null;
  }

  return data as InterviewRecord;
}

export async function fetchUpcomingInterviews(userId: string, isAdmin: boolean) {
  const nowIso = new Date().toISOString();

  let query = supabase
    .from("interviews")
    .select("*")
    .in("status", ["scheduled", "in_progress"])
    .gte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true });

  if (!isAdmin) {
    query = query.eq("candidate_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[DB] fetchUpcomingInterviews error:", error.message);
    return [] as InterviewRecord[];
  }

  return (data as InterviewRecord[]) ?? [];
}

export async function fetchPastInterviews(userId: string, isAdmin: boolean) {
  const nowIso = new Date().toISOString();

  let query = supabase
    .from("interviews")
    .select("*")
    .or(`status.eq.completed,scheduled_at.lt.${nowIso}`)
    .order("scheduled_at", { ascending: false });

  if (!isAdmin) {
    query = query.eq("candidate_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[DB] fetchPastInterviews error:", error.message);
    return [] as InterviewRecord[];
  }

  return (data as InterviewRecord[]) ?? [];
}

export async function fetchInterviewReports(interviewIds: string[]) {
  if (!interviewIds.length) return [] as InterviewReportRecord[];

  const { data, error } = await supabase
    .from("interview_reports")
    .select("*")
    .in("interview_id", interviewIds);

  if (error) {
    console.error("[DB] fetchInterviewReports error:", error.message);
    return [] as InterviewReportRecord[];
  }

  return (data as InterviewReportRecord[]) ?? [];
}

export async function fetchTranscriptSegments(interviewId: string, limit = 50) {
  const { data, error } = await supabase
    .from("transcript_segments")
    .select("*")
    .eq("interview_id", interviewId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[DB] fetchTranscriptSegments error:", error.message);
    return [] as TranscriptSegmentRecord[];
  }

  return (data as TranscriptSegmentRecord[]) ?? [];
}

export async function insertTranscriptSegments(
  interviewId: string,
  sessionId: string,
  segments: { role: string; text: string }[]
) {
  if (!segments.length) return;

  const payload = segments.map((segment) => ({
    interview_id: interviewId,
    session_id: sessionId,
    speaker_role: segment.role,
    content: segment.text,
  }));

  const { error } = await supabase.from("transcript_segments").insert(payload);

  if (error) {
    console.error("[DB] insertTranscriptSegments error:", error.message);
  }
}

export async function upsertInterviewReport(input: {
  interviewId: string;
  sessionId: string;
  report: Record<string, unknown>;
}) {
  const report = input.report as {
    overall_score?: number;
    overall_comment?: string;
    sentiment?: { positive: number; neutral: number; negative: number };
    key_topics?: string[];
    strengths?: string[];
    improvements?: string[];
  };

  const payload = {
    interview_id: input.interviewId,
    session_id: input.sessionId,
    overall_score: report.overall_score ?? null,
    overall_comment: report.overall_comment ?? null,
    sentiment: report.sentiment ?? null,
    key_topics: report.key_topics ?? null,
    strengths: report.strengths ?? null,
    improvements: report.improvements ?? null,
    raw_report: input.report,
  };

  const { error } = await supabase
    .from("interview_reports")
    .upsert(payload, { onConflict: "interview_id" });

  if (error) {
    console.error("[DB] upsertInterviewReport error:", error.message);
  }
}
