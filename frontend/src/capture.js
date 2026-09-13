// Microphone capture for one consultation.
//
// The recorder is cut at speech boundaries so each utterance leaves as a
// complete, independently decodable clip — a half-finished clip is never sent.
// Audio lives in a short in-memory buffer and is dropped as soon as the
// utterance has been handed over.

const SILENCE_RMS = 0.012;      // below this counts as room noise
const SILENCE_HOLD_MS = 900;    // quiet for this long ends the utterance
const MIN_UTTERANCE_MS = 1200;  // ignore coughs and door noise
const MAX_UTTERANCE_MS = 25000; // cut long monologues so text keeps appearing

function pickMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || "";
}

export async function listMicrophones() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "audioinput")
    .map((device, index) => ({ id: device.deviceId, v: device.label || `Mikrofon ${index + 1}` }));
}

export class Capture {
  constructor({ onUtterance, onLevel, onBoundary }) {
    this.onUtterance = onUtterance;
    this.onLevel = onLevel;
    this.onBoundary = onBoundary;
    this.stream = null;
    this.recorder = null;
    this.context = null;
    this.chunks = [];
    this.running = false;
    this.startedAt = 0;
    this.quietSince = 0;
    this.heardSpeech = false;
  }

  async start(deviceId) {
    const constraints = {
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    };
    this.origin = performance.now();
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.context = new (window.AudioContext || window.webkitAudioContext)();
    // Permission prompts can leave the context suspended even though the
    // stream is live, which would otherwise make the level meter stay silent.
    await this.context.resume();
    const source = this.context.createMediaStreamSource(this.stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    source.connect(this.analyser);
    this.buffer = new Float32Array(this.analyser.fftSize);
    this.running = true;
    this.openClip();
    this.watch();
  }

  openClip() {
    const mimeType = pickMimeType();
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.startedAt = performance.now();
    this.clipStartMs = this.startedAt - this.origin;
    this.quietSince = 0;
    this.heardSpeech = false;
    this.recorder.ondataavailable = (event) => {
      if (event.data.size) this.chunks.push(event.data);
    };
    this.recorder.onstop = () => {
      const clip = new Blob(this.chunks, { type: this.recorder.mimeType || "audio/webm" });
      this.chunks = [];
      const worthSending = this.heardSpeech && clip.size > 2048;
      if (worthSending) {
        this.onUtterance(clip, { startMs: this.clipStartMs, endMs: performance.now() - this.origin });
      }
      if (this.running) this.openClip();
    };
    this.recorder.start();
  }

  // Cut the current clip at a speech boundary and start the next one.
  cut() {
    if (!this.recorder || this.recorder.state !== "recording") return;
    if (this.heardSpeech) this.onBoundary?.();
    this.recorder.stop();
  }

  watch() {
    const tick = () => {
      if (!this.running) return;
      this.analyser.getFloatTimeDomainData(this.buffer);
      let sum = 0;
      for (let i = 0; i < this.buffer.length; i += 1) sum += this.buffer[i] * this.buffer[i];
      const rms = Math.sqrt(sum / this.buffer.length);
      this.onLevel?.(rms);

      const now = performance.now();
      const elapsed = now - this.startedAt;
      if (rms > SILENCE_RMS) {
        this.heardSpeech = true;
        this.quietSince = 0;
      } else if (this.heardSpeech) {
        if (!this.quietSince) this.quietSince = now;
        if (now - this.quietSince > SILENCE_HOLD_MS && elapsed > MIN_UTTERANCE_MS) this.cut();
      }
      if (elapsed > MAX_UTTERANCE_MS && this.heardSpeech) this.cut();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  // Finish the consultation: flush the open clip, then release the microphone.
  async stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    if (this.recorder && this.recorder.state === "recording") {
      await new Promise((resolve) => {
        const previous = this.recorder.onstop;
        this.recorder.onstop = (event) => { previous?.(event); resolve(); };
        this.recorder.stop();
      });
    }
    this.release();
  }

  release() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.context?.close().catch(() => {});
    this.stream = null;
    this.context = null;
    this.recorder = null;
    this.chunks = [];
  }
}
