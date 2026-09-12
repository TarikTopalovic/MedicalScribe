// Approved browser audio is forwarded once, after an utterance ends.
const express = require("express");
const multer = require("multer");

const router = express.Router();
const PROFILE_MODELS = {
  mai: "microsoft/mai-transcribe-2",
  whisper: "openai/whisper-large-v3",
};
const AUDIO_FORMATS = {
  "audio/webm": "webm",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
};

// Audio is memory-only and discarded when this request completes.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => callback(null, Boolean(AUDIO_FORMATS[file.mimetype])),
});

function enabled(value) {
  return String(value || "").toLowerCase() === "true";
}

function remoteSettings(approved) {
  if (!enabled(process.env.MEDISCRIBE_ALLOW_REMOTE_PROCESSING)) {
    return { error: "Vanjska obrada nije omogućena na serveru.", status: 403 };
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return { error: "OPENROUTER_API_KEY nije podešen na serveru.", status: 503 };
  }
  if (!approved) {
    return { error: "Potvrda za vanjsku obradu je obavezna.", status: 400 };
  }
  const classification = String(process.env.MEDISCRIBE_CLOUD_DATA_CLASSIFICATION || "synthetic").toLowerCase();
  if (!["synthetic", "clinical"].includes(classification)) {
    return { error: "Cloud klasifikacija mora biti synthetic ili clinical.", status: 503 };
  }
  const euOnly = enabled(process.env.MEDISCRIBE_OPENROUTER_EU_ONLY);
  if (classification === "clinical" && (!euOnly || !enabled(process.env.MEDISCRIBE_OPENROUTER_DPA_APPROVED))) {
    return { error: "Klinička cloud obrada nije odobrena za ovaj server.", status: 403 };
  }
  const configured = String(process.env.MEDISCRIBE_OPENROUTER_TRANSCRIPTION_MODEL || "").trim();
  const profile = String(process.env.MEDISCRIBE_OPENROUTER_STT_PROFILE || "mai").toLowerCase();
  const model = configured || PROFILE_MODELS[profile];
  if (!model) {
    return { error: "Odaberi MAI ili Whisper profil na serveru.", status: 503 };
  }
  return {
    apiBase: euOnly ? "https://eu.openrouter.ai/api/v1" : "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    model,
  };
}

router.post("/", upload.single("audio"), async (req, res) => {
  if (!req.file || !req.file.buffer.length) {
    return res.status(400).json({ greska: "Audio fajl nije poslan ili format nije podržan." });
  }

  try {
    const settings = remoteSettings(req.body.remote_processing_approved === "true");
    if (settings.error) {
      return res.status(settings.status).json({ greska: settings.error });
    }
    const odgovor = await fetch(`${settings.apiBase}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/TarikTopalovic/MedicalScribe",
        "X-OpenRouter-Title": "MediScribe",
      },
      body: JSON.stringify({
        model: settings.model,
        input_audio: {
          data: req.file.buffer.toString("base64"),
          format: AUDIO_FORMATS[req.file.mimetype],
        },
        language: "bs",
        temperature: 0,
        response_format: "verbose_json",
        timestamp_granularities: ["segment"],
        provider: { zdr: true, data_collection: "deny" },
      }),
    });
    const rezultat = await odgovor.json().catch(() => ({}));
    if (!odgovor.ok) {
      const status = odgovor.status === 402 ? 402 : 502;
      return res.status(status).json({
        greska: status === 402 ? "Nedostaje OpenRouter kredit." : "Vanjska transkripcija nije uspjela.",
      });
    }
    const language = String(rezultat.language || "").trim().toLowerCase();
    if (language && !["bs", "bs-ba", "bos", "bosnian"].includes(language)) {
      return res.status(502).json({ greska: "Servis nije vratio bosanski transkript." });
    }
    const text = String(rezultat.text || "").trim();
    if (!text) {
      return res.status(502).json({ greska: "Servis nije vratio tekst transkripta." });
    }
    return res.json({ text, language: "bs" });
  } catch (error) {
    // Do not serialize or log provider response bodies, audio, or transcript.
    return res.status(502).json({ greska: "Vanjska transkripcija nije dostupna." });
  }
});

module.exports = router;
