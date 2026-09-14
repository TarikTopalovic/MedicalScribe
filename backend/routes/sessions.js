// The consultation API the renderer talks to.
//
// A session holds no clinical content: only the chosen mode, the clinician's
// external-processing approval and a counter, all in memory and all discarded
// when the session is deleted or expires. Audio arrives one completed utterance
// at a time and is released with the request; the transcript lives in the
// renderer and is sent back only when a draft is asked for.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");

const { NARROW_BAND_TILT } = require("../lib/audio");
const { transcribeLocal } = require("./transcribe_local");
const { transcribeRemote } = require("./transcribe_openrouter");
const { draftNote } = require("../lib/note");
const store = require("../lib/store");

const router = express.Router();
const MODES = new Set(["local", "hybrid", "cloud"]);
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;
const AUDIO_FORMATS = new Set(["audio/webm", "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/ogg"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => callback(null, AUDIO_FORMATS.has(file.mimetype.split(";")[0])),
});

const sessions = new Map();

// Names for the record, taken from configuration rather than guessed.
function localModelName() {
  const file = String(process.env.MEDISCRIBE_WHISPER_FINAL_MODEL || "").split("/").pop();
  return file ? `whisper.cpp ${file.replace(/^ggml-|\.bin$/g, "")}` : "whisper.cpp";
}

function cloudModelName(profile) {
  const configured = String(process.env.MEDISCRIBE_OPENROUTER_TRANSCRIPTION_MODEL || "").trim();
  if (configured) return configured;
  return String(profile || process.env.MEDISCRIBE_OPENROUTER_STT_PROFILE || "mai").toLowerCase() === "whisper"
    ? "openai/whisper-large-v3"
    : "microsoft/mai-transcribe-2";
}

