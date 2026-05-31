-- Supabase schema for interviews, transcripts, and reports
-- Apply in Supabase SQL editor as an admin user.

create extension if not exists "pgcrypto";

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  role text default 'candidate',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  created_at timestamptz default now()
);

create table if not exists interviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references auth.users(id) on delete set null,
  interviewer_id uuid references auth.users(id) on delete set null,
  session_id text not null,
  title text,
  scheduled_at timestamptz,
  status text not null default 'scheduled',
  meeting_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists interviews_candidate_id_idx on interviews(candidate_id);
create index if not exists interviews_interviewer_id_idx on interviews(interviewer_id);
create index if not exists interviews_status_idx on interviews(status);
create index if not exists interviews_scheduled_at_idx on interviews(scheduled_at);

create table if not exists transcript_segments (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid references interviews(id) on delete cascade,
  session_id text not null,
  speaker_role text not null,
  content text not null,
  created_at timestamptz default now()
);

create index if not exists transcript_segments_interview_id_idx on transcript_segments(interview_id);
create index if not exists transcript_segments_session_id_idx on transcript_segments(session_id);

create table if not exists interview_reports (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid unique references interviews(id) on delete cascade,
  session_id text not null,
  overall_score int,
  overall_comment text,
  sentiment jsonb,
  key_topics text[],
  strengths text[],
  improvements text[],
  raw_report jsonb,
  created_at timestamptz default now()
);

create index if not exists interview_reports_session_id_idx on interview_reports(session_id);

alter table profiles enable row level security;
alter table admins enable row level security;
alter table interviews enable row level security;
alter table transcript_segments enable row level security;
alter table interview_reports enable row level security;

create policy "profiles self read" on profiles
  for select
  using (
    user_id = auth.uid()
    or exists (select 1 from admins where user_id = auth.uid())
  );

create policy "profiles self insert" on profiles
  for insert
  with check (user_id = auth.uid());

create policy "profiles self update" on profiles
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "admins self read" on admins
  for select
  using (user_id = auth.uid());

create policy "interviews read" on interviews
  for select
  using (
    candidate_id = auth.uid()
    or interviewer_id = auth.uid()
    or exists (select 1 from admins where user_id = auth.uid())
  );

create policy "interviews insert" on interviews
  for insert
  with check (
    exists (select 1 from admins where user_id = auth.uid())
    or interviewer_id = auth.uid()
  );

create policy "interviews update" on interviews
  for update
  using (
    exists (select 1 from admins where user_id = auth.uid())
    or interviewer_id = auth.uid()
  )
  with check (
    exists (select 1 from admins where user_id = auth.uid())
    or interviewer_id = auth.uid()
  );

create policy "transcripts read" on transcript_segments
  for select
  using (
    exists (
      select 1
      from interviews i
      where i.id = interview_id
        and (
          i.candidate_id = auth.uid()
          or i.interviewer_id = auth.uid()
          or exists (select 1 from admins where user_id = auth.uid())
        )
    )
  );

create policy "transcripts insert" on transcript_segments
  for insert
  with check (
    exists (
      select 1
      from interviews i
      where i.id = interview_id
        and (
          i.interviewer_id = auth.uid()
          or exists (select 1 from admins where user_id = auth.uid())
        )
    )
  );

create policy "reports read" on interview_reports
  for select
  using (
    exists (
      select 1
      from interviews i
      where i.id = interview_id
        and (
          i.candidate_id = auth.uid()
          or i.interviewer_id = auth.uid()
          or exists (select 1 from admins where user_id = auth.uid())
        )
    )
  );

create policy "reports insert" on interview_reports
  for insert
  with check (
    exists (
      select 1
      from interviews i
      where i.id = interview_id
        and (
          i.interviewer_id = auth.uid()
          or exists (select 1 from admins where user_id = auth.uid())
        )
    )
  );
