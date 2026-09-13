import { useEffect, useRef, useState } from "react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

export default function RecorderSafe({ enabled, remoteProcessingApproved, profile, onTranscript, onError, onProcessing, onStateChange }) {
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    if (!recording) return undefined;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);
  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);
  const setState = (value) => onStateChange?.(value);

  async function start() {
    if (!enabled) return onError("Vanjska transkripcija trenutno nije dostupna na serveru.");
    if (!remoteProcessingApproved) return onError("Potvrda za vanjsku obradu je obavezna prije snimanja.");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return onError("Ovaj uređaj ne podržava snimanje mikrofona u desktop aplikaciji.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredType = "audio/webm;codecs=opus";
      const options = MediaRecorder.isTypeSupported(preferredType) ? { mimeType: preferredType } : {};
      const recorder = new MediaRecorder(stream, options);
      chunksRef.current = []; streamRef.current = stream;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop()); streamRef.current = null;
        const audio = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }); chunksRef.current = [];
        await send(audio);
      };
      recorder.start(); recorderRef.current = recorder; setSeconds(0); setRecording(true); setState("recording");
    } catch { setState("ready"); onError("Nije moguće pristupiti mikrofonu. Provjerite dozvole uređaja."); }
  }

  function stop() {
    if (recorderRef.current?.state === "recording") { setRecording(false); setState("processing"); recorderRef.current.stop(); }
  }

  async function send(audio) {
    setSending(true); onProcessing();
    try {
      const form = new FormData(); form.append("audio", audio, "izjava.webm"); form.append("remote_processing_approved", "true"); form.append("profile", profile);
      const response = await fetch(`${BACKEND_URL}/api/transcribe`, { method: "POST", body: form });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.greska || "Transkripcija nije uspjela.");
      onTranscript(payload.text);
    } catch (error) { onError(error.message || "Slanje audio zapisa nije uspjelo."); }
    finally { setSending(false); setState("ready"); }
  }

  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return <div className="recorder">
    {!recording ? <button className="button record-button" onClick={start} disabled={sending || !enabled || !remoteProcessingApproved}>Pokreni snimanje</button> : <button className="button danger record-button" onClick={stop}>Završi izjavu</button>}
    {recording && <div className="recording-state" aria-live="polite"><span className="recording-dot" aria-hidden="true" /> Snimanje <strong>{time}</strong><span className="level-meter" aria-label="Nivo zvuka je aktivan"><i /><i /><i /><i /><i /></span></div>}
    {sending && <span className="muted">Obrađujem završenu izjavu…</span>}
  </div>;
}
