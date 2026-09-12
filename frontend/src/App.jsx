// Glavna stranica MedScribe AI aplikacije
import { useEffect, useState } from "react";
import Recorder from "./components/Recorder.jsx";

const BACKEND_URL = "http://localhost:3001";
const LOCALSTORAGE_KLJUC = "medscribe_zapisi";

const PRAZAN_KARTON = {
  glavne_tegobe: "",
  anamneza: "",
  objektivni_nalaz_dijagnoza: "",
  terapija_lijekovi: "",
};

const NAZIVI_POLJA_KARTONA = {
  glavne_tegobe: "Glavne tegobe",
  anamneza: "Anamneza",
  objektivni_nalaz_dijagnoza: "Objektivni nalaz i dijagnoza",
  terapija_lijekovi: "Terapija i lijekovi",
};

const NAZIVI_POLJA_PRIJEDLOGA = {
  moguce_dodatne_dijagnoze: "Moguće dodatne dijagnoze za provjeru",
  upozorenja: "Upozorenja (interakcije / alergije)",
  predlozene_dodatne_pretrage: "Prijedlog dodatnih pretraga",
};

function App() {
  const [transcript, setTranscript] = useState("");
  const [karton, setKarton] = useState(PRAZAN_KARTON);
  const [aiPrijedlog, setAiPrijedlog] = useState(null);
  const [obradaUToku, setObradaUToku] = useState(false);
  const [poruka, setPoruka] = useState("");
  const [greska, setGreska] = useState("");
  const [sacuvaniZapisi, setSacuvaniZapisi] = useState([]);

  // Učitavamo prethodno sačuvane zapise iz localStorage-a pri pokretanju aplikacije
  useEffect(() => {
    try {
      const sacuvano = localStorage.getItem(LOCALSTORAGE_KLJUC);
      if (sacuvano) {
        setSacuvaniZapisi(JSON.parse(sacuvano));
      }
    } catch (e) {
      console.warn("Nije moguće učitati sačuvane zapise iz localStorage-a:", e);
    }
  }, []);

  // Kada Recorder javi da je transkript stigao, automatski pozivamo strukturiranje i AI prijedlog
  async function obradiTranskript(text) {
    setTranscript(text);
    setGreska("");
    setPoruka("Obrađujem transkript...");
    setObradaUToku(true);

    try {
      const [odgovorStruktura, odgovorPrijedlog] = await Promise.all([
        fetch(`${BACKEND_URL}/api/structure`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: text }),
        }),
        fetch(`${BACKEND_URL}/api/suggest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: text }),
        }),
      ]);

      const podaciStruktura = await odgovorStruktura.json();
      const podaciPrijedlog = await odgovorPrijedlog.json();

      if (!odgovorStruktura.ok) {
        throw new Error(podaciStruktura.greska || "Strukturiranje kartona nije uspjelo.");
      }
      if (!odgovorPrijedlog.ok) {
        throw new Error(podaciPrijedlog.greska || "Generisanje AI prijedloga nije uspjelo.");
      }

      setKarton({ ...PRAZAN_KARTON, ...podaciStruktura });
      setAiPrijedlog(podaciPrijedlog.ai_prijedlozi);
      setPoruka("Obrada završena. Provjeri i po potrebi ispravi karton prije čuvanja.");
    } catch (e) {
      console.error("Greška prilikom obrade transkripta:", e);
      setGreska(e.message || "Došlo je do greške prilikom obrade transkripta.");
      setPoruka("");
    } finally {
      setObradaUToku(false);
    }
  }

  function izmijeniPoljeKartona(polje, vrijednost) {
    setKarton((prethodno) => ({ ...prethodno, [polje]: vrijednost }));
  }

  function sacuvajZapis() {
    const noviZapis = {
      id: Date.now(),
      datumVrijeme: new Date().toLocaleString("bs-BA"),
      transcript,
      karton,
      aiPrijedlog,
    };

    const azuriraniZapisi = [noviZapis, ...sacuvaniZapisi];
    setSacuvaniZapisi(azuriraniZapisi);

    try {
      localStorage.setItem(LOCALSTORAGE_KLJUC, JSON.stringify(azuriraniZapisi));
      setPoruka("Zapis je sačuvan lokalno (localStorage).");
    } catch (e) {
      console.error("Greška prilikom čuvanja u localStorage:", e);
      setGreska("Čuvanje zapisa nije uspjelo.");
    }
  }

  function ucitajZapis(zapis) {
    setTranscript(zapis.transcript);
    setKarton(zapis.karton);
    setAiPrijedlog(zapis.aiPrijedlog);
    setPoruka(`Učitan zapis od ${zapis.datumVrijeme}.`);
    setGreska("");
  }

  function obrisiSveZapise() {
    setSacuvaniZapisi([]);
    localStorage.removeItem(LOCALSTORAGE_KLJUC);
  }

  return (
    <div className="app-kontejner">
      <header className="app-header">
        <h1>🩺 MedScribe AI</h1>
        <p className="podnaslov">Snimi razgovor sa pacijentom i automatski generiši strukturirani karton.</p>
      </header>

      <section className="sekcija">
        <Recorder
          onTranskriptDobijen={obradiTranskript}
          onGreska={(poruka) => setGreska(poruka)}
          onPocetakObrade={() => {
            setGreska("");
            setPoruka("Transkribujem audio...");
          }}
        />

        {obradaUToku && <div className="status-obrada">⏳ Obrađujem...</div>}
        {poruka && !obradaUToku && <div className="status-poruka">{poruka}</div>}
        {greska && <div className="status-greska">⚠️ {greska}</div>}
      </section>

      <section className="sekcija">
        <h2>Transkript</h2>
        <textarea
          className="textarea-transkript"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Transkript razgovora će se pojaviti ovdje nakon snimanja (ili ga možeš ručno nalijepiti)..."
          rows={6}
        />
        <button
          className="dugme dugme-primarno dugme-generisi"
          onClick={() => obradiTranskript(transcript)}
          disabled={!transcript.trim() || obradaUToku}
        >
          🧠 Generiši karton (AI)
        </button>
        <p className="napomena-sitna">
          Nakon snimanja karton se popunjava automatski. Ako ručno izmijeniš transkript, klikni ovo dugme da
          ponovo generišeš karton. Obrada preko lokalnog Ollama modela može potrajati od nekoliko sekundi do
          nekoliko minuta, zavisno od hardvera.
        </p>
      </section>

      <section className="sekcija">
        <h2>Elektronski karton</h2>
        <div className="karton-mreza">
          {Object.keys(PRAZAN_KARTON).map((polje) => (
            <div className="karton-polje" key={polje}>
              <label htmlFor={polje}>{NAZIVI_POLJA_KARTONA[polje]}</label>
              <textarea
                id={polje}
                rows={4}
                value={karton[polje] || ""}
                onChange={(e) => izmijeniPoljeKartona(polje, e.target.value)}
              />
            </div>
          ))}
        </div>
      </section>

      {aiPrijedlog && (
        <section className="sekcija ai-prijedlog-blok">
          <h2>⚠️ AI prijedlog — provjeriti</h2>
          <p className="ai-prijedlog-napomena">
            Ovo NIJE zvanični dio kartona i NIJE potvrđena medicinska činjenica. Prijedlog generisan od strane AI
            modela koji doktor mora ručno provjeriti prije bilo kakve odluke.
          </p>
          <div className="ai-prijedlog-sadrzaj">
            {typeof aiPrijedlog === "string" ? (
              <p>{aiPrijedlog}</p>
            ) : (
              Object.keys(NAZIVI_POLJA_PRIJEDLOGA).map((polje) =>
                aiPrijedlog[polje] ? (
                  <div className="ai-prijedlog-stavka" key={polje}>
                    <strong>{NAZIVI_POLJA_PRIJEDLOGA[polje]}:</strong>
                    <p>{aiPrijedlog[polje]}</p>
                  </div>
                ) : null
              )
            )}
          </div>
        </section>
      )}

      <section className="sekcija akcije">
        <button className="dugme dugme-primarno" onClick={sacuvajZapis} disabled={!transcript}>
          💾 Sačuvaj
        </button>
      </section>

      {sacuvaniZapisi.length > 0 && (
        <section className="sekcija">
          <div className="zapisi-header">
            <h2>Sačuvani zapisi ({sacuvaniZapisi.length})</h2>
            <button className="dugme dugme-sekundarno" onClick={obrisiSveZapise}>
              Obriši sve
            </button>
          </div>
          <ul className="lista-zapisa">
            {sacuvaniZapisi.map((zapis) => (
              <li key={zapis.id}>
                <button className="dugme-link" onClick={() => ucitajZapis(zapis)}>
                  {zapis.datumVrijeme} — {zapis.karton.glavne_tegobe?.slice(0, 60) || "(bez glavnih tegoba)"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default App;
