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

## Current limitations

- Transcription and note generation are deterministic mocks.
- Audio normalization, live chunking, persistence cleanup, timeouts, and model
  performance measurements belong to later phases.
- Speaker labels and clinical content are synthetic and not clinically useful.
- Every generated note is a draft and requires clinician review.
