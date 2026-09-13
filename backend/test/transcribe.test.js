// What the provider hands back is not trusted as-is.
const assert = require("node:assert/strict");
const test = require("node:test");

const { isHallucinated, derivedConfidence } = require("../routes/transcribe_openrouter");
const { withoutCaptionArtefacts } = require("../routes/transcribe_local");

test("clear non-speech is dropped", () => {
  assert.equal(isHallucinated({ no_speech_prob: 1, avg_logprob: -1.4 }), true);
});

test("real speech is kept, including quiet or uncertain speech", () => {
  assert.equal(isHallucinated({ no_speech_prob: 0.1, avg_logprob: -0.45 }), false);
  assert.equal(isHallucinated({ no_speech_prob: 0.9, avg_logprob: -0.3 }), false, "confident text must survive");
  assert.equal(isHallucinated({ no_speech_prob: 0.2, avg_logprob: -1.8 }), false, "uncertain speech is flagged, not deleted");
});

test("confidence comes from the provider's log probabilities", () => {
  assert.equal(derivedConfidence([{ avg_logprob: 0 }]), 1);
  const value = derivedConfidence([{ avg_logprob: -0.45 }, { avg_logprob: -0.55 }]);
  assert.ok(value > 0.55 && value < 0.65, `expected ~0.61, got ${value}`);
});

test("a provider that reports nothing leaves confidence unknown", () => {
  assert.equal(derivedConfidence([{ text: "x" }]), null);
  assert.equal(derivedConfidence([]), null);
});

// A silent clip once decoded to "Hvala što pratite kanal." and was saved as a
// clinical summary. Voice activity detection stops it at the source; this is
// the second line of defence.
test("subtitle credits never reach a transcript", () => {
  const kept = withoutCaptionArtefacts([
    { text: " Hvala što pratite kanal." },
    { text: "Pretplatite se!" },
    { text: "Titlovi by Amara.org" },
    { text: "Pacijent ima bol u grudima." },
  ]);
  assert.deepEqual(kept.map((segment) => segment.text.trim()), ["Pacijent ima bol u grudima."]);
});

test("ordinary gratitude in a consultation is not mistaken for credits", () => {
  const kept = withoutCaptionArtefacts([{ text: "Hvala, doktore." }, { text: "Hvala vam puno." }]);
  assert.equal(kept.length, 2);
});
