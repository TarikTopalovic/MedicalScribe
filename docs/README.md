# MediScribe runtime notes

The repository has two optional prototypes sharing the same Bosnian and
privacy rules:

- `backend/app/mediscribe/`: Python provider core, local `whisper.cpp`
  streaming prototype, and its deterministic local draft generator.
- `frontend/`: the downloaded Design Canvas UI layout packaged for Electron;
  and `backend/server.js`: the loopback API for a finalized cloud or opt-in
  host-local transcription request and local deterministic draft.

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

The Electron renderer uses the downloaded design while its active workflow is
wired to the Node bridge: it checks safe runtime capabilities, requires all
visible consent confirmations, records one utterance, sends it once after
“Završi izjavu”, shows only final text as authoritative, and prepares an
editable deterministic local draft. It does not persist the session, offer a
signature, or expose a patient identifier field.

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
Auth. The current app does not persist clinical data until its authentication
and server-side Supabase repository are implemented.
