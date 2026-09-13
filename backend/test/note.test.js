// Draft rules: no model may be required for a local draft, and no draft may
// arrive with an assessment nobody spoke.
const assert = require("node:assert/strict");
const test = require("node:test");

const { draftNote, deterministicDraft, LABELS } = require("../lib/note");

const SEGMENTS = [
  { speaker: "dr. Begić", role: "doctor", text: "Recite mi šta vas dovodi danas." },
  { speaker: "Pacijent", role: "patient", text: "Kašljem već pet dana." },
];

test("the deterministic draft keeps the spoken record and invents nothing", () => {
  const draft = deterministicDraft(SEGMENTS);
  assert.deepEqual(draft.sections.map((section) => section.label), LABELS);
  assert.equal(draft.sections[0].items.length, 2);
  assert.deepEqual(draft.sections[0].items[0].evidence, [0]);
  for (const label of ["Objektivno", "Procjena", "Plan"]) {
    const section = draft.sections.find((entry) => entry.label === label);
    assert.equal(section.items.length, 0, `${label} must stay empty without a model`);
  }
  assert.ok(draft.warnings.length, "the clinician must be told a model was not used");
});

test("a local draft never fails for want of a model", async () => {
  process.env.MEDISCRIBE_OLLAMA_URL = "http://127.0.0.1:9";  // nothing listens here
  const draft = await draftNote(SEGMENTS, "local");
  assert.deepEqual(draft.sections.map((section) => section.label), LABELS);
  assert.ok(draft.sections[0].items.length);
});

test("an empty transcript is refused", async () => {
  await assert.rejects(() => draftNote([], "local"), (error) => error.status === 400);
});

test("external drafting is refused when no key is configured", async () => {
  const key = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  await assert.rejects(() => draftNote(SEGMENTS, "cloud"), (error) => error.status === 503);
  if (key) process.env.OPENROUTER_API_KEY = key;
});
