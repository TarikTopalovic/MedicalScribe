"""Standard errors returned across provider implementations."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any

from .models import ProcessingStage


class ProviderErrorCode(str, Enum):
    INVALID_AUDIO = "invalid_audio"
    INVALID_TRANSCRIPT = "invalid_transcript"
    UNSUPPORTED_PROVIDER = "unsupported_provider"
    TRANSCRIPTION_FAILED = "transcription_failed"
    GENERATION_FAILED = "generation_failed"
    COMPLIANCE_BLOCKED = "compliance_blocked"
    PAYMENT_REQUIRED = "payment_required"
    THERMAL_LIMIT = "thermal_limit"
    TIMEOUT = "timeout"


@dataclass(eq=False)
class ProviderError(Exception):
    code: ProviderErrorCode
    message: str
    stage: ProcessingStage
    provider: str
    retryable: bool = False

    def __str__(self) -> str:
        return f"{self.code.value}: {self.message}"

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code.value,
            "message": self.message,
            "stage": self.stage.value,
            "provider": self.provider,
            "retryable": self.retryable,
        }
