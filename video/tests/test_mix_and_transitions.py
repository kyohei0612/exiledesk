"""BGM/SE ミックスと画面切替の検出・演出カーブ."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from poe2tube.audio import mix as m
from poe2tube.script.model import Line, Scene
from poe2tube.video.animate import SLIDE_PX, SLIDE_SECONDS, slide_in
from poe2tube.video.timeline import read_wav, scene_changed, write_wav


def test_scene_changed_detects_kind_step_and_order() -> None:
    a = Line(speaker="metan", text="a", scene=Scene(kind="stack", step=1, show_steps=[1]))
    b = Line(speaker="metan", text="b", scene=Scene(kind="stack", step=1, show_steps=[1]))
    c = Line(speaker="metan", text="c", scene=Scene(kind="stack", step=2, show_steps=[1, 2]))
    d = Line(speaker="metan", text="d", scene=Scene(kind="talk"))
    assert scene_changed(None, a)
    assert not scene_changed(a, b)
    assert scene_changed(b, c)
    assert scene_changed(c, d)


def test_slide_in_curve() -> None:
    dy0, a0 = slide_in(0.0)
    dy1, a1 = slide_in(SLIDE_SECONDS)
    assert (dy0, a0) == (SLIDE_PX, 0.0)
    assert (dy1, a1) == (0, 1.0)
    mid_dy, mid_a = slide_in(SLIDE_SECONDS / 2)
    assert 0 < mid_dy < SLIDE_PX and 0.5 < mid_a < 1.0


def test_loop_and_place_and_db() -> None:
    clip = np.ones(10, dtype=np.float32)
    looped = m.loop_to(clip, 25, fade=5)
    assert len(looped) == 25 and looped[-1] == 0.0 and looped[12] == 1.0
    track = np.zeros(100, dtype=np.float32)
    m.place(track, clip, at=0.5, sr=100, gain=0.5)
    assert track[50] == 0.5 and track[60] == 0.0
    m.place(track, clip, at=2.0, sr=100, gain=1.0)  # はみ出しは無視
    assert m.db(-20) == pytest.approx(0.1)


def test_mix_without_assets_keeps_voice(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    sr = 24000
    voice = np.zeros(sr, dtype=np.float32)
    voice[sr // 4 : sr // 2] = 0.5
    vpath = write_wav(tmp_path / "v.wav", voice, sr)
    monkeypatch.setattr(m, "se_path", lambda kind: tmp_path / "missing.mp3")
    out = m.mix(vpath, tmp_path / "o.wav", None, [m.SoundEvent(0.1, "start")], -20, -10)
    mixed, _ = read_wav(out)
    assert len(mixed) == len(voice)
    assert mixed[sr // 3] == pytest.approx(0.5, abs=0.01)


def test_voice_envelope_ducks_where_voice_is() -> None:
    sr = 24000
    voice = np.zeros(sr * 2, dtype=np.float32)
    voice[sr // 2 : sr] = 0.3
    env = m._voice_envelope(voice, sr, ducking=0.5)
    assert env[int(sr * 0.75)] < 0.7
    assert env[int(sr * 1.75)] > 0.95
