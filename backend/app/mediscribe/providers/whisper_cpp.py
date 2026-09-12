"""Local CPU transcription through the whisper.cpp command-line interface."""

from __future__ import annotations

import io
import json
import os
import subprocess
import tempfile
import threading
import time
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..errors import ProviderError, ProviderErrorCode
from ..models import AudioChunk, ProcessingStage, TranscriptSegment

_DECODE_GATE = threading.BoundedSemaphore(value=1)


@dataclass(frozen=True, slots=True)
class WhisperCppConfig:
    binary_path: Path
    model_path: Path
    language: str = "bs"
    # Use the available logical CPUs for the one permitted local decode.
    threads: int = os.cpu_count() or 1
    beam_size: int = 5
    timeout_seconds: float = 180.0
    max_cpu_temperature_celsius: float = 85.0

    def __post_init__(self) -> None:
        if self.language != "bs":
            raise ValueError("The local clinical transcription language must be Bosnian (bs)")
        if self.threads < 1 or self.beam_size < 1 or self.timeout_seconds <= 0:
            raise ValueError("Whisper thread, beam, and timeout values must be positive")
        if not 50.0 <= self.max_cpu_temperature_celsius <= 100.0:
            raise ValueError("Maximum CPU temperature must be between 50 and 100 Celsius")


class WhisperCppTranscriptionProvider:
    name = "local-whisper-cpp"

    def __init__(self, config: WhisperCppConfig) -> None:
        self.config = config
        if not config.binary_path.is_file() or not os.access(config.binary_path, os.X_OK):
            raise ValueError("whisper.cpp binary is missing or not executable")
        if not config.model_path.is_file():
            raise ValueError("whisper.cpp model is missing")

    def transcribe(self, chunk: AudioChunk) -> list[TranscriptSegment]:
        wav_data = self._to_wav(chunk)
        if not _DECODE_GATE.acquire(timeout=self.config.timeout_seconds):
            raise ProviderError(
                code=ProviderErrorCode.TIMEOUT,
                message="Another local AI transcription is still running",
                stage=ProcessingStage.TRANSCRIBING,
                provider=self.name,
                retryable=True,
            )
        try:
            self._assert_safe_temperature()
            try:
                with tempfile.TemporaryDirectory(prefix="mediscribe-audio-") as directory:
                    input_path = Path(directory, "input.wav")
                    output_path = Path(directory, "result")
                    input_path.write_bytes(wav_data)
                    command = [
                        str(self.config.binary_path),
                        "-m",
                        str(self.config.model_path),
                        "-f",
                        str(input_path),
                        "-l",
                        self.config.language,
                        "-t",
                        str(self.config.threads),
                        "-bs",
                        str(self.config.beam_size),
                        "-bo",
                        str(self.config.beam_size),
                        "-ng",
                        "-ojf",
                        "-of",
                        str(output_path),
                    ]
                    process = subprocess.Popen(
                        command,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                    )
                    deadline = time.monotonic() + self.config.timeout_seconds
                    while process.poll() is None:
                        self._assert_safe_temperature(process)
                        if time.monotonic() >= deadline:
                            process.kill()
                            process.communicate()
                            raise subprocess.TimeoutExpired(command, self.config.timeout_seconds)
                        time.sleep(0.25)
                    process.communicate()
                    if process.returncode != 0:
                        raise self._error("whisper.cpp transcription failed")
                    payload = json.loads(output_path.with_suffix(".json").read_text())
                    return self._segments(chunk, payload)
            except subprocess.TimeoutExpired as error:
                raise ProviderError(
                    code=ProviderErrorCode.TIMEOUT,
                    message="Local transcription timed out",
                    stage=ProcessingStage.TRANSCRIBING,
                    provider=self.name,
                    retryable=True,
                ) from error
            except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
                raise self._error("Invalid response from whisper.cpp") from error
        finally:
            _DECODE_GATE.release()

    def _to_wav(self, chunk: AudioChunk) -> bytes:
        if not chunk.data:
            raise ProviderError(
                code=ProviderErrorCode.INVALID_AUDIO,
                message="Audio chunk is empty",
                stage=ProcessingStage.TRANSCRIBING,
                provider=self.name,
            )
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
        if payload.get("result", {}).get("language") != self.config.language:
            raise self._error("whisper.cpp returned an unexpected language")

        segments: list[TranscriptSegment] = []
        for index, item in enumerate(payload["transcription"]):
            text = item["text"].strip()
            if not text:
                continue
            probabilities = [
                float(token["p"])
                for token in item.get("tokens", [])
                if not str(token.get("text", "")).startswith("[_") and "p" in token
            ]
            offsets = item["offsets"]
            segments.append(
                TranscriptSegment(
                    id=f"{chunk.id}-segment-{index + 1}",
                    speaker="unknown",
                    text=text,
                    start_ms=chunk.start_ms + int(offsets["from"]),
                    end_ms=chunk.start_ms + int(offsets["to"]),
                    confidence=sum(probabilities) / len(probabilities) if probabilities else 0.0,
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

    def _assert_safe_temperature(self, process: subprocess.Popen[bytes] | None = None) -> None:
        temperature = self._read_cpu_temperature_celsius()
        if temperature is None or temperature < self.config.max_cpu_temperature_celsius:
            return
        if process is not None and process.poll() is None:
            process.kill()
            process.communicate()
        raise ProviderError(
            code=ProviderErrorCode.THERMAL_LIMIT,
            message=(
                "Local transcription stopped because CPU temperature reached "
                f"{temperature:.1f}°C; wait for the laptop to cool"
            ),
            stage=ProcessingStage.TRANSCRIBING,
            provider=self.name,
            retryable=True,
        )

    @staticmethod
    def _read_cpu_temperature_celsius() -> float | None:
        thermal_root = Path("/sys/class/thermal")
        try:
            temperatures = []
            for zone in thermal_root.glob("thermal_zone*"):
                zone_type = (zone / "type").read_text().strip().lower()
                if "cpu" not in zone_type:
                    continue
                temperatures.append(int((zone / "temp").read_text().strip()) / 1_000)
            return max(temperatures, default=None)
        except (OSError, ValueError):
            return None
