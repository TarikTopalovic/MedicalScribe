import { useRef, useState } from "react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

export default function RecorderSafe({ remoteProcessingApproved, onTranscript, onError, onProcessing }) {
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  async function start() {
    if (!remoteProcessingApproved) {
      onError("Prvo potvrdi odobrenje za vanjsku obradu audio zapisa.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredType = "audio/webm;codecs=opus";
      const options = MediaRecorder.isTypeSupported(preferredType) ? { mimeType: preferredType } : {};
      const recorder = new MediaRecorder(stream, options);
      chunksRef.current = [];
      streamRef.current = stream;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const audio = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        await send(audio);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch (error) {
      onError("Nije moguće pristupiti mikrofonu. Provjeri dozvole preglednika.");
    }
  }

  function stop() {
    if (recorderRef.current && recording) {
      recorderRef.current.stop();
      setRecording(false);
    }
  }

  async function send(audio) {
    setSending(true);
    onProcessing();
    try {
      const form = new FormData();
      form.append("audio", audio, "izjava.webm");
      form.append("remote_processing_approved", "true");
      const response = await fetch(`${BACKEND_URL}/api/transcribe`, { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.greska || "Transkripcija nije uspjela.");
      onTranscript(payload.text);
    } catch (error) {
      onError(error.message || "Slanje audio zapisa nije uspjelo.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="recorder">
      {!recording ? <button className="dugme dugme-primarno" onClick={start} disabled={sending}>🎙️ Pokreni snimanje</button> : <button className="dugme dugme-opasnost" onClick={stop}>⏹️ Završi izjavu</button>}
      {recording && <span className="indikator-snimanja">● Snimanje u toku...</span>}
      {sending && <span className="indikator-obrade">Šaljem završenu izjavu na transkripciju...</span>}
    </div>
  );
}
