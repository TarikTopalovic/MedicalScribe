"""Run one guarded local whisper.cpp transcription and emit a safe JSON result."""

from __future__ import annotations

import argparse
import json
import os
import sys
import wave
from pathlib import Path

repo_root = Path(__file__).resolve().parents[1]
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

from backend.app.mediscribe.models import AudioChunk
from backend.app.mediscribe.providers.whisper_cpp import WhisperCppConfig, WhisperCppTranscriptionProvider


def main() -> int:
    parser = argparse.ArgumentParser(description="MediScribe local one-shot transcription")
    parser.add_argument("audio", type=Path)
    parser.add_argument("--binary", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--threads", type=int, default=os.cpu_count() or 1)
    parser.add_argument("--vad-model", type=Path, default=None)
    parser.add_argument("--max-cpu-temperature", type=float, default=85.0)
    args = parser.parse_args()

    try:
        with wave.open(str(args.audio), "rb") as audio:
            if audio.getnchannels() != 1 or audio.getsampwidth() != 2 or audio.getframerate() != 16_000:
                raise ValueError("WAV audio must be signed 16-bit, 16 kHz, and mono")
            frame_count = audio.getnframes()
            if frame_count < 1:
                raise ValueError("Audio is empty")
            duration_ms = max(1, round(frame_count * 1_000 / 16_000))
            audio_data = args.audio.read_bytes()
        provider = WhisperCppTranscriptionProvider(
            WhisperCppConfig(
                binary_path=args.binary,
                model_path=args.model,
                vad_model_path=args.vad_model,
                threads=args.threads,
                beam_size=5,
                max_cpu_temperature_celsius=args.max_cpu_temperature,
            )
        )
        segments = provider.transcribe(
            AudioChunk(
                id="desktop-utterance",
                session_id="desktop-session",
                data=audio_data,
                start_ms=0,
                end_ms=duration_ms,
                encoding="wav",
            )
        )
        payload = [segment.to_dict() for segment in segments]
        print(json.dumps({"language": "bs", "text": " ".join(item["text"] for item in payload), "segments": payload}, ensure_ascii=False))
        return 0
    except Exception as error:  # Bridge returns a generic UI-safe error only.
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
