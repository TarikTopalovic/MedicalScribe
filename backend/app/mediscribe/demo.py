"""Run the mock local provider with synthetic input."""

from __future__ import annotations

import json

from .config import ProviderConfig, create_provider
from .models import AudioChunk, TranscriptSegment
from .pipeline import process_chunks


def main() -> None:
    session_id = "synthetic-demo"
    chunk = AudioChunk(
        id="chunk-001",
        session_id=session_id,
        data=b"synthetic-audio-placeholder",
        start_ms=0,
        end_ms=4_000,
    )
    scripted = {
        chunk.id: [
            TranscriptSegment(
                id="segment-001",
                speaker="patient",
                text="Synthetic patient statement.",
                start_ms=0,
                end_ms=4_000,
                confidence=0.96,
            )
        ]
    }
    provider = create_provider(ProviderConfig(), scripted_transcripts=scripted)
    result = process_chunks(session_id, [chunk], provider)
    print(json.dumps(result.to_dict(), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
