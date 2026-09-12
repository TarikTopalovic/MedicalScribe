# MediScribe Backend

The first local-processing slice defines provider-neutral data models and a
deterministic mock local provider. It does not load a transcription or language
model and must only be used with synthetic data.

## Run the synthetic demo

From the repository root:

```bash
python -m backend.app.mediscribe.demo
```

Select the implementation with environment variables:

```bash
MEDISCRIBE_PROVIDER=local
MEDISCRIBE_LOCAL_MODE=mock
```

The result contains the standard transcript fields, all SOAP note keys,
evidence references, processing status, and an explicit `is_draft` marker.

## Run tests

```bash
python -m unittest discover -s tests -v
```

## Basic-PC compatibility

This phase supports Python 3.10 or newer and uses only the Python standard
library. It is CPU-only, loads no model, requires no discrete GPU, and performs
no network calls.

Run the repeatable local benchmark with:

```bash
python -m scripts.benchmark_local_mock
```

Baseline measured on an AMD Ryzen 7 5800U CPU with 14 GiB RAM and no usable
NVIDIA GPU: 10,000 mock flows completed in 0.114 seconds with approximately
15.4 MiB total process peak RSS. The benchmark script reports portable Python
allocation measurements, which are not the same as operating-system RSS.

The real transcription and generation phase must preserve CPU-only operation.
Model choice, quantization, worker count, and chunk size will be accepted only
after measurements on this machine; the current mock result does not predict
real-model latency or memory use.

## Bosnian live transcription prototype

The selected CPU profile uses two local multilingual `whisper.cpp` models:

- `small-q5_1` produces replaceable provisional text while the person speaks.
- `large-v3-turbo-q5_0` produces the authoritative Bosnian transcript after an
  utterance ends. Only this result may enter clinical-note generation.

After final transcription, `LocalBosnianDraftGenerator` creates a local SOAP
draft from final segments only. It copies spoken content into the subjective
field, does not invent a diagnosis, and requires clinician review. This is a
small deterministic generator, so it adds no model download or sustained CPU
load.

Install the pinned engine and both verified models (about 730 MiB total):

```bash
bash scripts/setup_whisper_cpp.sh
```

The build defaults to one worker. Each local transcription uses all available
logical CPU threads, but a process-wide gate permits only one local AI decode at
a time. On Linux, the transcription adapter refuses to start at 85°C or above
and checks this limit while decoding. The guard does not repair a failing fan
or firmware.

Export the three paths printed by the setup script, then simulate live chunks
from a synthetic 16-bit, 16 kHz, mono WAV file:

```bash
python -m scripts.demo_bosnian_streaming synthetic-bosnian.wav
```

Add `--realtime` to replay the input at recording speed. The shared recorder
must call `finish()` after an utterance boundary (target: 700 ms of silence).
The streaming controller rejects discontinuous or malformed chunks, caps one
utterance at 30 seconds, and clears its internal audio after success or error.

## Current limitations

- Transcription and note generation are deterministic mocks.
- Microphone capture, voice-activity detection, speaker labels, and evaluation
  with consented real-world Bosnian recordings belong to later phases.
- Speaker labels and clinical content are synthetic and not clinically useful.
- Every generated note is a draft and requires clinician review.

## Optional OpenRouter model testing

OpenRouter is an **external** path: approved audio and its final transcript are
sent to the selected remote models. It is separate from the local providers and
must not be used with patient data unless the privacy, consent, retention, and
clinical-governance requirements have been approved.

For synthetic testing, every request enforces OpenRouter's per-request Zero
Data Retention and `data_collection: deny` controls. For clinical data, the
provider fails closed unless its mode is `clinical`, EU in-region routing is
enabled, and the organisation declares that its processor agreement is
approved. This is a technical gate, not legal certification: obtain legal/DPO
approval, complete a DPIA, verify the provider/model's current terms, and turn
off OpenRouter input/output logging in the account before use.

Keep the key only in the current shell or a secret manager, never in a tracked
file. First list the currently available STT models (this request sends no
recording):

```bash
export OPENROUTER_API_KEY='set-this-in-your-shell'
export MEDISCRIBE_ALLOW_REMOTE_PROCESSING=true
export MEDISCRIBE_CLOUD_DATA_CLASSIFICATION=synthetic
python -m scripts.openrouter_model_check --list-stt-models
```

Then deliberately test one approved 16-bit, 16 kHz, mono Bosnian WAV. Model
slugs are required so no paid model is selected accidentally:

```bash
python -m scripts.openrouter_model_check approved-bosnian.wav \
  --transcription-model openai/whisper-large-v3 \
  --draft-model openai/gpt-4o-mini
```

Add `--skip-draft` to test transcription alone. The remote STT request forces
`bs`, asks for timestamped segments, and the remote draft can only run after
that final transcript exists. In a microphone session, retain chunks locally
and call the remote provider once a silence boundary is detected; this gives
utterance-level near-real-time behavior without repeated partial uploads.
OpenRouter documents its STT endpoint and model discovery at
https://openrouter.ai/docs/guides/overview/multimodal/stt.

The account must have credit or model entitlement. A 402 response is surfaced
as `payment_required` and no automatic retries are made.
