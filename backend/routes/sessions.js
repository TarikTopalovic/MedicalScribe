// The consultation API the renderer talks to.
//
// A session holds no clinical content: only the chosen mode, the clinician's
// external-processing approval and a counter, all in memory and all discarded
// when the session is deleted or expires. Audio arrives one completed utterance
// at a time and is released with the request; the transcript lives in the
// renderer and is sent back only when a draft is asked for.

const crypto = require("crypto");
const express = require("express");
const multer = require("multer");

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

function sweep() {
  const cutoff = Date.now() - SESSION_TTL_MS;
  sessions.forEach((session, id) => { if (session.touchedAt < cutoff) sessions.delete(id); });
}

function load(req, res) {
  sweep();
  const session = sessions.get(req.params.id);
  if (!session) {
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
  const session = { id, mode, approved, utterances: 0, lastEndMs: 0, recordId: null, createdAt: Date.now(), touchedAt: Date.now() };
  sessions.set(id, session);
  // Persistence is best-effort: a consultation never fails on the database.
  if (store.configured) {
    store.openSession().then((recordId) => { session.recordId = recordId; }).catch(() => {});
  }
  return res.status(201).json({ id, mode, persisted: store.configured });
});

router.delete("/:id", (req, res) => {
  sessions.delete(req.params.id);
  return res.json({ obrisano: true });
});

// One completed utterance. Partial audio is never accepted: the renderer cuts
// at a speech boundary and posts the finished clip.
router.post("/:id/audio", upload.single("audio"), async (req, res) => {
  const session = load(req, res);
  if (!session) return undefined;
  if (!req.file?.buffer?.length) {
    return res.status(400).json({ greska: "Audio fajl nije poslan ili format nije podržan." });
  }
  try {
    // Hybrid keeps the audio on the device: only the cloud mode uploads it.
    const result = session.mode === "cloud"
      ? await transcribeRemote(req.file.buffer, req.file.mimetype, { approved: session.approved, profile: req.body.profile })
      : await transcribeLocal(req.file.buffer);
    const text = String(result.text || "").trim();
    if (!text) return res.status(502).json({ greska: "Izjava nije prepoznata. Ponovite je." });
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
      startMs,
      endMs: session.lastEndMs,
    };
    if (session.recordId) {
      store.addSegment(session.recordId, { ...segment, speaker: "unknown" }).catch(() => {});
    }
    return res.json({ final: true, segments: [segment] });
  } catch (error) {
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
    if (session.recordId) {
      revision = await store.saveDraft(session.recordId, draft).catch(() => 0);
    }
    return res.json({ ...draft, revision, persisted: revision > 0 });
  } catch (error) {
    return res.status(error.status || 502).json({ greska: error.message || "Nacrt nije pripremljen." });
  }
});

module.exports = router;
module.exports.activeSessions = () => sessions.size;
