-- Who the consultation was with, and what produced the words.
--
-- Until now a saved session carried no patient reference and no record of the
-- route that transcribed it, so a finalized note could not be matched to a
-- person or defended afterwards. Both are optional columns: the application
-- works with or without this migration and only writes them once they exist.
--
-- Applying this means patient labels are stored. That is a data-protection
-- decision for the practice, which is why it is a separate, explicit step.

alter table public.clinical_sessions
  add column if not exists patient_label text
    check (patient_label is null or char_length(patient_label) between 1 and 200),
  add column if not exists patient_reason text
    check (patient_reason is null or char_length(patient_reason) <= 300),
  add column if not exists processing_mode text
    check (processing_mode is null or processing_mode in ('local', 'hybrid', 'cloud')),
  add column if not exists transcription_model text
    check (transcription_model is null or char_length(transcription_model) <= 120),
  add column if not exists draft_model text
    check (draft_model is null or char_length(draft_model) <= 120);

-- A transcript segment remembers whether the capture chain was usable, so a
-- poor transcript can be explained instead of argued about.
alter table public.transcript_segments
  add column if not exists narrow_band boolean not null default false;

comment on column public.clinical_sessions.patient_label is
  'Display label for the patient this session belongs to. Optional.';
comment on column public.clinical_sessions.processing_mode is
  'Route the audio took: local, hybrid or cloud.';
comment on column public.transcript_segments.narrow_band is
  'The recording was missing the consonant band when this segment was decoded.';
