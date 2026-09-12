from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from backend.app.mediscribe.errors import ProviderError, ProviderErrorCode
from backend.app.mediscribe.models import (
    AudioChunk,
    ProcessingStage,
    TranscriptSegment,
    TranscriptUpdate,
)
from backend.app.mediscribe.pipeline import generate_after_final_transcript
from backend.app.mediscribe.providers.local_bosnian_draft import LocalBosnianDraftGenerator
from backend.app.mediscribe.providers.whisper_cpp import (
    WhisperCppConfig,
    WhisperCppTranscriptionProvider,
)
from backend.app.mediscribe.streaming import TwoPassStreamingTranscriber


class FakeTranscriptionProvider:
    name = "fake"

    def __init__(self, text: str, *, fail: bool = False) -> None:
        self.text = text
        self.fail = fail
        self.received_bytes = 0

    def transcribe(self, chunk: AudioChunk) -> list[TranscriptSegment]:
        self.received_bytes = len(chunk.data)
        if self.fail:
            raise ProviderError(
                ProviderErrorCode.TRANSCRIPTION_FAILED,
                "Synthetic failure",
                ProcessingStage.TRANSCRIBING,
                self.name,
            )
        return [
            TranscriptSegment(
                id=f"{chunk.id}-segment-1",
                speaker="unknown",
                text=self.text,
                start_ms=chunk.start_ms,
                end_ms=chunk.end_ms,
                confidence=0.9,
            )
        ]


class StreamingTests(unittest.TestCase):
    def test_provisional_text_is_replaced_by_authoritative_bosnian_result(self) -> None:
        live = FakeTranscriptionProvider("Alergična sam na penicilin")
        final = FakeTranscriptionProvider("Alergična sam na penicilin.")
        stream = TwoPassStreamingTranscriber(live, final)
        stream.start("session")

        update = stream.push(self._chunk(0, 2_000))
        result = stream.finish()

        self.assertEqual(update.provisional_text, "Alergična sam na penicilin")
        self.assertFalse(update.is_final)
        self.assertEqual(result.language, "bs")
        self.assertEqual(result.segments[0].text, "Alergična sam na penicilin.")
        self.assertTrue(result.is_final)
        self.assertEqual(stream.buffered_bytes, 0)

    def test_short_chunks_are_buffered_until_partial_interval(self) -> None:
        live = FakeTranscriptionProvider("Privremeni tekst")
        stream = TwoPassStreamingTranscriber(live, live)
        stream.start("session")

        first = stream.push(self._chunk(0, 1_000))
        second = stream.push(self._chunk(1_000, 2_000))

        self.assertIsNone(first)
        self.assertIsNotNone(second)
        self.assertEqual(live.received_bytes, 64_000)

    def test_audio_is_discarded_when_transcription_fails(self) -> None:
        failing = FakeTranscriptionProvider("", fail=True)
        stream = TwoPassStreamingTranscriber(failing, failing)
        stream.start("session")

        with self.assertRaises(ProviderError):
            stream.push(self._chunk(0, 2_000))

        self.assertEqual(stream.buffered_bytes, 0)

    def test_whisper_config_requires_bosnian_and_existing_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            binary = Path(directory, "whisper-cli")
            model = Path(directory, "model.bin")
            binary.touch(mode=0o700)
            model.touch()
            config = WhisperCppConfig(binary, model)
            self.assertEqual(config.language, "bs")
            with self.assertRaises(ValueError):
                WhisperCppConfig(binary, model, language="en")

    def test_whisper_adapter_rejects_invalid_wav_before_running_binary(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            binary = Path(directory, "whisper-cli")
            model = Path(directory, "model.bin")
            binary.touch(mode=0o700)
            model.touch()
            provider = WhisperCppTranscriptionProvider(WhisperCppConfig(binary, model))
            chunk = AudioChunk(
                id="invalid-wav",
                session_id="session",
                data=b"not a wav",
                start_ms=0,
                end_ms=1_000,
                encoding="wav",
            )

            with self.assertRaisesRegex(ProviderError, "valid WAV"):
                provider.transcribe(chunk)

    def test_local_draft_uses_only_finalized_bosnian_segments(self) -> None:
        segment = TranscriptSegment(
            id="final-segment",
            speaker="unknown",
            text="Imam temperaturu i alergičan sam na penicilin.",
            start_ms=0,
            end_ms=2_000,
            confidence=0.9,
        )
        final_update = TranscriptUpdate(
            session_id="session",
            revision=2,
            language="bs",
            segments=(segment,),
            is_final=True,
        )

        result = generate_after_final_transcript(
            final_update,
            LocalBosnianDraftGenerator(),
        )

        self.assertEqual(result.note.subjective, segment.text)
        self.assertEqual(result.note.objective, "")
        self.assertTrue(result.is_draft)
        self.assertEqual(result.evidence[0].segment_ids, (segment.id,))
        self.assertIn("Automatska dijagnoza nije generisana.", result.note.warnings)

    def test_local_draft_rejects_provisional_text(self) -> None:
        provisional = TranscriptUpdate(
            session_id="session",
            revision=1,
            language="bs",
            provisional_text="Nedovršeni tekst",
        )

        with self.assertRaisesRegex(ProviderError, "authoritative transcript"):
            generate_after_final_transcript(provisional, LocalBosnianDraftGenerator())

    @mock.patch.object(
        WhisperCppTranscriptionProvider,
        "_read_cpu_temperature_celsius",
        return_value=86.0,
    )
    def test_whisper_adapter_refuses_to_start_when_cpu_is_hot(self, _temperature: mock.Mock) -> None:
        with tempfile.TemporaryDirectory() as directory:
            binary = Path(directory, "whisper-cli")
            model = Path(directory, "model.bin")
            binary.touch(mode=0o700)
            model.touch()
            provider = WhisperCppTranscriptionProvider(WhisperCppConfig(binary, model))

            with self.assertRaisesRegex(ProviderError, "temperature reached") as raised:
                provider.transcribe(self._chunk(0, 1_000))

        self.assertEqual(raised.exception.code, ProviderErrorCode.THERMAL_LIMIT)

    @staticmethod
    def _chunk(start_ms: int, end_ms: int) -> AudioChunk:
        frames = (end_ms - start_ms) * 16
        return AudioChunk(
            id=f"chunk-{start_ms}",
            session_id="session",
            data=b"\x00\x00" * frames,
            start_ms=start_ms,
            end_ms=end_ms,
        )


if __name__ == "__main__":
    unittest.main()
