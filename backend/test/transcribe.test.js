// What the provider hands back is not trusted as-is.
const assert = require("node:assert/strict");
const test = require("node:test");

const { isHallucinated, derivedConfidence } = require("../routes/transcribe_openrouter");

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
