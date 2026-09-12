// Ruta za transkripciju audio snimka u tekst putem Groq Whisper API-ja
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Groq = require("groq-sdk");

const router = express.Router();

// Privremeno čuvamo audio fajl na disku dok ga ne pošaljemo na Groq.
// VAŽNO: Multer po defaultu čuva fajl BEZ ekstenzije, a Groq API prepoznaje
// format audio zapisa po ekstenziji u imenu fajla - zato je moramo eksplicitno sačuvati,
// inače Groq vraća grešku "unsupported_audio_format".
const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => {
      const ekstenzija = path.extname(file.originalname) || ".webm";
      cb(null, `snimak-${Date.now()}-${Math.round(Math.random() * 1e9)}${ekstenzija}`);
    },
  }),
});

// Groq klijent se inicijalizuje lijeno (tek kad stigne prvi zahtjev) da ne puca
// aplikacija ako .env još nije podešen u trenutku pokretanja
function napraviGroqKlijenta() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY nije podešen u .env fajlu.");
  }
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

// Pokušava transkripciju sa zadanim jezikom preko Groq Whisper modela
async function transkribuj(groq, filePath, jezik) {
  return groq.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: "whisper-large-v3",
    language: jezik,
    response_format: "json",
  });
}

router.post("/", upload.single("audio"), async (req, res) => {
  const fajl = req.file;

  if (!fajl) {
    return res.status(400).json({ greska: "Audio fajl nije poslan (polje 'audio')." });
  }

  try {
    const groq = napraviGroqKlijenta();

    let rezultat;
    try {
      // Prvo pokušavamo hrvatski jezik
      rezultat = await transkribuj(groq, fajl.path, "hr");
    } catch (greskaHr) {
      console.warn("Transkripcija sa jezikom 'hr' nije uspjela, pokušavam 'sr':", greskaHr.message);
      // Ako ne uspije, pokušavamo srpski jezik kao fallback
      rezultat = await transkribuj(groq, fajl.path, "sr");
    }

    res.json({ text: rezultat.text || "" });
  } catch (greska) {
    console.error("Greška prilikom transkripcije:", greska);
    res.status(500).json({
      greska: "Transkripcija nije uspjela. Provjeri GROQ_API_KEY i konekciju.",
      detalji: greska.message,
    });
  } finally {
    // Bez obzira na ishod, brišemo privremeni fajl sa diska
    if (fajl && fajl.path) {
      fs.unlink(fajl.path, () => {});
    }
  }
});

module.exports = router;
