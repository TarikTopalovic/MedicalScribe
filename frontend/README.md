# MediScribe desktop renderer

This renderer packages the downloaded `MediScribe.dc.html` Design Canvas
layout in Electron. The exact export, design system, and runtime are in
`public/design/`; `index.html` displays it directly. React is bundled locally
so the renderer does not fetch UI code from a CDN.

The active workflow is connected to the loopback Node API: explicit consent,
microphone selection, one completed utterance, MAI/Whisper cloud selection,
final transcript review/editing, deterministic local SOAP drafting, copying,
and clearing the in-memory session. No audio, transcript, or draft is written
to browser storage. Demo accounts, permanent reports, and signing were removed
from the active flow; persistent authenticated records require separate
Supabase Auth/server work.

The local Whisper option is host-only and opt-in. When enabled it normalizes a
finished utterance with FFmpeg, performs exactly one guarded `whisper.cpp`
decode, applies the existing 85°C thermal stop, and removes temporary audio.
It is intentionally unavailable in the lightweight Docker API image, which
does not contain the local models. See [../docs/README.md](../docs/README.md)
for startup and the external-processing guard.
