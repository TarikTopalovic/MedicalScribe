# MediScribe desktop renderer

Bosnian clinician-facing renderer for the Electron application. It has one
in-memory session at a time: select a processing path, explicitly approve a
cloud utterance, record it, review the final transcript, and prepare an
editable local SOAP draft. Audio, transcript, and draft data are never written
to browser storage.

The renderer calls only these loopback endpoints:

- `GET /api/config` for non-secret capability and route information;
- `POST /api/transcribe` once after a clinician ends an approved cloud
  utterance; and
- `POST /api/structure` to produce the deterministic local draft.

`MAI Transcribe 2` and `Whisper Large v3` can be selected in Settings. The
server resolves the selected profile and remains the only place an OpenRouter
key exists. A local Python streaming runtime is intentionally shown as
unavailable until it is connected to the desktop API; the UI does not pretend
that it is recording locally.

See [../docs/README.md](../docs/README.md) for Docker/Electron startup and
the external-processing guard.
