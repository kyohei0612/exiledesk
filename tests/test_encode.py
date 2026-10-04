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


def test_frame_times_cover_total() -> None:
    from poe2tube.capture.clip_step import frame_times

    ts = frame_times(4510, 24)
    assert ts[0] == 0 and ts[-1] >= 4510 and len(ts) == 110


def test_attach_from_file(tmp_path: Path) -> None:
    from poe2tube.capture.clip_step import ATTACH_FILE, attach_from_file

    f = tmp_path / "f001.png"
    f.write_bytes(b"")
    assert attach_from_file([f]) is None
    (tmp_path / ATTACH_FILE).write_text("70", encoding="utf-8")
    assert attach_from_file([f]) == 70


def test_pick_starts_reveal_clip(tmp_path: Path) -> None:
    from poe2tube.capture.clip_step import PICK_FILE, pick_from_file
    from poe2tube.video.clip_timing import HitPlan

    clip = [tmp_path / f"f{k:03d}.png" for k in range(1, 101)]
    assert pick_from_file(clip) is None
    (tmp_path / PICK_FILE).write_text("40", encoding="utf-8")
    assert pick_from_file(clip) == 40
    hp = HitPlan(3, tuple(clip), 70, preroll=False, pick=40)
    assert hp.start == 40 and hp.land_at == 30 / 24
    assert HitPlan(3, tuple(clip), 70, preroll=False).start == 70 - int(0.4 * 24)
