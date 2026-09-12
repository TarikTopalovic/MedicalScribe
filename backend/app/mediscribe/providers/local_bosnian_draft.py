"""Safe, deterministic local draft generation for finalized Bosnian transcripts."""

from __future__ import annotations

from collections.abc import Sequence

from ..errors import ProviderError, ProviderErrorCode
from ..models import (
    ClinicalNote,
    EvidenceReference,
    GenerationResult,
    ProcessingStage,
    TranscriptSegment,
)


class LocalBosnianDraftGenerator:
    """Create a local review draft without diagnosing or adding clinical facts.

    This deliberately small generator keeps basic PCs responsive. It carries the
    finalized spoken content into the subjective field verbatim and leaves
    clinical interpretation to the clinician.
    """

    name = "local-bosnian-draft"

    def generate(self, segments: Sequence[TranscriptSegment]) -> GenerationResult:
        if not segments:
            raise ProviderError(
                code=ProviderErrorCode.INVALID_TRANSCRIPT,
                message="At least one finalized transcript segment is required",
                stage=ProcessingStage.GENERATING,
                provider=self.name,
            )

        transcript = " ".join(segment.text.strip() for segment in segments).strip()
        if not transcript:
            raise ProviderError(
                code=ProviderErrorCode.INVALID_TRANSCRIPT,
                message="Finalized transcript contains no text",
                stage=ProcessingStage.GENERATING,
                provider=self.name,
            )

        warnings = [
            "Lokalno generisan nacrt; obavezna je provjera i odobrenje kliničara.",
            "Automatska dijagnoza nije generisana.",
        ]
        if any(segment.confidence < 0.75 for segment in segments):
            warnings.append("Dio transkripta ima nisku pouzdanost i zahtijeva provjeru.")

        segment_ids = tuple(segment.id for segment in segments)
        return GenerationResult(
            note=ClinicalNote(
                subjective=transcript,
                objective="",
                assessment="Potrebna je klinička procjena; dijagnoza nije automatski izvedena.",
                plan="Kliničar treba pregledati, dopuniti i odobriti nacrt.",
                warnings=tuple(warnings),
            ),
            evidence=(EvidenceReference("subjective", segment_ids),),
        )
