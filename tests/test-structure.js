// Jednostavan test za /api/structure endpoint.
// VAŽNO: Backend (npm run start u /backend) i Ollama server (ollama serve) moraju raditi
// prije pokretanja ovog testa.
//
// Pokretanje: node tests/test-structure.js

const assert = require("assert");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

// Hardkodiran primjer transkripta na bosanskom jeziku
const PRIMJER_TRANSKRIPTA =
  "Pacijent star 45 godina dolazi na pregled zbog bolova u leđima koji traju već sedmicu dana. " +
  "Kaže da je bol počeo nakon dizanja teškog tereta na poslu. Ranije nije imao problema sa kičmom, " +
  "ne uzima nikakve lijekove redovno. Pri pregledu prisutna je bolna osjetljivost u predjelu lumbalne kičme, " +
  "bez neuroloških ispada. Dijagnoza: lumbalni sindrom. Terapija: Ibuprofen 400mg 2x1 pet dana i mirovanje.";

const OCEKIVANA_POLJA = ["glavne_tegobe", "anamneza", "objektivni_nalaz_dijagnoza", "terapija_lijekovi"];

async function pokreniTest() {
  console.log("Šaljem zahtjev na", `${BACKEND_URL}/api/structure`, "...");

  const odgovor = await fetch(`${BACKEND_URL}/api/structure`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript: PRIMJER_TRANSKRIPTA }),
  });

  assert.strictEqual(odgovor.ok, true, `Očekivan uspješan HTTP status, dobijeno: ${odgovor.status}`);

  const karton = await odgovor.json();
  console.log("Dobijen karton:", JSON.stringify(karton, null, 2));

  for (const polje of OCEKIVANA_POLJA) {
    assert.ok(polje in karton, `Nedostaje očekivano polje: ${polje}`);
    assert.strictEqual(typeof karton[polje], "string", `Polje '${polje}' mora biti tekst (string)`);
    assert.ok(karton[polje].trim().length > 0, `Polje '${polje}' ne smije biti prazno`);
  }

  console.log("\n✅ Test prošao: /api/structure vraća validan JSON sa svim očekivanim poljima.");
}

pokreniTest().catch((greska) => {
  console.error("\n❌ Test nije prošao:", greska.message);
  process.exit(1);
});
