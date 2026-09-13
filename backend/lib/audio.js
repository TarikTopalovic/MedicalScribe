// One audio decode, used by every transcription route.
//
// Browsers record WebM/Opus, and speech models want 16 kHz mono PCM. Sending
// the browser container straight on is what broke cloud transcription: MAI
// Transcribe 2 answers 400 for WebM and 200 for the same speech as WAV.
const { spawn } = require("child_process");

const FFMPEG = () => process.env.MEDISCRIBE_FFMPEG_BINARY || "ffmpeg";

// Decoded in memory: the recording is never written to disk on the way through.
function toWavBuffer(buffer, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG(), [
      "-y", "-loglevel", "error",
      "-i", "pipe:0",
      "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
      "-f", "wav", "pipe:1",
    ], { stdio: ["pipe", "pipe", "pipe"] });

    const chunks = [];
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);

    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(stderr.trim() || "Audio decode failed"));
      const wav = Buffer.concat(chunks);
      if (!wav.length) return reject(new Error("Audio decode produced no samples"));
      return resolve(wav);
    });

    child.stdin.on("error", () => {});
    child.stdin.end(buffer);
  });
}

module.exports = { toWavBuffer };
