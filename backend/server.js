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

// The UI is local by default. Configure a different allowed origin explicitly.
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
app.use(express.json());

// Rute aplikacije
app.use("/api/transcribe", transcribeRouter);
app.use("/api/structure", structureRouter);

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
