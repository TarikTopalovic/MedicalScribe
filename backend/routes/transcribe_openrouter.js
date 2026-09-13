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

// Whisper invents plausible speech for non-speech audio — a sine tone came
// back as "Hvala vam." Its own published heuristic is that a segment is not
// speech when no_speech_prob is high and the average log probability is low;
// in a clinical transcript a dropped segment is far safer than an invented one.
function isHallucinated(segment) {
  return Number(segment.no_speech_prob) > 0.6 && Number(segment.avg_logprob) < -1;
}

// A provider that reports per-segment log probabilities gives us a real
// confidence. One that does not leaves it null rather than guessing.
function derivedConfidence(segments) {
  const scored = segments.filter((segment) => Number.isFinite(Number(segment.avg_logprob)));
  if (!scored.length) return null;
  const mean = scored.reduce((total, segment) => total + Number(segment.avg_logprob), 0) / scored.length;
  return Math.min(1, Math.max(0, Number(Math.exp(mean).toFixed(3))));
}

function remoteCapability() {
  if (!enabled(process.env.MEDISCRIBE_ALLOW_REMOTE_PROCESSING)) {
    return { error: "Vanjska obrada nije omogućena na serveru.", status: 403, available: false };
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return { error: "Vanjska obrada nije konfigurirana na serveru.", status: 503, available: false };
  }
  const classification = String(process.env.MEDISCRIBE_CLOUD_DATA_CLASSIFICATION || "synthetic").toLowerCase();
  if (!["synthetic", "clinical"].includes(classification)) {
    return { error: "Vanjska obrada nema valjanu klasifikaciju podataka.", status: 503, available: false };
  }
  const euOnly = enabled(process.env.MEDISCRIBE_OPENROUTER_EU_ONLY);
  if (classification === "clinical" && (!euOnly || !enabled(process.env.MEDISCRIBE_OPENROUTER_DPA_APPROVED))) {
    return { error: "Klinička cloud obrada nije odobrena za ovaj server.", status: 403, available: false };
  }
  const configured = String(process.env.MEDISCRIBE_OPENROUTER_TRANSCRIPTION_MODEL || "").trim();
  const defaultProfile = String(process.env.MEDISCRIBE_OPENROUTER_STT_PROFILE || "mai").toLowerCase();
  const model = configured || PROFILE_MODELS[defaultProfile];
  if (!model) {
    return { error: "Odaberi MAI ili Whisper profil na serveru.", status: 503, available: false };
  }
  return {
    available: true,
    apiBase: euOnly ? "https://eu.openrouter.ai/api/v1" : "https://openrouter.ai/api/v1",
    euOnly,
    classification,
    configured,
    defaultProfile: PROFILE_MODELS[defaultProfile] ? defaultProfile : "mai",
  };
}

function remoteSettings(approved, requestedProfile) {
  const capability = remoteCapability();
  if (!capability.available) return capability;
  if (!approved) return { error: "Potvrda za vanjsku obradu je obavezna.", status: 400 };
  const profile = String(requestedProfile || capability.defaultProfile).toLowerCase();
  const model = capability.configured || PROFILE_MODELS[profile];
  if (!model) return { error: "Odaberi MAI ili Whisper profil.", status: 400 };
  return { ...capability, apiKey: process.env.OPENROUTER_API_KEY, model };
}

// One completed utterance, forwarded once. Exported so the session API sends
// audio through exactly the same approval and routing checks.
async function transcribeRemote(buffer, mimetype, { approved, profile }) {
  const settings = remoteSettings(approved, profile);
  if (settings.error) {
    const error = new Error(settings.error);
    error.status = settings.status;
    throw error;
  }
  try {
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
          data: buffer.toString("base64"),
          format: AUDIO_FORMATS[mimetype] || "webm",
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
      const error = new Error(odgovor.status === 402 ? "Nedostaje OpenRouter kredit." : "Vanjska transkripcija nije uspjela.");
      error.status = odgovor.status === 402 ? 402 : 502;
      throw error;
    }
    const language = String(rezultat.language || "").trim().toLowerCase();
    if (language && !["bs", "bs-ba", "bos", "bosnian"].includes(language)) {
      const error = new Error("Servis nije vratio bosanski transkript.");
      error.status = 502;
      throw error;
    }
    const all = Array.isArray(rezultat.segments) ? rezultat.segments : [];
    const kept = all.filter((segment) => !isHallucinated(segment));
    // Rebuild the text from what survived, so a dropped segment cannot reach
    // the transcript through the provider's own joined string.
    const text = (kept.length ? kept.map((segment) => String(segment.text || "")).join(" ") : String(rezultat.text || ""))
      .replace(/\s+/g, " ")
      .trim();
    if (!text || (all.length && !kept.length)) {
      return { text: "", language: "bs", segments: [], confidence: null };
    }
    return { text, language: "bs", segments: kept, confidence: derivedConfidence(kept) };
  } catch (error) {
    // Do not serialize or log provider response bodies, audio, or transcript.
    if (error.status) throw error;
    const safe = new Error("Vanjska transkripcija nije dostupna.");
    safe.status = 502;
    throw safe;
  }
}

router.post("/", upload.single("audio"), async (req, res) => {
  if (!req.file || !req.file.buffer.length) {
    return res.status(400).json({ greska: "Audio fajl nije poslan ili format nije podržan." });
  }
  try {
    const result = await transcribeRemote(req.file.buffer, req.file.mimetype, {
      approved: req.body.remote_processing_approved === "true",
      profile: req.body.profile,
    });
    return res.json({ text: result.text, language: result.language });
  } catch (error) {
    return res.status(error.status || 502).json({ greska: error.message });
  }
});

module.exports = router;
module.exports.capabilities = remoteCapability;
module.exports.transcribeRemote = transcribeRemote;
module.exports.isHallucinated = isHallucinated;
module.exports.derivedConfidence = derivedConfidence;
