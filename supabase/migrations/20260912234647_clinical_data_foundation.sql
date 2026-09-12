-- MediScribe clinical-data foundation.
-- Audio is intentionally excluded: it is transient unless a future, approved
-- retention workflow adds a separately secured storage design.

create table public.clinical_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  language text not null default 'bs' check (language = 'bs'),
  status text not null default 'open' check (status in ('open', 'finalized', 'archived')),
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  archived_at timestamptz,
  check (
    (status = 'open' and finalized_at is null and archived_at is null)
    or (status = 'finalized' and finalized_at is not null and archived_at is null)
    or (status = 'archived' and archived_at is not null)
  )
);

create table public.transcript_segments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.clinical_sessions(id) on delete cascade,
  segment_index integer not null check (segment_index >= 0),
  speaker text not null default 'unknown' check (char_length(speaker) between 1 and 100),
  transcript_text text not null check (char_length(transcript_text) between 1 and 4000),
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null check (end_ms > start_ms),
  confidence numeric(4, 3) not null check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now(),
  unique (session_id, segment_index)
);

create table public.draft_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.clinical_sessions(id) on delete cascade,
  revision integer not null check (revision > 0),
  subjective text not null default '',
  objective text not null default '',
  assessment text not null default '',
  plan text not null default '',
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  unique (session_id, revision)
);

create unique index draft_notes_one_current_per_session
  on public.draft_notes (session_id)
  where is_current;

create index clinical_sessions_owner_created_at_idx
  on public.clinical_sessions (owner_id, created_at desc);
create index transcript_segments_session_index_idx
  on public.transcript_segments (session_id, segment_index);
create index draft_notes_session_created_at_idx
  on public.draft_notes (session_id, created_at desc);

alter table public.clinical_sessions enable row level security;
alter table public.transcript_segments enable row level security;
alter table public.draft_notes enable row level security;

-- No clinical data is reachable through the anonymous API. Authenticated users
-- can only reach sessions they own; the backend service role remains server-only.
revoke all on table public.clinical_sessions, public.transcript_segments, public.draft_notes
  from anon, authenticated;
grant select, insert, update, delete on table public.clinical_sessions, public.transcript_segments, public.draft_notes
  to authenticated;
grant select, insert, update, delete on table public.clinical_sessions, public.transcript_segments, public.draft_notes
  to service_role;

create policy "session owners manage their sessions"
  on public.clinical_sessions
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "session owners manage their transcript segments"
  on public.transcript_segments
  for all to authenticated
  using (
    exists (
      select 1 from public.clinical_sessions session
      where session.id = transcript_segments.session_id
        and session.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.clinical_sessions session
      where session.id = transcript_segments.session_id
        and session.owner_id = (select auth.uid())
    )
  );

create policy "session owners manage their draft notes"
  on public.draft_notes
  for all to authenticated
  using (
    exists (
      select 1 from public.clinical_sessions session
      where session.id = draft_notes.session_id
        and session.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.clinical_sessions session
      where session.id = draft_notes.session_id
        and session.owner_id = (select auth.uid())
    )
  );
