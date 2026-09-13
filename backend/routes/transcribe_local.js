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
let localDecodeBusy = false;

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
  return { available: true, binary, model, python, ffmpeg };
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

router.post("/", upload.single("audio"), async (req, res) => {
  if (!req.file?.buffer?.length) return res.status(400).json({ greska: "Audio fajl nije poslan ili format nije podržan." });
  const settings = localCapabilities();
  if (!settings.available) return res.status(503).json({ greska: settings.error });
  if (localDecodeBusy) return res.status(409).json({ greska: "Lokalna transkripcija je već u toku. Sačekajte završetak trenutne izjave." });

  localDecodeBusy = true;
  let directory;
  try {
    directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mediscribe-local-"));
    const token = crypto.randomUUID();
    const sourcePath = path.join(directory, `${token}.input`);
    const wavPath = path.join(directory, `${token}.wav`);
    await fs.promises.writeFile(sourcePath, req.file.buffer, { mode: 0o600 });
    await run(settings.ffmpeg, ["-y", "-loglevel", "error", "-i", sourcePath, "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wavPath], 30_000);
    const script = path.resolve(__dirname, "..", "..", "scripts", "transcribe_local_once.py");
    const threads = String(Math.max(1, Number.parseInt(process.env.MEDISCRIBE_LOCAL_THREADS || "", 10) || os.cpus().length));
    const output = await run(settings.python, [script, wavPath, "--binary", settings.binary, "--model", settings.model, "--threads", threads, "--max-cpu-temperature", "85"], 190_000);
    const result = JSON.parse(output);
    if (!result.text || result.language !== "bs") throw new Error("Local transcription returned no valid Bosnian text");
    return res.json({ text: result.text, language: "bs", segments: result.segments || [] });
  } catch (error) {
    const message = String(error?.message || "");
    const thermal = /temperature|thermal|ohladi/i.test(message);
    return res.status(thermal ? 503 : 502).json({ greska: thermal ? "Lokalna transkripcija je zaustavljena da se uređaj ohladi." : "Lokalna transkripcija nije uspjela." });
  } finally {
    localDecodeBusy = false;
    if (directory) await fs.promises.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
});

module.exports = router;
module.exports.capabilities = localCapabilities;
