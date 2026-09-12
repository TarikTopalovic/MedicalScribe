"""Provider contracts shared by local and future cloud implementations."""

from __future__ import annotations

from typing import Protocol, Sequence, runtime_checkable

from ..models import AudioChunk, GenerationResult, TranscriptSegment


@runtime_checkable
class TranscriptionProvider(Protocol):
    name: str

    def transcribe(self, chunk: AudioChunk) -> list[TranscriptSegment]:
        """Convert one standardized audio chunk into transcript segments."""


@runtime_checkable
class NoteGenerationProvider(Protocol):
    name: str

    def generate(self, segments: Sequence[TranscriptSegment]) -> GenerationResult:
        """Create a structured, reviewable clinical-note draft."""


@runtime_checkable
class ProcessingProvider(TranscriptionProvider, NoteGenerationProvider, Protocol):
    """Combined provider used by the end-to-end processing pipeline."""
