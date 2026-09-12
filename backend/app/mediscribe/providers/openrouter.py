"""Optional OpenRouter transcription and Bosnian draft-generation providers.

These providers intentionally make a network request. They must only be used
when the clinician has approved sending the recording and transcript to the
configured external service.
"""

from __future__ import annotations

import base64
import io
import json
import os
import wave
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from ..errors import ProviderError, ProviderErrorCode
from ..models import (
    AudioChunk,
    ClinicalNote,
    EvidenceReference,
    GenerationResult,
    ProcessingStage,
    TranscriptSegment,
)

OPENROUTER_API_BASE = "https://openrouter.ai/api/v1"


@dataclass(frozen=True, slots=True)
class OpenRouterSettings:
    """Runtime-only settings. The key must come from the environment, never Git."""

    api_key: str = field(repr=False)
    allow_remote_processing: bool = False
    timeout_seconds: float = 60.0

    def __post_init__(self) -> None:
        if not self.api_key.strip():
            raise ValueError("OPENROUTER_API_KEY is required for the OpenRouter provider")
        if not self.allow_remote_processing:
            raise ValueError("Set MEDISCRIBE_ALLOW_REMOTE_PROCESSING=true to enable OpenRouter")
        if self.timeout_seconds <= 0:
            raise ValueError("OpenRouter timeout must be positive")

    @classmethod
    def from_env(cls) -> "OpenRouterSettings":
        return cls(
            api_key=os.getenv("OPENROUTER_API_KEY", ""),
            allow_remote_processing=(
                os.getenv("MEDISCRIBE_ALLOW_REMOTE_PROCESSING", "").lower() == "true"
            ),
        )


