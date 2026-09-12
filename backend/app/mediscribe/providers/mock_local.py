"""Deterministic local provider for integration work and tests."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from ..errors import ProviderError, ProviderErrorCode
from ..models import (
    AudioChunk,
    ClinicalNote,
    EvidenceReference,
    GenerationResult,
    ProcessingStage,
    TranscriptSegment,
)


class MockLocalProvider:
    """Returns configured synthetic data without loading an AI model."""

    name = "local"

    def __init__(
        self,
        scripted_transcripts: Mapping[str, Sequence[TranscriptSegment]] | None = None,
    ) -> None:
        self._scripted_transcripts = dict(scripted_transcripts or {})

    def transcribe(self, chunk: AudioChunk) -> list[TranscriptSegment]:
        if not chunk.data:
            raise ProviderError(
                code=ProviderErrorCode.INVALID_AUDIO,
                message="Audio chunk is empty",
                stage=ProcessingStage.TRANSCRIBING,
                provider=self.name,
            )

        scripted = self._scripted_transcripts.get(chunk.id)
        if scripted is not None:
            return list(scripted)

        return [
            TranscriptSegment(
                id=f"segment-{chunk.id}",
                speaker="unknown",
                text="Synthetic transcript for provider integration testing.",
                start_ms=chunk.start_ms,
                end_ms=chunk.end_ms,
                confidence=0.99,
            )
        ]

    def generate(self, segments: Sequence[TranscriptSegment]) -> GenerationResult:
        if not segments:
            raise ProviderError(
                code=ProviderErrorCode.INVALID_TRANSCRIPT,
                message="At least one transcript segment is required",
                stage=ProcessingStage.GENERATING,
                provider=self.name,
            )

        segment_ids = tuple(segment.id for segment in segments)
        warnings: list[str] = ["Synthetic draft; clinician review is required."]
        if any(segment.confidence < 0.75 for segment in segments):
            warnings.append("Low-confidence transcript segment requires review.")

        note = ClinicalNote(
            subjective="Synthetic symptom description from the transcript.",
            objective="",
            assessment="Synthetic assessment for integration testing only.",
            plan="Review and edit this draft before approval.",
            warnings=tuple(warnings),
        )
        evidence = (
            EvidenceReference("subjective", segment_ids),
            EvidenceReference("assessment", segment_ids),
            EvidenceReference("plan", segment_ids),
        )
        return GenerationResult(note=note, evidence=evidence)
