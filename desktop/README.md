# MediScribe desktop shell

This is an Electron application: it runs the React interface in its own
Chromium desktop window, not in the user's normal browser. The renderer is
sandboxed and has no Node.js, filesystem, shell, or process access. It requests
only microphone permission from the trusted local renderer.

The API is intentionally separate and runs in Docker on `127.0.0.1:3001`.
Dockerizing a GUI shell itself would require host display and microphone device
passthrough, which weakens isolation and is not the supported deployment path.

```bash
# From the repository root, start the API container.
docker compose up --build -d

# Once, install desktop packaging dependencies.
cd desktop && npm install

# Build the UI into the Chromium app and launch it.
npm run build:renderer
npm start
```

Create a native package with `npm run package`; it produces an AppImage on
Linux or an NSIS installer on Windows. The desktop app requires Docker Compose
to be running for the API. Configure the ignored root `.env` before enabling
external transcription.
