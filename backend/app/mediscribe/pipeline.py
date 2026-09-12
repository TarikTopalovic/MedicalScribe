"""Shared orchestration that is independent of provider implementation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Sequence

from .errors import ProviderError, ProviderErrorCode
from .models import (
    AudioChunk,
    GenerationResult,
    ProcessingStage,
    ProcessingStatus,
    TranscriptSegment,
    TranscriptUpdate,
)
from .providers.base import NoteGenerationProvider, ProcessingProvider


@dataclass(frozen=True, slots=True)
class ProcessingResult:
    status: ProcessingStatus
    transcript: tuple[TranscriptSegment, ...]
    generation: GenerationResult | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status.to_dict(),
            "transcript": [segment.to_dict() for segment in self.transcript],
            "generation": self.generation.to_dict() if self.generation else None,
        }


def generate_after_final_transcript(
    update: TranscriptUpdate,
    provider: NoteGenerationProvider,
) -> GenerationResult:
    """Generate a draft only after the final transcription pass completes."""

    if not update.is_final or not update.segments:
        raise ProviderError(
            code=ProviderErrorCode.INVALID_TRANSCRIPT,
            message="A non-empty authoritative transcript is required before generation",
            stage=ProcessingStage.GENERATING,
            provider=provider.name,
        )
    if update.language != "bs":
        raise ProviderError(
            code=ProviderErrorCode.INVALID_TRANSCRIPT,
            message="Local draft generation currently accepts Bosnian transcripts only",
            stage=ProcessingStage.GENERATING,
            provider=provider.name,
        )
    return provider.generate(update.segments)


def process_chunks(
    session_id: str,
    chunks: Sequence[AudioChunk],
    provider: ProcessingProvider,
) -> ProcessingResult:
    """Run a synthetic or real provider through the same backend contract."""

    transcript: list[TranscriptSegment] = []
    try:
        for chunk in chunks:
            if chunk.session_id != session_id:
                raise ValueError("All audio chunks must belong to the requested session")
            transcript.extend(provider.transcribe(chunk))

        generation = provider.generate(transcript)
    except ProviderError as error:
        return ProcessingResult(
            status=ProcessingStatus(
                session_id=session_id,
                stage=ProcessingStage.FAILED,
                provider=provider.name,
                error=error.to_dict(),
            ),
            transcript=tuple(transcript),
            generation=None,
        )

    return ProcessingResult(
        status=ProcessingStatus(
            session_id=session_id,
            stage=ProcessingStage.COMPLETED,
            provider=provider.name,
        ),
        transcript=tuple(transcript),
        generation=generation,
    )
