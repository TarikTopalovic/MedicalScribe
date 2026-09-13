# MediScribe desktop renderer

This renderer packages the downloaded `MediScribe.dc.html` Design Canvas
export without redesigning it. The exact export, design system, and runtime
are in `public/design/`; `index.html` displays it directly in Electron.
React is bundled locally so the export does not fetch UI code from a CDN.

The exported screens are a visual interactive prototype and include simulated
accounts, visits, transcript segments, and note actions. They are not yet
connected to `backend/server.js`, microphone capture, OpenRouter, or Supabase.
Do not treat demo patient data, signatures, or status indicators as real
clinical data processing.

The separate Node API remains available for its existing approved-cloud
transcription and deterministic local-draft routes. See
[../docs/README.md](../docs/README.md) for Docker/Electron startup and the
external-processing guard.
