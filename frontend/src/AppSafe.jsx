import { useState } from "react";
import RecorderSafe from "./components/RecorderSafe.jsx";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
const PRAZAN_NACRT = { subjective: "", objective: "", assessment: "", plan: "", warnings: [] };
const NAZIVI_POLJA = {
  subjective: "Subjektivno (izgovoreni sadržaj)",
  objective: "Objektivno",
  assessment: "Procjena",
  plan: "Plan",
};

export default function AppSafe() {
  const [transcript, setTranscript] = useState("");
  const [nacrt, setNacrt] = useState(PRAZAN_NACRT);
  const [odobrenaVanjskaObrada, setOdobrenaVanjskaObrada] = useState(false);
  const [obradaUToku, setObradaUToku] = useState(false);
  const [poruka, setPoruka] = useState("");
  const [greska, setGreska] = useState("");

  async function obradiTranskript(text) {
    const cleaned = text.trim();
    if (!cleaned) return;
    setTranscript(cleaned);
    setGreska("");
    setPoruka("Lokalno pripremam nacrt...");
    setObradaUToku(true);
    try {
      const odgovor = await fetch(`${BACKEND_URL}/api/structure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: cleaned }),
      });
      const podaci = await odgovor.json();
      if (!odgovor.ok) throw new Error(podaci.greska || "Priprema nacrta nije uspjela.");
      setNacrt({ ...PRAZAN_NACRT, ...podaci });
      setPoruka("Nacrt je spreman za kliničku provjeru. Ništa nije trajno sačuvano.");
    } catch (error) {
      setGreska(error.message || "Priprema nacrta nije uspjela.");
      setPoruka("");
    } finally {
      setObradaUToku(false);
    }
  }

  function izmijeniPolje(polje, vrijednost) {
    setNacrt((trenutni) => ({ ...trenutni, [polje]: vrijednost }));
  }

  return (
    <div className="app-kontejner">
      <header className="app-header">
        <h1>🩺 MediScribe</h1>
        <p className="podnaslov">Bosanski transkript i lokalni nacrt za obaveznu provjeru kliničara.</p>
      </header>

      <section className="sekcija">
        <h2>Vanjska transkripcija</h2>
        <label className="potvrda-obrada">
          <input
            type="checkbox"
            checked={odobrenaVanjskaObrada}
            onChange={(event) => setOdobrenaVanjskaObrada(event.target.checked)}
          />
          Potvrđujem da je slanje ovog audio zapisa odobreno za vanjsku obradu.
        </label>
        <p className="napomena-sitna">
          Snimak se šalje samo nakon zaustavljanja trenutne izjave. Nije trajno sačuvan u ovom pregledniku ili serveru.
        </p>
        <RecorderSafe
          remoteProcessingApproved={odobrenaVanjskaObrada}
          onTranscript={obradiTranskript}
          onError={setGreska}
          onProcessing={() => { setGreska(""); setPoruka("Transkribujem bosanski audio..."); }}
        />
        {obradaUToku && <div className="status-obrada">⏳ Obrađujem...</div>}
        {poruka && !obradaUToku && <div className="status-poruka">{poruka}</div>}
        {greska && <div className="status-greska">⚠️ {greska}</div>}
      </section>

      <section className="sekcija">
        <h2>Autoritativni transkript</h2>
        <textarea
          className="textarea-transkript"
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          placeholder="Transkript će se pojaviti nakon obrade ili ga ovdje unesi ručno."
          rows={6}
        />
        <button className="dugme dugme-primarno dugme-generisi" onClick={() => obradiTranskript(transcript)} disabled={!transcript.trim() || obradaUToku}>
          Pripremi lokalni nacrt
        </button>
      </section>

      <section className="sekcija">
        <h2>Nacrt bilješke — provjeriti prije upotrebe</h2>
        <div className="karton-mreza">
          {Object.keys(NAZIVI_POLJA).map((polje) => (
            <div className="karton-polje" key={polje}>
              <label htmlFor={polje}>{NAZIVI_POLJA[polje]}</label>
              <textarea id={polje} rows={4} value={nacrt[polje] || ""} onChange={(event) => izmijeniPolje(polje, event.target.value)} />
            </div>
          ))}
        </div>
        <div className="ai-prijedlog-blok">
          <strong>Upozorenja</strong>
          <ul>{nacrt.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      </section>
    </div>
  );
}
