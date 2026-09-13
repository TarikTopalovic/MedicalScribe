// Browser bridge for the optional remote transcription path.
const path = require("path");
const dotenv = require("dotenv");

// Reuse the repository runtime environment, then allow backend/.env to supply
// a browser-bridge-specific override. Both files are ignored by Git.
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
dotenv.config({ override: true });

const express = require("express");
const cors = require("cors");

const transcribeRouter = require("./routes/transcribe_openrouter");
const localTranscribeRouter = require("./routes/transcribe_local");
const structureRouter = require("./routes/structure_local");
const sessionsRouter = require("./routes/sessions");
const { draftCapabilities } = require("./lib/note");

const app = express();
const PORT = process.env.PORT || 3001;

// Electron's packaged renderer has no HTTP Origin. The API is Docker-bound to
// loopback, while browser development stays limited to the configured origin.
const allowedOrigins = new Set([
  process.env.FRONTEND_URL || "http://localhost:5173",
  "http://localhost:5173",
  "null",
]);

function isAllowedRendererOrigin(origin) {
  if (!origin || allowedOrigins.has(origin)) return true;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]");
  } catch {
    return false;
  }
}

app.use(cors({
  origin(origin, callback) {
    if (isAllowedRendererOrigin(origin)) return callback(null, true);
    return callback(new Error("CORS origin is not allowed"));
  },
}));
app.use(express.json());

// Rute aplikacije
app.use("/api/transcribe", transcribeRouter);
app.use("/api/transcribe/local", localTranscribeRouter);
app.use("/api/structure", structureRouter);
app.use("/api/sessions", sessionsRouter);

// Safe capability report for the desktop renderer. It deliberately contains no
// token, model-provider response, device path, or patient/session data.
app.get("/api/config", (req, res) => {
  const cloud = transcribeRouter.capabilities();
  const local = localTranscribeRouter.capabilities();
  const draft = draftCapabilities();
  res.json({
    version: 2,
    language: "bs",
    local: {
      available: Boolean(local.available),
      reason: local.available ? "" : local.error,
    },
    // Hybrid transcribes on the device and sends only the finished text out.
    hybrid: {
      available: Boolean(local.available && draft.external),
      reason: local.available
        ? (draft.external ? "" : "Vanjski model za nalaz nije konfiguriran.")
        : local.error,
    },
    draft: {
      external: draft.external,
      reason: draft.external ? "" : "Nacrt se priprema lokalno.",
    },
    cloud: {
      available: Boolean(cloud.available),
      reason: cloud.available ? "" : cloud.error,
      profiles: ["mai", "whisper"],
      defaultProfile: cloud.defaultProfile || "mai",
      profileSelectionAvailable: !Boolean(cloud.configured),
      routeLabel: cloud.euOnly ? "EU ruta" : "standardna ruta",
      routeDescription: cloud.euOnly
        ? "OpenRouter EU ruta; završena izjava se šalje van uređaja."
        : "OpenRouter standardna ruta; završena izjava se šalje van uređaja.",
    },
  });
});

// Jednostavan health-check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", poruka: "MediScribe backend radi lokalno." });
});

// Fallback hendler za greške koje nisu uhvaćene u rutama
app.use((err, req, res, next) => {
  // Never log audio, transcript text, request bodies, or API keys.
  console.error("Backend zahtjev nije uspio:", err.code || err.name || "unknown_error");
  res.status(500).json({ greska: "Interna greška servera." });
});

app.listen(PORT, () => {
  console.log(`MedScribe AI backend sluša na http://localhost:${PORT}`);
});
