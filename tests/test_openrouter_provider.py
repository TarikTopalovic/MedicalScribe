from __future__ import annotations

import base64
import json
import unittest
from unittest import mock
from urllib.error import HTTPError

from backend.app.mediscribe.errors import ProviderError, ProviderErrorCode
from backend.app.mediscribe.models import AudioChunk, ProcessingStage, TranscriptSegment
from backend.app.mediscribe.providers.openrouter import (
    OpenRouterBosnianDraftGenerator,
    OpenRouterClient,
    OpenRouterSettings,
    OpenRouterTranscriptionProvider,
)


class OpenRouterProviderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = OpenRouterClient(
            OpenRouterSettings("test-key-not-a-secret", allow_remote_processing=True)
        )

    def test_transcription_sends_bosnian_wav_without_exposing_key_in_body(self) -> None:
        response = self._response(
            {
                "language": "bs",
                "segments": [
                    {
                        "text": "Dobar dan.",
                        "start": 0,
                        "end": 1,
                        "speaker": 0,
                        "confidence": 0.91,
                    }
                ],
            }
        )
        provider = OpenRouterTranscriptionProvider(self.client, "test/stt-model")

        with mock.patch(
            "backend.app.mediscribe.providers.openrouter.urlopen",
            return_value=response,
        ) as request_call:
            segments = provider.transcribe(self._chunk())

        request = request_call.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(payload["model"], "test/stt-model")
        self.assertEqual(payload["language"], "bs")
        self.assertEqual(payload["provider"], {"zdr": True, "data_collection": "deny"})
        self.assertTrue(base64.b64decode(payload["input_audio"]["data"]).startswith(b"RIFF"))
        self.assertNotIn("test-key-not-a-secret", request.data.decode())
        self.assertEqual(segments[0].text, "Dobar dan.")
        self.assertEqual(segments[0].speaker, "0")

    def test_remote_draft_parses_json_and_keeps_evidence_on_final_segments(self) -> None:
        response = self._response(
            {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "subjective": "Pacijent navodi kašalj.",
                                    "objective": "",
                                    "assessment": "Potrebna je procjena kliničara.",
                                    "plan": "Pregledati nalaz.",
                                    "warnings": ["Provjeriti transkript."],
                                }
                            )
                        }
                    }
                ]
            }
        )
        segment = TranscriptSegment(
            id="final-1",
            speaker="unknown",
            text="Imam kašalj.",
            start_ms=0,
            end_ms=1_000,
            confidence=0.9,
        )
        provider = OpenRouterBosnianDraftGenerator(self.client, "test/draft-model")

        with mock.patch(
            "backend.app.mediscribe.providers.openrouter.urlopen",
            return_value=response,
        ):
            result = provider.generate([segment])

        self.assertTrue(result.is_draft)
        self.assertEqual(result.note.subjective, "Pacijent navodi kašalj.")
        self.assertEqual(result.evidence[0].segment_ids, ("final-1",))
        self.assertIn("Nacrt generisan putem vanjskog servisa; potrebna je provjera kliničara.", result.note.warnings)

    def test_payment_requirement_is_explained_without_retrying(self) -> None:
        with mock.patch(
            "backend.app.mediscribe.providers.openrouter.urlopen",
            side_effect=HTTPError("https://openrouter.ai", 402, "Payment Required", {}, None),
        ):
            with self.assertRaisesRegex(ProviderError, "available account credit") as raised:
                self.client.post_json(
                    "/audio/transcriptions",
                    {"model": "test/stt-model"},
                    stage=ProcessingStage.TRANSCRIBING,
                    provider="openrouter-stt",
                )

        self.assertEqual(raised.exception.code, ProviderErrorCode.PAYMENT_REQUIRED)
        self.assertFalse(raised.exception.retryable)

    def test_clinical_cloud_mode_fails_closed_without_eu_routing_and_dpa(self) -> None:
        with self.assertRaisesRegex(ValueError, "EU in-region"):
            OpenRouterSettings(
                "test-key-not-a-secret",
                allow_remote_processing=True,
                data_classification="clinical",
            )
        with self.assertRaisesRegex(ValueError, "processor agreement"):
            OpenRouterSettings(
                "test-key-not-a-secret",
                allow_remote_processing=True,
                data_classification="clinical",
                eu_in_region=True,
            )

    def test_clinical_cloud_mode_uses_eu_endpoint_after_prerequisites(self) -> None:
        settings = OpenRouterSettings(
            "test-key-not-a-secret",
            allow_remote_processing=True,
            data_classification="clinical",
            eu_in_region=True,
            dpa_approved=True,
        )

        self.assertTrue(settings.api_base.startswith("https://eu.openrouter.ai/"))

    def test_missing_eu_entitlement_blocks_clinical_routing(self) -> None:
        eu_client = OpenRouterClient(
            OpenRouterSettings(
                "test-key-not-a-secret",
                allow_remote_processing=True,
                data_classification="synthetic",
                eu_in_region=True,
            )
        )
        with mock.patch(
            "backend.app.mediscribe.providers.openrouter.urlopen",
            side_effect=HTTPError("https://eu.openrouter.ai", 403, "Forbidden", {}, None),
        ):
            with self.assertRaisesRegex(ProviderError, "EU in-region routing") as raised:
                eu_client.list_transcription_models()

        self.assertEqual(raised.exception.code, ProviderErrorCode.COMPLIANCE_BLOCKED)
        self.assertFalse(raised.exception.retryable)

    @staticmethod
    def _response(payload: dict[str, object]) -> mock.MagicMock:
        response = mock.MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = json.dumps(payload).encode()
        return response

    @staticmethod
    def _chunk() -> AudioChunk:
        return AudioChunk(
            id="chunk-1",
            session_id="session",
            data=b"\x00\x00" * 16_000,
            start_ms=0,
            end_ms=1_000,
        )
