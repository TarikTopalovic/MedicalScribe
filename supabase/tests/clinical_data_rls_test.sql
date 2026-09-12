begin;
select plan(9);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.clinical_sessions'::regclass),
  'clinical_sessions has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.transcript_segments'::regclass),
  'transcript_segments has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.draft_notes'::regclass),
  'draft_notes has RLS enabled'
);

select ok(
  not has_table_privilege('anon', 'public.clinical_sessions', 'select, insert, update, delete'),
  'anonymous clients cannot access clinical sessions'
);
select ok(
  not has_table_privilege('anon', 'public.transcript_segments', 'select, insert, update, delete'),
  'anonymous clients cannot access transcripts'
);
select ok(
  not has_table_privilege('anon', 'public.draft_notes', 'select, insert, update, delete'),
  'anonymous clients cannot access drafts'
);
select ok(
  has_table_privilege('authenticated', 'public.clinical_sessions', 'select, insert, update, delete'),
  'authenticated access is controlled by RLS rather than missing grants'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'clinical_sessions')::bigint,
  1::bigint,
  'clinical sessions have exactly one ownership policy'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'transcript_segments')::bigint,
  1::bigint,
  'transcript segments have exactly one ownership policy'
);

select * from finish();
rollback;
