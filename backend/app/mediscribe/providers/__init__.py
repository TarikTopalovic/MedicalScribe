"""Provider interfaces and implementations."""

from .base import NoteGenerationProvider, ProcessingProvider, TranscriptionProvider
from .local_bosnian_draft import LocalBosnianDraftGenerator
from .mock_local import MockLocalProvider
from .openrouter import (
    OpenRouterBosnianDraftGenerator,
    OpenRouterClient,
    OpenRouterSettings,
    OpenRouterTranscriptionProvider,
)
from .whisper_cpp import WhisperCppConfig, WhisperCppTranscriptionProvider

__all__ = [
    "LocalBosnianDraftGenerator",
    "MockLocalProvider",
    "NoteGenerationProvider",
    "OpenRouterBosnianDraftGenerator",
    "OpenRouterClient",
    "OpenRouterSettings",
    "OpenRouterTranscriptionProvider",
    "ProcessingProvider",
    "TranscriptionProvider",
    "WhisperCppConfig",
    "WhisperCppTranscriptionProvider",
]
