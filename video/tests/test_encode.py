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


def test_tight_spaces() -> None:
    from poe2tube.render.overlay_fx import tight_spaces

    assert tight_spaces("レートが 10% 増加する") == "レートが10%増加する"
    assert tight_spaces("MOD が[2 個]付く") == "MODが[2個]付く"
    assert tight_spaces("キャストスピードが T1 なのだ！") == "キャストスピードがT1なのだ！"
    assert tight_spaces("Path of Exile 2 の話") == "Path of Exile 2の話"


def test_rune_keys_with_socket_index() -> None:
    from poe2tube.contracts.craft_stage import _check_currency

    for key in ("rune:Lesser Desert Rune@2", "rune:Raven-Touched Shard", "rune:Legacy of Mjölner"):
        assert _check_currency(key) == key


def test_lint_skips_whole_script_checks_while_writing() -> None:
    from poe2tube.script.lint import lint_script
    from poe2tube.script.model import VideoScript

    sec = {
        "name": "導入",
        "target_seconds": 30,
        "lines": [
            {"speaker": "metan", "text": "今日はルーンの話をするわ。", "scene": {"kind": "talk"}},
            {"speaker": "zundamon", "text": "楽しみなのだ！", "scene": {"kind": "talk"}},
        ],
    }
    base = {"schema": "poe2tube-script/1", "title": "t", "target_seconds": 600}
    base |= {"result_file": "data/results/socketables.json", "sections": [sec]}
    writing = VideoScript.model_validate(base | {"planned_sections": 8})
    done = VideoScript.model_validate(base)
    assert not any("尺の見込み" in p for p in lint_script(writing))
    assert any("尺の見込み" in p for p in lint_script(done))


def test_short_added_damage() -> None:
    from poe2tube.render.overlay_fx import _short

    assert _short("14から23の火ダメージを追加する") == "火ダメージ 14〜23"
    assert _short("見つかるアイテムのレアリティが12%増加する") == "レアリティ 12%"
