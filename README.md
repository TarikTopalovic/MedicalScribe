# MediScribe

Bosnian medical scribe. It listens to a consultation, transcribes it, and
prepares a structured SOAP draft the clinician reviews and completes. Every
note is an unsigned draft; the product documents, it does not diagnose.

Processing is the clinician's choice, per recording:

| Mode | Audio | Transcript text | Draft note |
| --- | --- | --- | --- |
| Local | stays on the device | stays on the device | written on the device |
| Hybrid | stays on the device | sent to the external model | external model |
| Cloud | sent to MAI / Whisper | sent | external model |

Anything that leaves the device needs explicit approval before recording
starts, and the server refuses the request without it.

## Running it

```bash
cd backend  && npm ci
cd ../frontend && npm ci && npm run build
cd ..       && scripts/start-all.sh      # bridge on :3001, renderer on :5173
```

Notes persist to Supabase when `SUPABASE_URL`, the service-role key and
`MEDISCRIBE_CLINICIAN_EMAIL` are set — transcript and draft revisions only,
never audio. Without them everything stays in memory and the app runs the same.

For the desktop app, see [docs/README.md](docs/README.md). Copy
`.env.example` to an ignored `.env` to enable local Whisper or an OpenRouter
key; without either, the app runs the scripted demonstration that ships with
the design and marks itself `Demonstracija`.

## The interface is generated

`frontend/design/MediScribe.dc.html` is the Design Canvas export and the only
source of truth for the UI. `frontend/tools/dc2jsx.py` transpiles it into
`frontend/src/generated/`, which is never hand-edited. To change the design,
change the export and re-run `npm run design`. `npm run design:check` fails if
the two have drifted, and `node tools/parity.mjs` renders the export beside the
built app and lists every node that differs.

- [frontend/README.md](frontend/README.md) — renderer, design pipeline, modes
- [backend/README.md](backend/README.md) — provider core and transcription
- [docs/README.md](docs/README.md) — deployment, session API, Supabase
- [docs/cloud-processing-governance.md](docs/cloud-processing-governance.md) — what must be true before clinical data leaves the device
