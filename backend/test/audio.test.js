// A transcript is only as good as the band the microphone sent.
const assert = require("node:assert/strict");
const test = require("node:test");

const { speechBandTilt, NARROW_BAND_TILT } = require("../lib/audio");

// ffmpeg does not always write the textbook 44-byte header, so the header is
// built here the way it is parsed: by chunk, with something in front of `data`.
function wav(samples, { extraChunk = false } = {}) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((value, index) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value))), index * 2));
  const fmt = Buffer.alloc(24);
  fmt.write("fmt ", 0, "ascii");
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(1, 10);
  fmt.writeUInt32LE(16000, 12);
  fmt.writeUInt32LE(32000, 16);
  fmt.writeUInt16LE(2, 20);
  fmt.writeUInt16LE(16, 22);
  const list = Buffer.alloc(8 + 10);
  list.write("LIST", 0, "ascii");
  list.writeUInt32LE(10, 4);
  const header = Buffer.alloc(8);
  header.write("data", 0, "ascii");
  header.writeUInt32LE(data.length, 4);
  const body = Buffer.concat(extraChunk ? [fmt, list, header, data] : [fmt, header, data]);
  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(4 + body.length, 4);
  riff.write("WAVE", 8, "ascii");
  return Buffer.concat([riff, body]);
}

const SECONDS = 2;
const RATE = 16000;
const tone = (hz) => Array.from({ length: RATE * SECONDS }, (_, i) => 12000 * Math.sin((2 * Math.PI * hz * i) / RATE));
const noise = () => Array.from({ length: RATE * SECONDS }, () => (Math.random() * 2 - 1) * 9000);

test("audio with no high frequencies is marked narrow band", () => {
  const tilt = speechBandTilt(wav(tone(220)));
  assert.ok(tilt !== null, "a loud clip must get a verdict");
  assert.ok(tilt < NARROW_BAND_TILT, `expected a narrow verdict, got ${tilt}`);
});

test("audio carrying the whole band is not marked", () => {
  const tilt = speechBandTilt(wav(noise()));
  assert.ok(tilt > NARROW_BAND_TILT, `expected a healthy verdict, got ${tilt}`);
});

test("samples are found after any header, not at a fixed offset", () => {
  // The same audio behind an extra chunk must produce the same verdict; reading
  // from byte 44 measured shifted bytes and called crippled audio healthy.
  const samples = tone(220);
  assert.equal(speechBandTilt(wav(samples, { extraChunk: true })), speechBandTilt(wav(samples)));
});

test("a clip too quiet to judge gets no verdict rather than a wrong one", () => {
  const quiet = tone(220).map((v) => v / 200);
  assert.equal(speechBandTilt(wav(quiet)), null);
});
