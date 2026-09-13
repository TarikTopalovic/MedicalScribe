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
const structureRouter = require("./routes/structure_local");

const app = express();
const PORT = process.env.PORT || 3001;

// Electron's packaged renderer has no HTTP Origin. The API is Docker-bound to
// loopback, while browser development stays limited to the configured origin.
const allowedOrigins = new Set([
  process.env.FRONTEND_URL || "http://localhost:5173",
  "http://localhost:5173",
  "null",
]);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("CORS origin is not allowed"));
  },
}));
app.use(express.json());

// Rute aplikacije
app.use("/api/transcribe", transcribeRouter);
app.use("/api/structure", structureRouter);

// Safe capability report for the desktop renderer. It deliberately contains no
// token, model-provider response, device path, or patient/session data.
app.get("/api/config", (req, res) => {
  const cloud = transcribeRouter.capabilities();
  res.json({
    version: 1,
    language: "bs",
    local: {
      available: false,
      reason: "Lokalni Python transkriber još nije povezan s desktop API-jem.",
    },
    cloud: {
      available: Boolean(cloud.available),
      reason: cloud.available ? "" : cloud.error,
      profiles: ["mai", "whisper"],
      defaultProfile: cloud.defaultProfile || "mai",
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
