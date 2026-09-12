"""Two-pass live transcription with provisional and authoritative outputs."""

from __future__ import annotations

from .errors import ProviderError, ProviderErrorCode
from .models import AudioChunk, ProcessingStage, TranscriptUpdate
from .providers.base import TranscriptionProvider


class TwoPassStreamingTranscriber:
    """Use a fast model while speaking and a quality model at utterance end."""

    def __init__(
        self,
        live_provider: TranscriptionProvider | None,
        final_provider: TranscriptionProvider,
        *,
        partial_interval_ms: int = 2_000,
        max_utterance_ms: int = 30_000,
        language: str = "bs",
    ) -> None:
        if partial_interval_ms < 250 or max_utterance_ms <= partial_interval_ms:
            raise ValueError("Streaming intervals are invalid")
        self.live_provider = live_provider
        self.final_provider = final_provider
        self.partial_interval_ms = partial_interval_ms
        self.max_utterance_ms = max_utterance_ms
        self.language = language
        self._audio = bytearray()
        self._session_id: str | None = None
        self._start_ms = 0
        self._end_ms = 0
        self._last_partial_ms = 0
        self._revision = 0

    @property
    def buffered_bytes(self) -> int:
        return len(self._audio)

    def start(self, session_id: str) -> None:
        if not session_id:
            raise ValueError("Streaming session id is required")
        self.abort()
        self._session_id = session_id

    def push(self, chunk: AudioChunk) -> TranscriptUpdate | None:
        try:
            self._validate_chunk(chunk)
            if not self._audio:
                self._start_ms = chunk.start_ms
            self._audio.extend(chunk.data)
            self._end_ms = chunk.end_ms

            duration_ms = self._end_ms - self._start_ms
            if duration_ms > self.max_utterance_ms:
                raise ProviderError(
                    code=ProviderErrorCode.INVALID_AUDIO,
                    message="Live utterance exceeded the configured duration limit",
                    stage=ProcessingStage.TRANSCRIBING,
                    provider=self._input_provider.name,
                )
            if (
                self.live_provider is None
                or duration_ms - self._last_partial_ms < self.partial_interval_ms
            ):
                return None

            assert self.live_provider is not None
            segments = self.live_provider.transcribe(self._combined_chunk("partial"))
        except Exception:
            self.abort()
            raise
        self._last_partial_ms = duration_ms
        self._revision += 1
        return TranscriptUpdate(
            session_id=chunk.session_id,
            revision=self._revision,
            language=self.language,
            provisional_text=" ".join(segment.text for segment in segments),
        )

    def finish(self) -> TranscriptUpdate:
        if not self._audio or self._session_id is None:
            raise ProviderError(
                code=ProviderErrorCode.INVALID_AUDIO,
                message="Live session has no audio to finalize",
                stage=ProcessingStage.TRANSCRIBING,
                provider=self.final_provider.name,
            )
        session_id = self._session_id
        try:
            segments = tuple(self.final_provider.transcribe(self._combined_chunk("final")))
            self._revision += 1
            return TranscriptUpdate(
                session_id=session_id,
                revision=self._revision,
                language=self.language,
                segments=segments,
                is_final=True,
            )
        finally:
            self.abort()

    def abort(self) -> None:
        for index in range(len(self._audio)):
            self._audio[index] = 0
        self._audio.clear()
        self._session_id = None
        self._start_ms = 0
        self._end_ms = 0
        self._last_partial_ms = 0
        self._revision = 0

    def _combined_chunk(self, kind: str) -> AudioChunk:
        assert self._session_id is not None
        return AudioChunk(
            id=f"{self._session_id}-{kind}-{self._revision + 1}",
            session_id=self._session_id,
            data=bytes(self._audio),
            start_ms=self._start_ms,
            end_ms=self._end_ms,
        )

    def _validate_chunk(self, chunk: AudioChunk) -> None:
        if self._session_id is None:
            raise ValueError("Start the streaming session before pushing audio")
        if chunk.session_id != self._session_id:
            raise ValueError("Audio chunk belongs to another session")
        if self._audio and chunk.start_ms != self._end_ms:
            raise ProviderError(
                code=ProviderErrorCode.INVALID_AUDIO,
                message="Live audio chunks must be contiguous",
                stage=ProcessingStage.TRANSCRIBING,
                provider=self._input_provider.name,
            )
        if chunk.encoding != "pcm_s16le" or chunk.sample_rate_hz != 16_000 or chunk.channels != 1:
            raise ProviderError(
                code=ProviderErrorCode.INVALID_AUDIO,
                message="Live audio must be signed 16-bit, 16 kHz, mono PCM",
                stage=ProcessingStage.TRANSCRIBING,
                provider=self._input_provider.name,
            )
        expected_bytes = (chunk.end_ms - chunk.start_ms) * 32
        if len(chunk.data) != expected_bytes:
            raise ProviderError(
                code=ProviderErrorCode.INVALID_AUDIO,
                message="Live PCM byte count does not match its duration",
                stage=ProcessingStage.TRANSCRIBING,
                provider=self._input_provider.name,
            )

    @property
    def _input_provider(self) -> TranscriptionProvider:
        return self.live_provider or self.final_provider


class FinalOnlyStreamingTranscriber(TwoPassStreamingTranscriber):
    """Transcribe a short utterance only after the caller detects silence.

    This keeps microphone capture local while a remote STT request is made for
    the completed utterance, rather than repeatedly uploading partial buffers.
    """

    def __init__(
        self,
        final_provider: TranscriptionProvider,
        *,
        max_utterance_ms: int = 30_000,
        language: str = "bs",
    ) -> None:
        super().__init__(
            None,
            final_provider,
            max_utterance_ms=max_utterance_ms,
            language=language,
        )
