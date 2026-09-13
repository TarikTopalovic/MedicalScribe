# MediScribe runtime notes

The repository has two optional prototypes sharing the same Bosnian and
privacy rules:

- `backend/app/mediscribe/`: Python provider core, local `whisper.cpp`
  streaming prototype, and its deterministic local draft generator.
- `frontend/`: the Design Canvas export transpiled into the React renderer,
  wired to the loopback API. The export is the source of truth for the
  interface; see [../frontend/README.md](../frontend/README.md).
- `backend/server.js`: the loopback API — session lifecycle, one finalized
  utterance at a time, and draft preparation.

## Basic browser prototype

Requires Node.js 18 or newer. Install dependencies once:

```bash
cd backend && npm ci
cd ../frontend && npm ci
```

The bridge first reads the repository-root ignored `.env` (the existing
runtime configuration), then an optional ignored `backend/.env` can override
it. `backend/.env.example` documents the browser-specific values. The remote
route is disabled by default. It requires `MEDISCRIBE_ALLOW_REMOTE_PROCESSING=true`,
an OpenRouter key, and the UI's per-recording confirmation before audio leaves
the machine. Choose `mai` or `whisper` with
`MEDISCRIBE_OPENROUTER_STT_PROFILE`.

For clinical data, the server fails closed unless the configuration declares
EU in-region routing and an approved processor agreement. That is a technical
gate, not legal approval; follow the governance checklist in
[cloud-processing-governance.md](cloud-processing-governance.md).

Start the two development services with `scripts/start-all.sh` (or the Windows
batch file) and open the Vite URL. The browser UI does not persist audio,
transcripts, or drafts. The post-transcription draft is deterministic and
local; it never diagnoses or proposes therapy.

The renderer checks safe runtime capabilities, requires all visible consent
confirmations, cuts the recording at speech boundaries, sends one completed
utterance at a time, shows only final text as authoritative, and prepares an
editable draft from the final transcript. It does not persist the session or
expose a patient identifier field. When no provider is configured it replays
the scripted consultation that ships with the design and says so in the status
badge.

## Processing modes

| Mode | Audio | Transcript text | Draft note |
| --- | --- | --- | --- |
| `local` | stays on the device | stays on the device | Ollama if running, else the deterministic structure |
| `hybrid` | stays on the device | sent to the external model | OpenRouter |
| `cloud` | sent to MAI/Whisper | sent | OpenRouter |

`hybrid` and `cloud` are refused by the server unless the request carries the
clinician's explicit approval. `local` requires nothing external and never
fails for want of a model.

## Session API

The renderer uses one contract; the transcript stays in the renderer and the
server keeps only the mode, the approval and an utterance count in memory.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/config` | safe capability flags, mode availability, profile names |
| `POST /api/sessions` | open a session (`mode`, `remote_processing_approved`) |
| `POST /api/sessions/:id/audio` | one completed utterance, returns final segments |
| `POST /api/sessions/:id/draft` | draft the note from the final transcript |
| `DELETE /api/sessions/:id` | clear the session |

Run the API tests with `cd backend && npm test`, and the Python provider tests
with `uv run --with pytest pytest tests` from the repository root.

For host-side local transcription, do not use Docker. Copy the root
`.env.example` values into an ignored runtime `.env`, set
`MEDISCRIBE_LOCAL_TRANSCRIPTION_ENABLED=true`, verify cooling, then start the
Node backend directly from the repository root with `node backend/server.js`.
The route requires the checked Whisper binary, final Bosnian model, Python, and
FFmpeg; it accepts only one decode at a time and preserves the 85°C shutdown
guard. The Docker bridge keeps this option disabled because it intentionally
contains neither models nor host CPU access.

For local provisional text while speaking, use the Python streaming prototype
documented in [../backend/README.md](../backend/README.md). Do not use either
prototype for clinical decisions without the required validation, consent, and
governance work.

The full implementation backlog and acceptance criteria are in
[ui-implementation-spec.md](ui-implementation-spec.md).

## Desktop and Docker deployment

Run the API bridge in Docker, bound to the local device only:

```bash
docker compose up --build -d
```

Then build and start the Chromium desktop app in [../desktop](../desktop):

```bash
cd desktop
npm install
npm run build:renderer
npm start
```

The Electron shell is a device application, not a regular browser tab. It is
kept outside Docker so its microphone and display permissions remain controlled
by the host operating system; only the API is containerized. See
[../desktop/README.md](../desktop/README.md) for packaging instructions.

The Compose file has been syntax-validated. A running Docker daemon is required
to build or start the container with the command above.

## Supabase persistence foundation

The repository contains versioned Supabase migrations in `supabase/migrations/`.
Configure the GitHub-connected deployment workflow to apply them only after
review. The first migration stores clinician-owned sessions,
authoritative transcript segments, and draft notes; it deliberately does not
retain audio. RLS is enabled on every table, anonymous access is revoked, and
the Electron renderer must never receive `SUPABASE_SERVICE_ROLE_KEY`.

Before applying the migration to any patient-data project, confirm the exact
project region in Supabase (choose an exact EU region, not the generic Europe
grouping), sign the required DPA, and create clinician accounts in Supabase
Auth.

### What is wired today

`backend/lib/store.js` is the server-side repository. It is enabled only when
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `MEDISCRIBE_CLINICIAN_EMAIL`
are all set; otherwise every note stays in memory and the app behaves exactly
as before. `GET /api/config` reports which it is under `storage.persisted`.

What is written, and when:

| Step | Row |
| --- | --- |
| session opened | `clinical_sessions` (`status='open'`) |
| utterance transcribed | `transcript_segments` with the timing the recorder measured |
| draft prepared | `draft_notes` revision, previous revision loses `is_current`, session becomes `finalized` |

Audio is never written. A confidence score is stored only when the provider
returns one — migration `20260913010500` makes the column nullable so
"unknown" stays distinguishable from "certain". Writes are best-effort: a
database failure is swallowed and the consultation continues, because losing a
note is better than losing the visit.

`GET /api/reports` reads finalized sessions with their current draft and fills
the Izvještaji screen. The renderer never talks to Supabase and never holds a
key; the secret key stays in the bridge.

**Sign-in is not real yet.** The design's sign-in screen is decorative, so the
bridge writes as one configured clinician (`MEDISCRIBE_CLINICIAN_EMAIL`),
created on first use. Row-level security is fully enforced and owner-scoped, so
adding Supabase Auth later means issuing each clinician a real account and
passing their token instead — no schema change. Do not put real patient data in
before that exists.
