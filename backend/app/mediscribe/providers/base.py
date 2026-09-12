"""Provider contracts shared by local and future cloud implementations."""

from __future__ import annotations

from typing import Protocol, Sequence, runtime_checkable

from ..models import AudioChunk, GenerationResult, TranscriptSegment


@runtime_checkable
class ProcessingProvider(Protocol):
    name: str

    def transcribe(self, chunk: AudioChunk) -> list[TranscriptSegment]:
        """Convert one standardized audio chunk into transcript segments."""

    def generate(self, segments: Sequence[TranscriptSegment]) -> GenerationResult:
        """Create a structured, reviewable clinical-note draft."""
