from __future__ import annotations

import unittest

from backend.app.mediscribe.config import ProviderConfig, create_provider
from backend.app.mediscribe.errors import ProviderErrorCode
from backend.app.mediscribe.models import AudioChunk, TranscriptSegment
from backend.app.mediscribe.pipeline import process_chunks
from backend.app.mediscribe.providers.mock_local import MockLocalProvider


class MockLocalProviderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.session_id = "test-session"

    def test_factory_selects_mock_local_provider(self) -> None:
        provider = create_provider(ProviderConfig(provider="local", local_mode="mock"))
        self.assertIsInstance(provider, MockLocalProvider)

    def test_valid_chunk_returns_standard_transcript_segment(self) -> None:
        chunk = self._chunk()
        result = MockLocalProvider().transcribe(chunk)

        self.assertEqual(len(result), 1)
        self.assertEqual(
            set(result[0].to_dict()),
            {"id", "speaker", "text", "start_ms", "end_ms", "confidence"},
        )

    def test_empty_audio_returns_standardized_error_without_crashing_session(self) -> None:
        result = process_chunks(
            self.session_id,
            [self._chunk(data=b"")],
            MockLocalProvider(),
        )

        self.assertEqual(result.status.stage.value, "failed")
        self.assertEqual(result.status.error["code"], ProviderErrorCode.INVALID_AUDIO.value)
        self.assertIsNone(result.generation)

    def test_pipeline_returns_all_soap_keys_and_evidence(self) -> None:
        segment = TranscriptSegment(
            id="segment-scripted",
            speaker="patient",
            text="Synthetic test statement.",
            start_ms=0,
            end_ms=1_000,
            confidence=0.95,
        )
        chunk = self._chunk()
        provider = MockLocalProvider({chunk.id: [segment]})

        result = process_chunks(self.session_id, [chunk], provider)
        payload = result.to_dict()

        self.assertEqual(payload["status"]["stage"], "completed")
        self.assertTrue(payload["generation"]["is_draft"])
        self.assertEqual(
            set(payload["generation"]["note"]),
            {"subjective", "objective", "assessment", "plan", "warnings"},
        )
        known_ids = {item["id"] for item in payload["transcript"]}
        for reference in payload["generation"]["evidence"]:
            self.assertTrue(set(reference["segment_ids"]).issubset(known_ids))

    def test_low_confidence_adds_review_warning(self) -> None:
        low_confidence = TranscriptSegment(
            id="segment-low-confidence",
            speaker="unknown",
            text="Synthetic uncertain statement.",
            start_ms=0,
            end_ms=1_000,
            confidence=0.4,
        )

        result = MockLocalProvider().generate([low_confidence])

        self.assertIn(
            "Low-confidence transcript segment requires review.",
            result.note.warnings,
        )

    def _chunk(self, data: bytes = b"synthetic") -> AudioChunk:
        return AudioChunk(
            id="chunk-test",
            session_id=self.session_id,
            data=data,
            start_ms=0,
            end_ms=1_000,
        )


if __name__ == "__main__":
    unittest.main()
