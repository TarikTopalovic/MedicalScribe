// Glavni ulazni fajl backend servera za MedScribe AI
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const transcribeRouter = require("./routes/transcribe");
const structureRouter = require("./routes/structure");
const suggestRouter = require("./routes/suggest");

const app = express();
const PORT = process.env.PORT || 3001;

// Omogućavamo CORS da frontend (Vite, port 5173) može da poziva backend
app.use(cors());
app.use(express.json());

// Rute aplikacije
app.use("/api/transcribe", transcribeRouter);
app.use("/api/structure", structureRouter);
app.use("/api/suggest", suggestRouter);

// Jednostavan health-check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", poruka: "MedScribe AI backend radi" });
});

// Fallback hendler za greške koje nisu uhvaćene u rutama
app.use((err, req, res, next) => {
  console.error("Neuhvaćena greška:", err);
  res.status(500).json({ greska: "Interna greška servera." });
});

app.listen(PORT, () => {
  console.log(`MedScribe AI backend sluša na http://localhost:${PORT}`);
});
