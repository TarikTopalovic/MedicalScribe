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

// Are the consonants there at all?
//
// A speech recogniser lives on the quiet, brief, high sounds of s, š, c, t, k.
// Browser noise suppression, a hands-free headset profile and a telephony
// codec all strip that band, and the transcript then reads like a bad guess no
// matter which model made it. The first difference of the samples rises with
// high-frequency content, so the ratio of its level to the signal's is a cheap
// stand-in for a spectrum: measured on real recordings, browser-processed
// speech scored 0.05-0.22, ordinary speech 0.31-0.39 and white noise 1.37.
const NARROW_BAND_TILT = 0.25;

// ffmpeg does not always write the textbook 44-byte header: a LIST chunk in
// front of the samples shifts everything, and reading from a fixed offset then
// measures noise instead of speech.
function pcmSamples(wav) {
  if (wav.length < 12 || wav.toString("ascii", 0, 4) !== "RIFF") return null;
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "data") {
      const length = Math.min(size, wav.length - start) >> 1;
      const samples = new Int16Array(length);
      for (let i = 0; i < length; i += 1) samples[i] = wav.readInt16LE(start + i * 2);
      return samples;
    }
    offset = start + size + (size % 2);
  }
  return null;
}

function speechBandTilt(wav) {
  const samples = pcmSamples(wav);
  if (!samples || samples.length < 4000) return null;

  const frame = 480; // 30 ms at 16 kHz
  const frames = [];
  for (let start = 0; start + frame <= samples.length; start += frame) {
    let sum = 0;
    for (let i = start; i < start + frame; i += 1) sum += samples[i] * samples[i];
    frames.push({ start, energy: Math.sqrt(sum / frame) });
  }
  if (!frames.length) return null;

  // Judge the loud frames only: room tone would drag the figure anywhere.
  // Below this the clip is a distant voice or a quiet room, and the ratio
  // would describe the noise floor rather than anybody's speech.
  const sorted = frames.map((f) => f.energy).sort((a, b) => a - b);
  const threshold = Math.max(sorted[Math.floor(sorted.length * 0.75)], 400);
  const loud = frames.filter((f) => f.energy > threshold);
  if (loud.length < 3) return null;

  let signal = 0;
  let difference = 0;
  let count = 0;
  loud.forEach((f) => {
    for (let i = f.start + 1; i < f.start + frame; i += 1) {
      const value = samples[i];
      const step = value - samples[i - 1];
      signal += value * value;
      difference += step * step;
      count += 1;
    }
  });
  if (!count || signal <= 0) return null;
  return Number((Math.sqrt(difference / count) / Math.sqrt(signal / count)).toFixed(3));
}

module.exports = { toWavBuffer, speechBandTilt, NARROW_BAND_TILT };
