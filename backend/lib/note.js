// Draft note preparation.
//
// A draft is only ever prepared from a final transcript. Three routes exist and
// the caller picks one with the session mode:
//
//   local   the draft is written on this machine (Ollama when installed,
//           otherwise the deterministic structure below). Nothing leaves.
//   hybrid  the audio stayed on the device; only the finished transcript text
//           is sent to the configured external model.
//   cloud   the external model is used, same as hybrid.
//
// The model is asked to organize what was said and nothing more: it may not add
// a diagnosis, an examination finding, or a medication that was not spoken.

const LABELS = ["Subjektivno", "Objektivno", "Procjena", "Plan"];
const OLLAMA = process.env.MEDISCRIBE_OLLAMA_URL || "http://127.0.0.1:11434";
const DRAFT_MODEL = process.env.MEDISCRIBE_OPENROUTER_DRAFT_MODEL || "anthropic/claude-sonnet-5";

const SYSTEM = `Ti si pomoćnik za medicinsku dokumentaciju. Organiziraš transkript razgovora ljekara i pacijenta u nacrt SOAP nalaza na bosanskom jeziku.

Pravila koja se ne krše:
- Koristi isključivo ono što je izgovoreno. Ne izmišljaj dijagnozu, nalaz pregleda, lijek, dozu ni vrijednost.
- "Procjena" popuni samo ako je ljekar izgovorio procjenu ili sumnju. Ako nije, ostavi listu praznom.
- Svaka stavka mora imati "evidence": indekse segmenata iz kojih je nastala.
- Piši kratko, u trećem licu, medicinskim stilom, na bosanskom.
- U "warnings" prijavi alergije, nazive lijekova, vitalne znake prepisane iz govora i sve što ljekar mora provjeriti.
- U "speakers" odredi ulogu svakog segmenta: "doctor", "patient" ili "unknown" kad nisi siguran.

Odgovori isključivo JSON objektom ovog oblika:
{"sections":[{"label":"Subjektivno","items":[{"text":"...","evidence":[0]}]},{"label":"Objektivno","items":[]},{"label":"Procjena","items":[]},{"label":"Plan","items":[]}],"warnings":[{"kind":"...","text":"...","evidence":0}],"speakers":[{"index":0,"role":"doctor"}]}`;

function transcriptText(segments) {
  return segments.map((segment, index) => `[${index}] ${segment.speaker || "nepoznat"}: ${segment.text}`).join("\n");
}

function emptySections() {
  return LABELS.map((label) => ({ label, items: [] }));
}

// Used when no model is available: the spoken record is kept verbatim under
// Subjektivno and the clinical reading is left to the clinician.
function deterministicDraft(segments) {
  const sections = emptySections();
  sections[0].items = segments.map((segment, index) => ({ text: segment.text, evidence: [index] }));
  return {
    sections,
    warnings: [
      { kind: "Nacrt bez modela", text: "Nacrt je složen bez jezičkog modela: izgovoreni tekst je prenesen u Subjektivno, a procjenu i plan upisuje ljekar." },
    ],
    speakers: [],
  };
}

function normalize(parsed, segments) {
  const byLabel = new Map((parsed?.sections || []).map((section) => [String(section.label), section]));
  const sections = LABELS.map((label) => {
    const section = byLabel.get(label);
    const items = (section?.items || [])
      .map((item) => ({
        text: String(item?.text || "").trim(),
        evidence: (Array.isArray(item?.evidence) ? item.evidence : [])
          .map(Number)
          .filter((index) => Number.isInteger(index) && index >= 0 && index < segments.length),
      }))
      .filter((item) => item.text);
    return { label, items };
  });
  const warnings = (parsed?.warnings || [])
    .map((warning) => ({
      kind: String(warning?.kind || "Provjerite prije unosa u karton").slice(0, 80),
      text: String(warning?.text || "").slice(0, 300),
      evidence: Number.isInteger(warning?.evidence) ? warning.evidence : undefined,
    }))
    .filter((warning) => warning.text);
  const speakers = (parsed?.speakers || [])
    .map((speaker) => ({ index: Number(speaker?.index), role: String(speaker?.role || "unknown") }))
    .filter((speaker) => Number.isInteger(speaker.index) && speaker.index < segments.length);
  return { sections, warnings, speakers };
}

function parseJson(content) {
  const text = String(content || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model nije vratio JSON nacrt.");
  return JSON.parse(text.slice(start, end + 1));
}

async function openRouterDraft(segments) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    const error = new Error("Vanjski model za nacrt nije konfiguriran.");
    error.status = 503;
    throw error;
  }
  const euOnly = String(process.env.MEDISCRIBE_OPENROUTER_EU_ONLY || "").toLowerCase() === "true";
  const base = euOnly ? "https://eu.openrouter.ai/api/v1" : "https://openrouter.ai/api/v1";
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/TarikTopalovic/MedicalScribe",
      "X-OpenRouter-Title": "MediScribe",
    },
    body: JSON.stringify({
      model: DRAFT_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      provider: { zdr: true, data_collection: "deny" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: transcriptText(segments) },
      ],
    }),
  });
  if (!response.ok) {
    const error = new Error(response.status === 402 ? "Nedostaje OpenRouter kredit." : "Vanjski model nije pripremio nacrt.");
    error.status = response.status === 402 ? 402 : 502;
    throw error;
  }
  const body = await response.json();
  return normalize(parseJson(body.choices?.[0]?.message?.content), segments);
}

async function ollamaModel() {
  if (process.env.MEDISCRIBE_OLLAMA_MODEL) return process.env.MEDISCRIBE_OLLAMA_MODEL;
  const response = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(1500) });
  if (!response.ok) return null;
  const body = await response.json();
  return body.models?.[0]?.name || null;
}

async function ollamaDraft(segments) {
  const model = await ollamaModel();
  if (!model) return null;
  const response = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      options: { temperature: 0 },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: transcriptText(segments) },
      ],
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) return null;
  const body = await response.json();
  return normalize(parseJson(body.message?.content), segments);
}

// Local drafting never fails the session: when no local model answers, the
// deterministic structure is returned instead.
async function localDraft(segments) {
  try {
    const draft = await ollamaDraft(segments);
    if (draft) return draft;
  } catch {
    // fall through to the deterministic structure
  }
  return deterministicDraft(segments);
}

async function draftNote(segments, mode) {
  if (!segments.length) {
    const error = new Error("Nacrt se priprema samo iz konačnog transkripta.");
    error.status = 400;
    throw error;
  }
  if (mode === "local") return localDraft(segments);
  return openRouterDraft(segments);
}

function draftCapabilities() {
  return {
    external: Boolean(process.env.OPENROUTER_API_KEY),
    model: process.env.OPENROUTER_API_KEY ? DRAFT_MODEL : "",
  };
}

module.exports = { draftNote, draftCapabilities, deterministicDraft, LABELS };
