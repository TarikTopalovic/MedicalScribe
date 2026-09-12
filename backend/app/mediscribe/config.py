"""Provider configuration and selection."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Mapping

from .errors import ProviderError, ProviderErrorCode
from .models import ProcessingStage, TranscriptSegment
from .providers.base import ProcessingProvider
from .providers.mock_local import MockLocalProvider


@dataclass(frozen=True, slots=True)
class ProviderConfig:
    provider: str = "local"
    local_mode: str = "mock"

    @classmethod
    def from_env(cls) -> "ProviderConfig":
        return cls(
            provider=os.getenv("MEDISCRIBE_PROVIDER", "local").strip().lower(),
            local_mode=os.getenv("MEDISCRIBE_LOCAL_MODE", "mock").strip().lower(),
        )


def create_provider(
    config: ProviderConfig,
    *,
    scripted_transcripts: Mapping[str, list[TranscriptSegment]] | None = None,
) -> ProcessingProvider:
    if config.provider == "local" and config.local_mode == "mock":
        return MockLocalProvider(scripted_transcripts=scripted_transcripts)

    raise ProviderError(
        code=ProviderErrorCode.UNSUPPORTED_PROVIDER,
        message=f"Unsupported provider configuration: {config.provider}/{config.local_mode}",
        stage=ProcessingStage.RECEIVED,
        provider=config.provider,
    )
