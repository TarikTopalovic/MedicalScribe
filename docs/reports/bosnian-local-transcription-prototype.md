# Bosnian local-transcription prototype report

Date: 2026-09-12

## Delivered

This branch adds a CPU-only, local prototype for Bosnian (`bs`) transcription.
It has no frontend dependency and keeps the interface intentionally small.

The implemented flow is:

```text
16 kHz mono microphone chunks
  -> small-q5_1 provisional text while speaking
  -> utterance boundary (target: 700 ms silence)
  -> large-v3-turbo-q5_0 authoritative segments
  -> local Bosnian clinician-reviewed draft generation
```

Provisional text is structurally separated from final segments. It may be shown
in a future UI but must not be used for the medical note. The controller checks
chunk continuity and format, limits an utterance to 30 seconds, and overwrites
its in-memory audio buffer after a success, failure, or abort. The adapter does
not log audio bytes or transcript text, and it uses per-call temporary files
that are removed at the end of transcription.

After the final pass, `LocalBosnianDraftGenerator` runs locally. It copies the
finalized spoken text into the subjective field, adds no clinical facts or
diagnosis, preserves evidence links to the source segments, and marks the
result as a draft requiring clinician approval. It rejects provisional text, so
generation cannot begin before transcription is authoritative.

## Selected approach

`whisper.cpp` was selected because it is CPU-focused and supports quantized
models; its own real-time microphone example is described as naive, so this
prototype does not treat every partial as final. Whisper explicitly supports
Bosnian language selection (`bs`). The two-pass strategy uses a smaller model
for responsive, replaceable text and a larger multilingual quality model after
the person pauses. Sources: [Whisper language mapping](https://github.com/openai/whisper/blob/main/whisper/tokenizer.py), [whisper.cpp](https://github.com/ggml-org/whisper.cpp), and [Whisper-Streaming](https://aclanthology.org/2023.ijcnlp-demo.3.pdf).

The project pins whisper.cpp revision `1da4dc82fa7996d4edda05890dca65aeceaafd6d`
and validates the downloaded model SHA-1 checksums. The ignored local runtime
contains approximately 181 MiB for `small-q5_1` and 547 MiB for
`large-v3-turbo-q5_0`; neither models nor audio are committed.

## Measurements on this laptop

Hardware: AMD Ryzen 7 5800U, 8 cores / 16 threads, 14 GiB RAM, no usable
NVIDIA GPU. The following preliminary result used a clean 31.4-second
synthetic Bosnian medical dialogue, forced `bs`, and 8 threads. It is an
engineering comparison only, not a clinical-accuracy claim.

| Model | Decode time | Real-time factor | Synthetic transcript WER |
| --- | ---: | ---: | ---: |
| base-q5_1 | 4.17 s | 0.13 | 45.6% |
| small-q5_1 | 11.40 s | 0.36 | 31.6% |
| large-v3-turbo-q5_0 | 39.73 s | 1.26 | 3.5% |
| large-v3-q5_0 | 63.09 s | 2.01 | 15.8% |

The quality-first final model is therefore `large-v3-turbo-q5_0`, not the
larger `large-v3-q5_0`: on this test it was both more accurate and faster.
Its speed means the final result may lag behind the end of an utterance on this
CPU. The live `small-q5_1` output keeps feedback available while it runs.

An earlier direct adapter run successfully produced six timestamped Bosnian
segments, including the allergy and oxygen-saturation statements. A later
repeat was intentionally stopped after the laptop became unstable; a synthetic
voice test file was also cleared by the environment before reuse. No new
high-load attempt was made after that point.

## Safety adjustment after the stability incident

The initial model installation and benchmark used sustained CPU work and
coincided with laptop shutdowns. A subsequent two-core, low-priority test of an
11-second WAV reached **98°C** CPU temperature, so no further real-model test
was run. The current code now defaults to **one** build worker and **one**
transcription thread. On Linux it refuses to start at 85°C or above and kills
an in-progress decode that reaches that limit. Do not run a high-quality decode
until cooling and power stability have been checked; performance mode should
not be used as a reason to override thermal limits.

## Verification completed

- Pinned engine build completed and both model checksums verified locally.
- Adapter, thermal-guard, streaming-controller, and local-draft tests pass.
- Post-transcription local-draft tests pass: **2/2**.
- Python compilation, Bash syntax validation, and Git whitespace validation
  pass.
- No models, audio recordings, or patient data are tracked by Git.

## Remaining work before clinical use

This is not yet a clinical product. It still needs microphone capture,
voice-activity detection, UI wiring, consented Bosnian clinical evaluation,
speaker separation, audio normalization, and an approval workflow. Evaluation
must measure medical-term recall and review error patterns with real recordings
before any clinician relies on it. Every note remains an unsigned draft that
requires clinician review.

## Optional OpenRouter comparison path

The `feat/openrouter-transcription` branch adds an external comparison path:
it discovers current STT models, sends an explicitly approved 16 kHz mono WAV
to OpenRouter's transcription endpoint with language `bs`, then sends only the
final transcript to a separately selected text model for a Bosnian SOAP draft.
It is intentionally model-explicit, so it cannot silently select a paid model.
It now also exposes two pinned STT profiles for a controlled comparison:
`mai` maps to `microsoft/mai-transcribe-2` and `whisper` maps to
`openai/whisper-large-v3`. The selection is explicit or comes from an
untracked runtime environment variable; neither profile is auto-selected.

OpenRouter STT is request/response, not continuous microphone streaming. The
branch therefore has a `FinalOnlyStreamingTranscriber`: capture remains local,
the caller detects a silence boundary, and exactly one remote request is made
for that short completed utterance. This is utterance-level near-real-time
behavior; its actual latency has not been measured without a configured runtime
key and a consented Bosnian recording.

This path is not local and must not be used with patient audio or text until
consent, retention, data-processing, and clinical-governance requirements are
approved. The key is read only from `OPENROUTER_API_KEY` at runtime and is not
written to source, output, or Git. HTTP behavior is covered by mocked tests.

After the runtime key was configured, model discovery successfully returned 21
STT models. A real request with a short synthetic Bosnian WAV to
`openai/whisper-large-v3` reached OpenRouter but returned HTTP 402 before
transcription, so no model quality or latency result is available. The provider
now returns a non-retryable `payment_required` error with a clear message
instead of retrying billable requests.
