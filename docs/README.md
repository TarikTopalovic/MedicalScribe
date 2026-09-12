# MediScribe runtime notes

The repository has two optional prototypes sharing the same Bosnian and
privacy rules:

- `backend/app/mediscribe/`: Python provider core, local `whisper.cpp`
  streaming prototype, and its deterministic local draft generator.
- `frontend/` plus `backend/server.js`: a deliberately basic browser recorder
  and Node bridge for one approved OpenRouter transcription request after an
  utterance finishes.

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

The browser prototype submits an utterance after the user presses “Završi
izjavu”. For local provisional text while speaking, use the Python streaming
prototype documented in [../backend/README.md](../backend/README.md). Do not
use either prototype for clinical decisions without the required validation,
consent, and governance work.

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
