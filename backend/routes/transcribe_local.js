// Host-side, opt-in local Whisper route. It writes each utterance only to a
// unique tmpfs directory and permits exactly one decode at a time.
const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");
const multer = require("multer");

const router = express.Router();
const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const AUDIO_FORMATS = new Set(["audio/webm", "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/ogg"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
  fileFilter: (req, file, callback) => callback(null, AUDIO_FORMATS.has(file.mimetype)),
});
// One decode at a time, but the next utterance waits its turn instead of
// being refused: a clinician keeps talking while the previous clip decodes.
// Whisper was trained on subtitled video and falls back on those credits when
// it hears something it cannot place. Voice activity detection stops most of
// it; these are the lines that still slip through a noisy room.
const CAPTION_ARTEFACTS = /^(hvala (što pratite kanal|na (gledanju|pažnji))|pretplatite se[.!]?|titlovi?( by)?.*|subtitles? by.*|amara\.org.*|prevod.*)$/i;

function withoutCaptionArtefacts(segments) {
  return segments.filter((segment) => !CAPTION_ARTEFACTS.test(String(segment.text || "").trim().replace(/[.!?]+$/, "")));
}

let decodeChain = Promise.resolve();
let queued = 0;
const MAX_QUEUED_DECODES = 4;

function enabled(value) {
  return String(value || "").toLowerCase() === "true";
}

function resolveRuntimePath(value, fallback) {
  return path.resolve(process.env.MEDISCRIBE_REPOSITORY_ROOT || path.resolve(__dirname, "..", ".."), value || fallback);
}

function commandAvailable(command) {
  const probe = spawnSync(command, ["-version"], { stdio: "ignore" });
  return !probe.error;
}

function localCapabilities() {
  if (!enabled(process.env.MEDISCRIBE_LOCAL_TRANSCRIPTION_ENABLED)) {
    return { available: false, error: "Lokalna transkripcija nije omogućena na ovom računaru." };
  }
  const binary = resolveRuntimePath(process.env.MEDISCRIBE_WHISPER_CPP_BINARY, ".runtime/whisper.cpp/build/bin/whisper-cli");
  const model = resolveRuntimePath(process.env.MEDISCRIBE_WHISPER_FINAL_MODEL, ".runtime/whisper.cpp/models/ggml-large-v3-turbo-q5_0.bin");
  const vadModel = resolveRuntimePath(process.env.MEDISCRIBE_WHISPER_VAD_MODEL, ".runtime/whisper.cpp/models/ggml-silero-v5.1.2.bin");
  const python = process.env.MEDISCRIBE_LOCAL_PYTHON || "python";
  const ffmpeg = process.env.MEDISCRIBE_FFMPEG_BINARY || "ffmpeg";
  try {
    fs.accessSync(binary, fs.constants.X_OK);
  } catch {
    return { available: false, error: "Lokalni whisper.cpp program nije dostupan." };
  }
  if (!fs.existsSync(model) || !fs.statSync(model).isFile()) {
    return { available: false, error: "Lokalni Bosanski model nije dostupan." };
  }
  if (!commandAvailable(python) || !commandAvailable(ffmpeg)) {
    return { available: false, error: "Lokalni Python ili FFmpeg program nije dostupan." };
  }
  // Voice activity detection is what keeps invented speech out of a record:
  // without it a silent clip decodes into a plausible Bosnian sentence.
  if (!fs.existsSync(vadModel)) {
    return { available: false, error: "Lokalni VAD model nije dostupan." };
  }
  return { available: true, binary, model, vadModel, python, ffmpeg };
}

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) return resolve(stdout);
      return reject(new Error(stderr || "Local transcription command failed"));
    });
  });
}

// One completed utterance, decoded on this machine. Exported so the session
// API can reuse the same single-decode guard as the standalone route.
async function transcribeLocal(buffer) {
  const settings = localCapabilities();
  if (!settings.available) { const error = new Error(settings.error); error.status = 503; throw error; }
  if (queued >= MAX_QUEUED_DECODES) {
    const error = new Error("Previše izjava čeka lokalnu obradu. Sačekajte da se trenutne završe.");
    error.status = 429;
    throw error;
  }
  queued += 1;
  const decode = decodeChain.then(() => decodeOnce(buffer, settings), () => decodeOnce(buffer, settings));
  decodeChain = decode.catch(() => {}).then(() => { queued -= 1; });
  return decode;
}

async function decodeOnce(buffer, settings) {
  let directory;
  try {
    directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mediscribe-local-"));
    const token = crypto.randomUUID();
    const sourcePath = path.join(directory, `${token}.input`);
    const wavPath = path.join(directory, `${token}.wav`);
    await fs.promises.writeFile(sourcePath, buffer, { mode: 0o600 });
    await run(settings.ffmpeg, ["-y", "-loglevel", "error", "-i", sourcePath, "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wavPath], 30_000);
    const script = path.resolve(__dirname, "..", "..", "scripts", "transcribe_local_once.py");
    const threads = String(Math.max(1, Number.parseInt(process.env.MEDISCRIBE_LOCAL_THREADS || "", 10) || os.cpus().length));
    const output = await run(settings.python, [script, wavPath, "--binary", settings.binary, "--model", settings.model, "--vad-model", settings.vadModel, "--threads", threads, "--max-cpu-temperature", "85"], 190_000);
    const result = JSON.parse(output);
    if (result.language && result.language !== "bs") throw new Error("Local transcription returned no valid Bosnian text");
    // An utterance that carried no speech is an empty result, not a failure.
    const segments = withoutCaptionArtefacts(result.segments || []);
    const text = segments.map((segment) => String(segment.text || "").trim()).filter(Boolean).join(" ").trim();
    const scored = segments.map((segment) => Number(segment.confidence)).filter((value) => Number.isFinite(value));
    const confidence = scored.length ? Number((scored.reduce((total, value) => total + value, 0) / scored.length).toFixed(3)) : null;
    return { text, language: "bs", segments: text ? segments : [], confidence: text ? confidence : null, noSpeech: !text };
  } catch (error) {
    if (error.status) throw error;
    const thermal = /temperature|thermal|ohladi/i.test(String(error?.message || ""));
    const safe = new Error(thermal ? "Lokalna transkripcija je zaustavljena da se uređaj ohladi." : "Lokalna transkripcija nije uspjela.");
    safe.status = thermal ? 503 : 502;
    safe.detail = String(error?.message || "").slice(0, 400);
    throw safe;
  } finally {
    if (directory) await fs.promises.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

router.post("/", upload.single("audio"), async (req, res) => {
  if (!req.file?.buffer?.length) return res.status(400).json({ greska: "Audio fajl nije poslan ili format nije podržan." });
  try {
    return res.json(await transcribeLocal(req.file.buffer));
  } catch (error) {
    return res.status(error.status || 502).json({ greska: error.message });
  }
});

module.exports = router;
module.exports.capabilities = localCapabilities;
module.exports.transcribeLocal = transcribeLocal;
module.exports.withoutCaptionArtefacts = withoutCaptionArtefacts;
