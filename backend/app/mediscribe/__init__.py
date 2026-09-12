"""Privacy-first provider primitives for MediScribe."""

from .config import ProviderConfig, create_provider
from .pipeline import generate_after_final_transcript
from .models import (
    AudioChunk,
    ClinicalNote,
    EvidenceReference,
    GenerationResult,
    ProcessingStage,
    ProcessingStatus,
    TranscriptSegment,
    TranscriptUpdate,
)

__all__ = [
    "AudioChunk",
    "ClinicalNote",
    "EvidenceReference",
    "GenerationResult",
    "generate_after_final_transcript",
    "ProcessingStage",
    "ProcessingStatus",
    "ProviderConfig",
    "TranscriptSegment",
    "TranscriptUpdate",
    "create_provider",
]
