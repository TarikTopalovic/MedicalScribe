"""Deliberately test selected OpenRouter STT and draft models with one WAV file."""

from __future__ import annotations

import argparse
import json
import sys
import wave
from pathlib import Path

repo_root = Path(__file__).resolve().parents[1]
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

from backend.app.mediscribe.models import AudioChunk, TranscriptUpdate
from backend.app.mediscribe.pipeline import generate_after_final_transcript
from backend.app.mediscribe.providers.openrouter import (
    OpenRouterBosnianDraftGenerator,
    OpenRouterClient,
    OpenRouterSettings,
    OpenRouterTranscriptionProvider,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Send one approved WAV recording to selected OpenRouter models."
    )
    parser.add_argument("audio", type=Path, nargs="?")
    parser.add_argument("--list-stt-models", action="store_true")
    parser.add_argument("--transcription-model")
    parser.add_argument("--draft-model")
    parser.add_argument("--skip-draft", action="store_true")
    args = parser.parse_args()
    if args.list_stt_models == (args.audio is not None):
        parser.error("provide an audio WAV or use --list-stt-models")

    client = OpenRouterClient(OpenRouterSettings.from_env())
    if args.list_stt_models:
        print(json.dumps({"models": client.list_transcription_models()}, indent=2))
        return

    assert args.audio is not None
    model = args.transcription_model
    if not model:
        parser.error("--transcription-model is required")
    chunk = _read_wav(args.audio)
    segments = OpenRouterTranscriptionProvider(client, model).transcribe(chunk)
    final_update = TranscriptUpdate(
        session_id=chunk.session_id,
        revision=1,
        language="bs",
        segments=tuple(segments),
        is_final=True,
    )
    print(json.dumps(final_update.to_dict(), ensure_ascii=False), flush=True)

    if args.skip_draft:
        return
    if not args.draft_model:
        parser.error("--draft-model is required unless --skip-draft is used")
    draft = generate_after_final_transcript(
        final_update,
        OpenRouterBosnianDraftGenerator(client, args.draft_model),
    )
    print(json.dumps({"generation": draft.to_dict()}, ensure_ascii=False), flush=True)


def _read_wav(path: Path) -> AudioChunk:
    try:
        data = path.read_bytes()
        with wave.open(str(path), "rb") as audio:
            if (
                audio.getnchannels() != 1
                or audio.getsampwidth() != 2
                or audio.getframerate() != 16_000
                or audio.getnframes() < 1
            ):
                raise ValueError("audio must be signed 16-bit, 16 kHz, mono WAV")
            duration_ms = max(1, round(audio.getnframes() / audio.getframerate() * 1_000))
    except (EOFError, OSError, ValueError, wave.Error) as error:
        raise SystemExit(f"Cannot read approved WAV audio: {error}") from error
    return AudioChunk(
        id=f"openrouter-{path.stem}",
        session_id="openrouter-model-check",
        data=data,
        start_ms=0,
        end_ms=duration_ms,
        encoding="wav",
    )


if __name__ == "__main__":
    main()
