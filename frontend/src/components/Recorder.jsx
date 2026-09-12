// Komponenta za snimanje audio zapisa razgovora sa pacijentom pomoću MediaRecorder Web API-ja
import { useRef, useState } from "react";

const BACKEND_URL = "http://localhost:3001";

function Recorder({ onTranskriptDobijen, onGreska, onPocetakObrade }) {
  const [snimaSe, setSnimaSe] = useState(false);
  const [saljeSe, setSaljeSe] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioDijeloviRef = useRef([]);

  // Pokreće snimanje mikrofona
  async function pokreniSnimanje() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

      audioDijeloviRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioDijeloviRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Zaustavljamo sve trakove mikrofona nakon snimanja
        stream.getTracks().forEach((trak) => trak.stop());

        const audioBlob = new Blob(audioDijeloviRef.current, { type: "audio/webm" });
        await posaljiNaTranskripciju(audioBlob);
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setSnimaSe(true);
    } catch (greska) {
      console.error("Greška prilikom pristupa mikrofonu:", greska);
      onGreska("Nije moguće pristupiti mikrofonu. Provjeri dozvole u browseru.");
    }
  }

  // Zaustavlja snimanje - onstop hendler šalje audio na backend
  function zaustaviSnimanje() {
    if (mediaRecorderRef.current && snimaSe) {
      mediaRecorderRef.current.stop();
      setSnimaSe(false);
    }
  }

  // Šalje snimljeni audio na backend radi transkripcije preko Groq Whisper API-ja
  async function posaljiNaTranskripciju(audioBlob) {
    setSaljeSe(true);
    onPocetakObrade();

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "snimak.webm");

      const odgovor = await fetch(`${BACKEND_URL}/api/transcribe`, {
        method: "POST",
        body: formData,
      });

      const podaci = await odgovor.json();

      if (!odgovor.ok) {
        throw new Error(podaci.greska || "Transkripcija nije uspjela.");
      }

      onTranskriptDobijen(podaci.text);
    } catch (greska) {
      console.error("Greška prilikom slanja audio zapisa:", greska);
      onGreska(greska.message || "Slanje audio zapisa na server nije uspjelo.");
    } finally {
      setSaljeSe(false);
    }
  }

  return (
    <div className="recorder">
      {!snimaSe ? (
        <button className="dugme dugme-primarno" onClick={pokreniSnimanje} disabled={saljeSe}>
          🎙️ Pokreni snimanje
        </button>
      ) : (
        <button className="dugme dugme-opasnost" onClick={zaustaviSnimanje}>
          ⏹️ Zaustavi snimanje
        </button>
      )}

      {snimaSe && <span className="indikator-snimanja">● Snimanje u toku...</span>}
      {saljeSe && <span className="indikator-obrade">Šaljem audio na transkripciju...</span>}
    </div>
  );
}

export default Recorder;
