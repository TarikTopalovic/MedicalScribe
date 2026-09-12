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

## Current limitations

- Transcription and note generation are deterministic mocks.
- Audio normalization, live chunking, persistence cleanup, timeouts, and model
  performance measurements belong to later phases.
- Speaker labels and clinical content are synthetic and not clinically useful.
- Every generated note is a draft and requires clinician review.
