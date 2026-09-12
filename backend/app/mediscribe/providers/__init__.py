"""Provider interfaces and implementations."""

from .base import NoteGenerationProvider, ProcessingProvider, TranscriptionProvider
from .mock_local import MockLocalProvider
from .whisper_cpp import WhisperCppConfig, WhisperCppTranscriptionProvider

__all__ = [
    "MockLocalProvider",
    "NoteGenerationProvider",
    "ProcessingProvider",
    "TranscriptionProvider",
    "WhisperCppConfig",
    "WhisperCppTranscriptionProvider",
]
