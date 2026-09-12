// Ruta koja strukturira sirovi transkript u elektronski karton pomoću lokalnog Ollama modela
const express = require("express");
const fetch = require("node-fetch");

const router = express.Router();

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";

// Primjer strukture koji šaljemo modelu kao few-shot da smanjimo šansu za nevalidan JSON
const PRIMJER_ULAZA =
  "Pacijent se žali na jak bol u grlu i povišenu temperaturu tri dana. " +
  "Ranije nije imao slične tegobe. Pri pregledu grlo crveno, tonzile uvećane sa naslagama. " +
  "Dijagnoza: akutni tonzilofaringitis. Terapija: Amoksicilin 500mg 3x1 sedam dana, paracetamol po potrebi.";

const PRIMJER_IZLAZA = {
  glavne_tegobe: "Jak bol u grlu i povišena temperatura, traje tri dana.",
  anamneza: "Ranije nije imao slične tegobe.",
  objektivni_nalaz_dijagnoza: "Grlo crveno, tonzile uvećane sa naslagama. Dijagnoza: akutni tonzilofaringitis.",
  terapija_lijekovi: "Amoksicilin 500mg 3x1 sedam dana, paracetamol po potrebi.",
};

function napraviPrompt(transcript) {
  return `Ti si medicinski asistent koji strukturira transkript razgovora doktora i pacijenta u elektronski karton.

Vrati ISKLJUČIVO validan JSON objekat, bez markdown oznaka (bez \`\`\`), bez dodatnog teksta prije ili poslije JSON-a.
JSON mora imati tačno ova polja (sva kao tekstualni stringovi na bosanskom/hrvatskom/srpskom jeziku):
- glavne_tegobe
- anamneza
- objektivni_nalaz_dijagnoza
- terapija_lijekovi

Ako neki podatak nije spomenut u transkriptu, upiši "Nije navedeno u transkriptu." za to polje. Ne izmišljaj podatke.

Primjer transkripta:
"${PRIMJER_ULAZA}"

Primjer očekivanog JSON odgovora:
${JSON.stringify(PRIMJER_IZLAZA, null, 2)}

Sada strukturiraj sljedeći transkript:
"${transcript}"

Vrati samo JSON, ništa drugo.`;
}

// Uklanja markdown fenced blokove (```json ... ```) ako ih model ipak vrati
function ocistiJsonOdgovor(sirovText) {
  let tekst = sirovText.trim();
  tekst = tekst.replace(/^```(?:json)?/i, "").replace(/```$/, "");
  return tekst.trim();
}

// Bezbjedno parsira JSON odgovor modela, uz pokušaj izvlačenja JSON-a iz teksta ako ima viška sadržaja
function parsirajJson(sirovText) {
  const ocisceno = ocistiJsonOdgovor(sirovText);

  try {
    return JSON.parse(ocisceno);
  } catch (prvaGreska) {
    // Fallback: pokušaj pronaći prvi { ... } blok u tekstu
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
    const karton = parsirajJson(podaci.response || "");

    // Osiguravamo da svako očekivano polje postoji u odgovoru
    const ocekivanaPolja = ["glavne_tegobe", "anamneza", "objektivni_nalaz_dijagnoza", "terapija_lijekovi"];
    for (const polje of ocekivanaPolja) {
      if (!(polje in karton)) {
        karton[polje] = "Nije navedeno u transkriptu.";
      }
    }

    res.json(karton);
  } catch (greska) {
    console.error("Greška prilikom strukturiranja kartona:", greska);
    res.status(500).json({
      greska: "Strukturiranje kartona nije uspjelo. Provjeri da li Ollama server radi (ollama serve).",
      detalji: greska.message,
    });
  }
});

module.exports = router;
