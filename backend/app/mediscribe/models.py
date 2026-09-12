"""Shared input and output models used by all processing providers.

The models deliberately contain no logging helpers. Audio bytes, transcript text,
and clinical note content must never be written to application logs.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class ProcessingStage(str, Enum):
    RECEIVED = "received"
    TRANSCRIBING = "transcribing"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass(frozen=True, slots=True)
class AudioChunk:
    """An in-memory audio chunk supplied by the shared session layer."""

    id: str
    session_id: str
    data: bytes = field(repr=False)
    start_ms: int
    end_ms: int
    sample_rate_hz: int = 16_000
    channels: int = 1
    encoding: str = "pcm_s16le"

    def __post_init__(self) -> None:
        if not self.id or not self.session_id:
            raise ValueError("Audio chunk id and session_id are required")
        if self.start_ms < 0 or self.end_ms <= self.start_ms:
            raise ValueError("Audio chunk timestamps are invalid")


@dataclass(frozen=True, slots=True)
class TranscriptSegment:
    id: str
    speaker: str
    text: str
    start_ms: int
    end_ms: int
    confidence: float

    def __post_init__(self) -> None:
        if not self.id or not self.speaker:
            raise ValueError("Transcript segment id and speaker are required")
        if self.start_ms < 0 or self.end_ms <= self.start_ms:
            raise ValueError("Transcript segment timestamps are invalid")
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError("Transcript confidence must be between 0 and 1")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "speaker": self.speaker,
            "text": self.text,
            "start_ms": self.start_ms,
            "end_ms": self.end_ms,
            "confidence": self.confidence,
        }

@dataclass(frozen=True, slots=True)
class ClinicalNote:
    """A reviewable SOAP draft. It is never a signed medical report."""

    subjective: str = ""
    objective: str = ""
    assessment: str = ""
    plan: str = ""
    warnings: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "subjective": self.subjective,
            "objective": self.objective,
            "assessment": self.assessment,
            "plan": self.plan,
            "warnings": list(self.warnings),
        }


@dataclass(frozen=True, slots=True)
class EvidenceReference:
    note_item_id: str
    segment_ids: tuple[str, ...]

    def __post_init__(self) -> None:
        if not self.note_item_id or not self.segment_ids:
            raise ValueError("Evidence reference requires a note item and segment ids")

    def to_dict(self) -> dict[str, Any]:
        return {
            "note_item_id": self.note_item_id,
            "segment_ids": list(self.segment_ids),
        }


@dataclass(frozen=True, slots=True)
class ProcessingStatus:
    session_id: str
    stage: ProcessingStage
    provider: str
    error: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "stage": self.stage.value,
            "provider": self.provider,
            "error": self.error,
        }


@dataclass(frozen=True, slots=True)
class GenerationResult:
    note: ClinicalNote
    evidence: tuple[EvidenceReference, ...]
    is_draft: bool = True

    def __post_init__(self) -> None:
        if not self.is_draft:
            raise ValueError("Provider output must remain a draft")

    def to_dict(self) -> dict[str, Any]:
        return {
            "note": self.note.to_dict(),
            "evidence": [reference.to_dict() for reference in self.evidence],
            "is_draft": self.is_draft,
        }
