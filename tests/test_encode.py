"""書き出し: コマを ffmpeg に直接流す / GPU (NVENC) が無ければ CPU に戻る (2026-10-04)."""

from __future__ import annotations

import shutil
import wave
from pathlib import Path

import pytest
from PIL import Image

from poe2tube.video import encode


def _silence(path: Path, seconds: float = 0.5) -> Path:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(24000)
        w.writeframes(b"\x00\x00" * int(24000 * seconds))
    return path


def test_video_args_fall_back_to_cpu(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(encode, "nvenc_available", lambda: False)
    assert encode.video_args(True) == encode.X264_ARGS
    assert encode.video_args(False) == encode.X264_ARGS
    monkeypatch.setattr(encode, "nvenc_available", lambda: True)
    assert encode.video_args(True) == encode.NVENC_ARGS


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg が無い")
def test_encode_stream_writes_mp4(tmp_path: Path) -> None:
    frames = ((n, Image.new("RGB", (64, 36), (n * 20, 0, 0))) for n in range(6))
    out = tmp_path / "a.mp4"
    n = encode.encode_stream(frames, _silence(tmp_path / "a.wav"), 12, out, use_gpu=False)
    assert n == 6
    assert out.exists() and out.stat().st_size > 0


def test_encode_stream_needs_frames(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        encode.encode_stream(iter([]), tmp_path / "a.wav", 24, tmp_path / "a.mp4", False)
