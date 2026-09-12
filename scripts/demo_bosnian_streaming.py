"""Simulate live Bosnian transcription from a 16 kHz mono WAV file."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import wave
from pathlib import Path

repo_root = Path(__file__).resolve().parents[1]
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

from backend.app.mediscribe.models import AudioChunk
from backend.app.mediscribe.pipeline import generate_after_final_transcript
from backend.app.mediscribe.providers.local_bosnian_draft import LocalBosnianDraftGenerator
from backend.app.mediscribe.providers.whisper_cpp import (
    WhisperCppConfig,
    WhisperCppTranscriptionProvider,
)
from backend.app.mediscribe.streaming import TwoPassStreamingTranscriber


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio", type=Path)
    parser.add_argument(
        "--binary",
        type=Path,
        default=os.getenv("MEDISCRIBE_WHISPER_CPP_BINARY"),
        required="MEDISCRIBE_WHISPER_CPP_BINARY" not in os.environ,
    )
    parser.add_argument(
        "--live-model",
        type=Path,
        default=os.getenv("MEDISCRIBE_WHISPER_LIVE_MODEL"),
        required="MEDISCRIBE_WHISPER_LIVE_MODEL" not in os.environ,
    )
    parser.add_argument(
        "--final-model",
        type=Path,
        default=os.getenv("MEDISCRIBE_WHISPER_FINAL_MODEL"),
        required="MEDISCRIBE_WHISPER_FINAL_MODEL" not in os.environ,
    )
    parser.add_argument("--threads", type=int, default=min(4, os.cpu_count() or 4))
    parser.add_argument("--chunk-ms", type=int, default=2_000)
    parser.add_argument("--realtime", action="store_true")
    args = parser.parse_args()

    live = WhisperCppTranscriptionProvider(
        WhisperCppConfig(args.binary, args.live_model, threads=args.threads, beam_size=1)
    )
    final = WhisperCppTranscriptionProvider(
        WhisperCppConfig(args.binary, args.final_model, threads=args.threads, beam_size=5)
    )
    stream = TwoPassStreamingTranscriber(
        live,
        final,
        partial_interval_ms=args.chunk_ms,
    )
    stream.start("synthetic-stream-demo")

    try:
        with wave.open(str(args.audio), "rb") as audio:
            if (
                audio.getnchannels() != 1
                or audio.getsampwidth() != 2
                or audio.getframerate() != 16_000
            ):
                parser.error("audio must be signed 16-bit, 16 kHz, mono WAV")
            pcm = bytearray(audio.readframes(audio.getnframes()))
    except (EOFError, OSError, wave.Error) as error:
        parser.error(f"could not read WAV audio: {error or 'file is empty'}")
    if not pcm:
        parser.error("WAV audio contains no samples")

    bytes_per_chunk = args.chunk_ms * 32
    try:
        start_ms = 0
        for offset in range(0, len(pcm), bytes_per_chunk):
            data = bytes(pcm[offset : offset + bytes_per_chunk])
            duration_ms = len(data) // 32
            data = data[: duration_ms * 32]
            if not data:
                break
            chunk = AudioChunk(
                id=f"chunk-{start_ms}",
                session_id="synthetic-stream-demo",
                data=data,
                start_ms=start_ms,
                end_ms=start_ms + duration_ms,
            )
            update = stream.push(chunk)
            if update:
                print(json.dumps(update.to_dict(), ensure_ascii=False), flush=True)
            start_ms += duration_ms
            if args.realtime:
                time.sleep(duration_ms / 1_000)

        final_update = stream.finish()
        print(json.dumps(final_update.to_dict(), ensure_ascii=False), flush=True)
        draft = generate_after_final_transcript(
            final_update,
            LocalBosnianDraftGenerator(),
        )
        print(json.dumps({"generation": draft.to_dict()}, ensure_ascii=False), flush=True)
    finally:
        for index in range(len(pcm)):
            pcm[index] = 0


if __name__ == "__main__":
    main()
