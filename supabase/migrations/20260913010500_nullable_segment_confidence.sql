-- Transcription providers do not all return a confidence score. Recording a
-- fabricated 1.000 in a clinical record is worse than recording nothing, so the
-- column becomes nullable and "unknown" stays distinguishable from "certain".

alter table public.transcript_segments
  alter column confidence drop not null;
