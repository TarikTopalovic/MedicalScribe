"""Privacy-first provider primitives for MediScribe."""

from .config import ProviderConfig, create_provider
from .models import (
    AudioChunk,
    ClinicalNote,
    EvidenceReference,
    GenerationResult,
    ProcessingStage,
    ProcessingStatus,
    TranscriptSegment,
)

__all__ = [
    "AudioChunk",
    "ClinicalNote",
    "EvidenceReference",
    "GenerationResult",
    "ProcessingStage",
    "ProcessingStatus",
    "ProviderConfig",
    "TranscriptSegment",
    "create_provider",
]
