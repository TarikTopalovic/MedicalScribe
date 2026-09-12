"""Small, dependency-free benchmark for the mock local processing path."""

from __future__ import annotations

import argparse
import json
import os
import platform
import time
import tracemalloc

from backend.app.mediscribe.config import ProviderConfig, create_provider
from backend.app.mediscribe.models import AudioChunk
from backend.app.mediscribe.pipeline import process_chunks


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--iterations", type=int, default=10_000)
    args = parser.parse_args()
    if args.iterations < 1:
        parser.error("--iterations must be at least 1")

    provider = create_provider(ProviderConfig())
    chunk = AudioChunk(
        id="benchmark-chunk",
        session_id="benchmark-session",
        data=b"synthetic",
        start_ms=0,
        end_ms=1_000,
    )

    tracemalloc.start()
    started = time.perf_counter()
    for _ in range(args.iterations):
        result = process_chunks(chunk.session_id, [chunk], provider)
    elapsed = time.perf_counter() - started
    _, peak_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    if result.status.stage.value != "completed":
        raise RuntimeError("Mock local processing did not complete")

    print(
        json.dumps(
            {
                "platform": platform.platform(),
                "python": platform.python_version(),
                "logical_cpus": os.cpu_count(),
                "iterations": args.iterations,
                "elapsed_seconds": round(elapsed, 4),
                "average_ms": round(elapsed / args.iterations * 1_000, 4),
                "python_peak_kib": round(peak_bytes / 1024, 2),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
