// Ruta koja generiše ODVOJEN "AI prijedlog" - dodatne dijagnoze/upozorenja za provjeru od strane doktora
// VAŽNO: Ovo NIJE dio zvaničnog kartona, već pomoćni prijedlog koji doktor mora ručno provjeriti.
const express = require("express");
const fetch = require("node-fetch");

const router = express.Router();

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";

const PRIMJER_ULAZA =
  "Pacijentica navodi alergiju na penicilin. Uzima varfarin zbog fibrilacije atrija. " +
  "Sada se žali na bol u stomaku i predlaže joj se ibuprofen za bolove.";

const PRIMJER_IZLAZA = {
  moguce_dodatne_dijagnoze: "Nema dovoljno podataka u transkriptu za dodatne dijagnoze.",
  upozorenja:
    "Pacijentica je alergična na penicilin - izbjegavati peniciline i srodne antibiotike. " +
    "Uzima varfarin - ibuprofen (NSAIL) može povećati rizik od krvarenja u kombinaciji sa varfarinom, provjeriti prije propisivanja.",
  predlozene_dodatne_pretrage: "Provjeriti INR vrijednost prije uvođenja bilo kojeg NSAIL lijeka.",
};

function napraviPrompt(transcript) {
  return `Ti si medicinski asistent za DRUGO MIŠLJENJE. Tvoj zadatak je da analiziraš transkript razgovora doktora i pacijenta
i predložiš stavke koje doktor treba RUČNO PROVJERITI. Ovo nije zvaničan karton, samo pomoćni prijedlog.

KRITIČNO PRAVILO: Ne smiješ izmišljati medicinske podatke (alergije, lijekove, dijagnoze) koji NISU eksplicitno spomenuti
ili logično izvedivi iz transkripta. Ako nema dovoljno podataka za neku stavku, jasno napiši
"Nema dovoljno podataka u transkriptu za ovu stavku." Nemoj nagađati.

Vrati ISKLJUČIVO validan JSON objekat, bez markdown oznaka (bez \`\`\`), bez dodatnog teksta prije ili poslije JSON-a.
JSON mora imati tačno ova polja (kao tekstualni stringovi):
- moguce_dodatne_dijagnoze (moguće dodatne dijagnoze za provjeru, na osnovu simptoma iz transkripta)
- upozorenja (upozorenja na interakcije lijekova ili alergije SAMO ako su eksplicitno spomenute u transkriptu)
- predlozene_dodatne_pretrage (prijedlog dodatnih pretraga/analiza koje bi doktor mogao razmotriti)

Primjer transkripta:
"${PRIMJER_ULAZA}"

Primjer očekivanog JSON odgovora:
${JSON.stringify(PRIMJER_IZLAZA, null, 2)}

Sada analiziraj sljedeći transkript:
"${transcript}"

Vrati samo JSON, ništa drugo.`;
}

function ocistiJsonOdgovor(sirovText) {
  let tekst = sirovText.trim();
  tekst = tekst.replace(/^```(?:json)?/i, "").replace(/```$/, "");
  return tekst.trim();
}

function parsirajJson(sirovText) {
  const ocisceno = ocistiJsonOdgovor(sirovText);

  try {
    return JSON.parse(ocisceno);
  } catch (prvaGreska) {
    const poklapanje = ocisceno.match(/\{[\s\S]*\}/);
    if (poklapanje) {
      return JSON.parse(poklapanje[0]);
    }
    throw prvaGreska;
  }
}

router.post("/", async (req, res) => {
  const { transcript } = req.body;

  if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
    return res.status(400).json({ greska: "Polje 'transcript' je obavezno i mora biti tekst." });
  }

  try {
    const odgovor = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: napraviPrompt(transcript),
        stream: false,
        format: "json",
      }),
    });

    if (!odgovor.ok) {
      throw new Error(`Ollama je vratila status ${odgovor.status}`);
    }

    const podaci = await odgovor.json();
    const prijedlozi = parsirajJson(podaci.response || "");

    res.json({ ai_prijedlozi: prijedlozi });
  } catch (greska) {
    console.error("Greška prilikom generisanja AI prijedloga:", greska);
    res.status(500).json({
      greska: "Generisanje AI prijedloga nije uspjelo. Provjeri da li Ollama server radi (ollama serve).",
      detalji: greska.message,
    });
  }
});

module.exports = router;