// Diagnostics only, and off unless MEDISCRIBE_DEBUG_AUDIO_DIR is set: the
// clinician's own test recording is kept so the capture chain can be measured
// instead of guessed at. Delete the directory and unset the variable when the
// microphone question is settled — a clinical build must never store audio.
function keepForDiagnostics(buffer, mimetype, mode) {
  const directory = process.env.MEDISCRIBE_DEBUG_AUDIO_DIR;
  if (!directory) return;
  try {
    fs.mkdirSync(directory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const extension = String(mimetype || "").includes("ogg") ? "ogg" : "webm";
    fs.writeFileSync(path.join(directory, `${stamp}-${mode}.${extension}`), buffer, { mode: 0o600 });
  } catch {
    // Diagnostics must never interrupt a consultation.
  }
}

function sweep() {
  const cutoff = Date.now() - SESSION_TTL_MS;
  sessions.forEach((session, id) => {
    if (session.touchedAt >= cutoff) return;
    sessions.delete(id);
    // A consultation nobody came back to is closed in the database too, rather
    // than sitting open forever and counting as work in progress.
    if (session.recordReady) {
      session.recordReady
        .then((recordId) => (recordId ? store.archiveSession(recordId) : null))
        .catch(() => {});
    }
  });
}

function load(req, res) {
  sweep();
  const session = sessions.get(req.params.id);
  if (!session) {
    console.warn("[sesija]", req.method, req.params.id, "404 sesija ne postoji");
    res.status(404).json({ greska: "Sesija ne postoji ili je obrisana." });
    return null;
  }
  session.touchedAt = Date.now();
  return session;
}

router.post("/", (req, res) => {
  const mode = String(req.body?.mode || "local");
  if (!MODES.has(mode)) return res.status(400).json({ greska: "Nepoznat način obrade." });
  const approved = req.body?.remote_processing_approved === true;
  // Anything that leaves the device needs the clinician's explicit approval.
  if (mode !== "local" && !approved) {
    return res.status(403).json({ greska: "Potvrda za vanjsku obradu je obavezna." });
  }
  sweep();
  const id = crypto.randomUUID();
  const patient = req.body?.patient && typeof req.body.patient === "object" ? req.body.patient : null;
  const session = {
    id, mode, approved, utterances: 0, lastEndMs: 0, recordId: null, recordReady: null,
    patientLabel: patient ? String(patient.name || "").slice(0, 200) : "",
    patientReason: patient ? String(patient.reason || "").slice(0, 300) : "",
    unsaved: 0,
    createdAt: Date.now(), touchedAt: Date.now(),
  };
  sessions.set(id, session);
  // Persistence is best-effort: a consultation never fails on the database.
  // Later writes wait for this promise, so they cannot race the session insert.
  if (store.configured) {
    session.recordReady = store.openSession({
      patientLabel: session.patientLabel,
      patientReason: session.patientReason,
      mode,
      // The route is fixed by the mode, so the model is known before the first
      // utterance; a per-utterance profile override would not change it.
      transcriptionModel: mode === "cloud" ? cloudModelName(req.body?.profile) : localModelName(),
      draftModel: mode === "local" ? (process.env.MEDISCRIBE_OLLAMA_MODEL || "") : (process.env.MEDISCRIBE_OPENROUTER_DRAFT_MODEL || ""),
    })
      .then((recordId) => { session.recordId = recordId; return recordId; })
      .catch(() => null);
  }
  return res.status(201).json({ id, mode, persisted: store.configured });
});

router.delete("/:id", async (req, res) => {
  const session = sessions.get(req.params.id);
  try {
    const recordId = await session?.recordReady;
    if (recordId) await store.deleteSession(recordId);
    sessions.delete(req.params.id);
    return res.json({ obrisano: true });
  } catch {
    return res.status(502).json({ greska: "Sesija nije obrisana iz sigurne pohrane." });
  }
});

// One completed utterance. Partial audio is never accepted: the renderer cuts
// at a speech boundary and posts the finished clip.
router.post("/:id/audio", upload.single("audio"), async (req, res) => {
  const session = load(req, res);
  if (!session) return undefined;
  if (!req.file?.buffer?.length) {
    return res.status(400).json({ greska: "Audio fajl nije poslan ili format nije podržan." });
  }
  keepForDiagnostics(req.file.buffer, req.file.mimetype, session.mode);
  try {
    // Hybrid keeps the audio on the device: only the cloud mode uploads it.
    const result = session.mode === "cloud"
      ? await transcribeRemote(req.file.buffer, req.file.mimetype, { approved: session.approved, profile: req.body.profile })
      : await transcribeLocal(req.file.buffer);
    const text = String(result.text || "").trim();
    // Voice activity detection found no speech in the clip, or every segment
    // was rejected as invented. Nothing is recorded and nothing failed, so the
    // renderer must not raise a processing error for a moment of quiet.
    if (!text) return res.json({ final: true, segments: [], noSpeech: true });
    const offset = session.utterances;
    session.utterances += 1;
    // The recorder measured the clip; if it did not say, fall back to what the
    // server observed rather than inventing a duration.
    const observed = Date.now() - session.createdAt;
    const startMs = Number.isFinite(Number(req.body.startMs)) ? Number(req.body.startMs) : session.lastEndMs;
    const endMs = Number.isFinite(Number(req.body.endMs)) ? Number(req.body.endMs) : observed;
    session.lastEndMs = Math.max(startMs + 1, endMs);
    const segment = {
      index: offset,
      text,
      speaker: null,
      role: "unknown",
      confidence: result.confidence ?? null,
      // A recogniser cannot hear what the microphone did not send. Saying so is
      // more use than a transcript that quietly reads like a bad guess.
      narrowBand: Number.isFinite(result.bandTilt) && result.bandTilt < NARROW_BAND_TILT,
      startMs,
      endMs: session.lastEndMs,
    };
    // The write is awaited: a clinical record that quietly loses an utterance
    // is worse than one that says it lost it. store.addSegment already retries
    // a dropped connection once.
    const recordId = await session.recordReady;
    let persisted = null;
    if (recordId) {
      try {
        await store.addSegment(recordId, { ...segment, speaker: "unknown" });
        persisted = true;
      } catch (error) {
        session.unsaved += 1;
        persisted = false;
        console.warn("[pohrana] segment", offset, "nije sačuvan:", error.message);
      }
    }
    return res.json({ final: true, segments: [segment], persisted, unsaved: session.unsaved });
  } catch (error) {
    console.warn("[zvuk]", error.status || 502, error.message, error.detail || "");
    return res.status(error.status || 502).json({ greska: error.message || "Transkripcija nije uspjela." });
  }
});

// The draft is prepared from the final transcript the renderer holds.
router.post("/:id/draft", async (req, res) => {
  const session = load(req, res);
  if (!session) return undefined;
  const segments = Array.isArray(req.body?.segments) ? req.body.segments : [];
  const clean = segments
    .map((segment) => ({ speaker: String(segment?.speaker || ""), role: String(segment?.role || "unknown"), text: String(segment?.text || "").trim() }))
    .filter((segment) => segment.text);
  if (!clean.length) return res.status(400).json({ greska: "Nacrt se priprema samo iz konačnog transkripta." });
  try {
    const draft = await draftNote(clean, session.mode);
    let revision = 0;
    let storageError = "";
    const recordId = await session.recordReady;
    if (recordId) {
      try {
        revision = await store.saveDraft(recordId, draft);
      } catch (error) {
        storageError = "Nacrt nije sačuvan u bazu. Ostaje u memoriji sesije.";
        console.warn("[pohrana] nacrt nije sačuvan:", error.message);
      }
    } else if (store.configured) {
      storageError = "Sesija nije otvorena u bazi, pa nacrt nije sačuvan.";
    }
    return res.json({
      ...draft,
      revision,
      persisted: revision > 0,
      storageError,
      unsaved: session.unsaved,
    });
  } catch (error) {
    console.warn("[nacrt]", error.status || 502, error.message);
    return res.status(error.status || 502).json({ greska: error.message || "Nacrt nije pripremljen." });
  }
});

module.exports = router;
module.exports.activeSessions = () => sessions.size;
