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

The setup uses two build workers and live transcription uses four CPU threads
by default to avoid monopolizing a basic laptop. Change either only when the
machine has stable cooling: `MEDISCRIBE_BUILD_JOBS=4` for setup or
`--threads 6` for a deliberate demo run.

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