class OpenRouterClient:
    """Small standard-library client that never logs request bodies or tokens."""

    def __init__(self, settings: OpenRouterSettings) -> None:
        self.settings = settings

    def post_json(
        self,
        path: str,
        payload: dict[str, Any],
        *,
        stage: ProcessingStage,
        provider: str,
    ) -> dict[str, Any]:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        request = Request(
            f"{OPENROUTER_API_BASE}{path}",
            data=body,
            headers={
                "Authorization": f"Bearer {self.settings.api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/TarikTopalovic/MedicalScribe",
                "X-OpenRouter-Title": "MediScribe",
            },
            method="POST",
        )
        return self._send(request, stage=stage, provider=provider)

    def get_json(
        self,
        path: str,
        *,
        stage: ProcessingStage,
        provider: str,
    ) -> dict[str, Any]:
        request = Request(
            f"{OPENROUTER_API_BASE}{path}",
            headers={"Authorization": f"Bearer {self.settings.api_key}"},
            method="GET",
        )
        return self._send(request, stage=stage, provider=provider)

    def _send(
        self,
        request: Request,
        *,
        stage: ProcessingStage,
        provider: str,
    ) -> dict[str, Any]:
        try:
            with urlopen(request, timeout=self.settings.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            payment_required = error.code == 402
            raise ProviderError(
                code=(
                    ProviderErrorCode.PAYMENT_REQUIRED
                    if payment_required
                    else self._code_for_stage(stage)
                ),
                message=(
                    "OpenRouter requires available account credit for this model"
                    if payment_required
                    else f"OpenRouter returned HTTP {error.code}"
                ),
                stage=stage,
                provider=provider,
                retryable=not payment_required and (error.code >= 500 or error.code == 429),
            ) from error
        except (OSError, URLError, TimeoutError, json.JSONDecodeError) as error:
            raise ProviderError(
                code=self._code_for_stage(stage),
                message="OpenRouter request failed",
                stage=stage,
                provider=provider,
                retryable=True,
            ) from error
        if not isinstance(payload, dict):
            raise ProviderError(
                code=self._code_for_stage(stage),
                message="OpenRouter returned an invalid response",
                stage=stage,
                provider=provider,
            )
        return payload

    @staticmethod
    def _code_for_stage(stage: ProcessingStage) -> ProviderErrorCode:
        return (
            ProviderErrorCode.TRANSCRIPTION_FAILED
            if stage is ProcessingStage.TRANSCRIBING
            else ProviderErrorCode.GENERATION_FAILED
        )

    def list_transcription_models(self) -> tuple[str, ...]:
        """Return currently available STT model IDs for deliberate user selection."""

        payload = self.get_json(
            "/models?output_modalities=transcription",
            stage=ProcessingStage.RECEIVED,
            provider="openrouter",
        )
        data = payload.get("data", [])
        if not isinstance(data, list):
            return ()
        return tuple(
            item["id"]
            for item in data
            if isinstance(item, dict) and isinstance(item.get("id"), str)
        )


class OpenRouterTranscriptionProvider:
    """Remote STT adapter. It sends an approved WAV recording to OpenRouter."""

    name = "openrouter-stt"

    def __init__(self, client: OpenRouterClient, model: str) -> None:
        if not model.strip():
            raise ValueError("An OpenRouter transcription model is required")
        self.client = client
        self.model = model

    def transcribe(self, chunk: AudioChunk) -> list[TranscriptSegment]:
        wav_data = self._to_wav(chunk)
        payload = self.client.post_json(
            "/audio/transcriptions",
            {
                "model": self.model,
                "input_audio": {
                    "data": base64.b64encode(wav_data).decode("ascii"),
                    "format": "wav",
                },
                "language": "bs",
                "temperature": 0,
                "response_format": "verbose_json",
                "timestamp_granularities": ["segment"],
            },
            stage=ProcessingStage.TRANSCRIBING,
            provider=self.name,
        )
        response_language = payload.get("language")
        if response_language not in (None, "bs", "bosnian"):
            raise self._error("OpenRouter returned a non-Bosnian transcription")

        segments = self._segments(chunk, payload)
        if not segments:
            raise self._error("OpenRouter returned no transcript text")
        return segments

    def _to_wav(self, chunk: AudioChunk) -> bytes:
        if not chunk.data:
            raise self._error("Audio chunk is empty", invalid=True)
        if chunk.encoding == "wav":
            try:
                with wave.open(io.BytesIO(chunk.data), "rb") as audio:
                    valid = (
                        audio.getnchannels() == 1
                        and audio.getsampwidth() == 2
                        and audio.getframerate() == 16_000
                        and audio.getnframes() > 0
                    )
            except (EOFError, wave.Error) as error:
                raise self._error("Audio is not a valid WAV file", invalid=True) from error
            if not valid:
                raise self._error("WAV audio must be signed 16-bit, 16 kHz, and mono", invalid=True)
            return chunk.data
        if chunk.encoding != "pcm_s16le" or len(chunk.data) % 2:
            raise self._error("Audio must use signed 16-bit PCM or WAV encoding", invalid=True)
        if chunk.sample_rate_hz != 16_000 or chunk.channels != 1:
            raise self._error("Audio must be 16 kHz mono", invalid=True)
        output = io.BytesIO()
        with wave.open(output, "wb") as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(16_000)
            audio.writeframes(chunk.data)
        return output.getvalue()

    def _segments(self, chunk: AudioChunk, payload: dict[str, Any]) -> list[TranscriptSegment]:
        remote_segments = payload.get("segments")
        if not isinstance(remote_segments, list):
            remote_segments = [{"text": payload.get("text", ""), "start": 0, "end": (chunk.end_ms - chunk.start_ms) / 1_000}]

        segments: list[TranscriptSegment] = []
        for index, item in enumerate(remote_segments):
            if not isinstance(item, dict):
                continue
            text = str(item.get("text", "")).strip()
            start_ms = chunk.start_ms + round(float(item.get("start", 0)) * 1_000)
            end_ms = chunk.start_ms + round(float(item.get("end", 0)) * 1_000)
            if not text or end_ms <= start_ms:
                continue
            confidence = item.get("confidence", 0.0)
            try:
                confidence = min(1.0, max(0.0, float(confidence)))
            except (TypeError, ValueError):
                confidence = 0.0
            segments.append(
                TranscriptSegment(
                    id=f"{chunk.id}-segment-{index + 1}",
                    speaker=str(item.get("speaker", "unknown")),
                    text=text,
                    start_ms=start_ms,
                    end_ms=end_ms,
                    confidence=confidence,
                )
            )
        return segments

    def _error(self, message: str, *, invalid: bool = False) -> ProviderError:
        return ProviderError(
            code=(
                ProviderErrorCode.INVALID_AUDIO
                if invalid
                else ProviderErrorCode.TRANSCRIPTION_FAILED
            ),
            message=message,
            stage=ProcessingStage.TRANSCRIBING,
            provider=self.name,
        )


class OpenRouterBosnianDraftGenerator:
    """Generate a reviewable Bosnian SOAP draft after authoritative transcription."""

    name = "openrouter-bosnian-draft"

    def __init__(self, client: OpenRouterClient, model: str) -> None:
        if not model.strip():
            raise ValueError("An OpenRouter draft model is required")
        self.client = client
        self.model = model

    def generate(self, segments: Sequence[TranscriptSegment]) -> GenerationResult:
        if not segments:
            raise ProviderError(
                code=ProviderErrorCode.INVALID_TRANSCRIPT,
                message="At least one finalized transcript segment is required",
                stage=ProcessingStage.GENERATING,
                provider=self.name,
            )
        transcript = "\n".join(segment.text.strip() for segment in segments).strip()
        if not transcript:
            raise ProviderError(
                code=ProviderErrorCode.INVALID_TRANSCRIPT,
                message="Finalized transcript contains no text",
                stage=ProcessingStage.GENERATING,
                provider=self.name,
            )
        if len(transcript) > 12_000:
            raise ProviderError(
                code=ProviderErrorCode.INVALID_TRANSCRIPT,
                message="Transcript exceeds the remote draft size limit",
                stage=ProcessingStage.GENERATING,
                provider=self.name,
            )

        payload = self.client.post_json(
            "/chat/completions",
            {
                "model": self.model,
                "temperature": 0,
                "max_tokens": 800,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "Ti pripremaš nacrt SOAP bilješke na bosanskom jeziku. "
                            "Koristi samo činjenice iz autoritativnog transkripta. "
                            "Ne postavljaj dijagnozu, ne izmišljaj nalaze, terapiju ili plan. "
                            "Vrati isključivo JSON objekt sa string poljima subjective, "
                            "objective, assessment, plan i nizom stringova warnings."
                        ),
                    },
                    {"role": "user", "content": f"AUTORITATIVNI TRANSKRIPT:\n{transcript}"},
                ],
            },
            stage=ProcessingStage.GENERATING,
            provider=self.name,
        )
        return self._result(payload, segments)

    def _result(
        self,
        payload: dict[str, Any],
        segments: Sequence[TranscriptSegment],
    ) -> GenerationResult:
        try:
            content = payload["choices"][0]["message"]["content"]
            if not isinstance(content, str):
                raise TypeError("content is not text")
            parsed = json.loads(content.removeprefix("```json").removesuffix("```").strip())
            if not isinstance(parsed, dict):
                raise TypeError("draft is not an object")
            note = ClinicalNote(
                subjective=self._string(parsed, "subjective"),
                objective=self._string(parsed, "objective"),
                assessment=self._string(parsed, "assessment"),
                plan=self._string(parsed, "plan"),
                warnings=tuple(self._warnings(parsed)),
            )
        except (IndexError, KeyError, TypeError, json.JSONDecodeError) as error:
            raise ProviderError(
                code=ProviderErrorCode.GENERATION_FAILED,
                message="OpenRouter did not return a valid structured Bosnian draft",
                stage=ProcessingStage.GENERATING,
                provider=self.name,
            ) from error

        segment_ids = tuple(segment.id for segment in segments)
        evidence = tuple(
            EvidenceReference(field, segment_ids)
            for field, value in (
                ("subjective", note.subjective),
                ("objective", note.objective),
                ("assessment", note.assessment),
                ("plan", note.plan),
            )
            if value
        )
        return GenerationResult(note=note, evidence=evidence)

    @staticmethod
    def _string(payload: dict[str, Any], key: str) -> str:
        value = payload.get(key, "")
        if not isinstance(value, str):
            raise TypeError(f"{key} is not text")
        return value.strip()

    @staticmethod
    def _warnings(payload: dict[str, Any]) -> list[str]:
        warnings = payload.get("warnings", [])
        if not isinstance(warnings, list) or not all(isinstance(item, str) for item in warnings):
            raise TypeError("warnings is not a list of text")
        return [*warnings, "Nacrt generisan putem vanjskog servisa; potrebna je provjera kliničara."]
