"""footage の画面 (アプリを操作した録画) の時刻 → コマ と台本の型."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from poe2tube.capture.footage import footage_frames, shot_at
from poe2tube.script.model import Scene


def test_shot_at_plays_from_at_and_holds() -> None:
    frames = [Path(f"f{i:05d}.png") for i in range(100)]
    assert shot_at(frames, 24, 1.0, None, 0.0) == frames[24]
    assert shot_at(frames, 24, 1.0, None, 0.5) == frames[36]
    assert shot_at(frames, 24, 1.0, 2.0, 5.0) == frames[48]  # hold で止まる
    assert shot_at(frames, 24, 3.0, None, 9.0) == frames[99]  # 録画の最後で止まる
    assert shot_at([], 24, 0.0, None, 0.0) is None


def test_scene_footage_needs_clip_and_at() -> None:
    assert Scene(kind="footage", clip="orbs", at=1.5, hold=3.0).key()[-3:] == ("orbs", 1.5, 3.0)
    with pytest.raises(ValidationError):
        Scene(kind="footage", clip="orbs")
    with pytest.raises(ValidationError):
        Scene(kind="stage", step=1, clip="orbs", at=0)
    with pytest.raises(ValidationError):
        Scene(kind="footage", clip="orbs", at=3.0, hold=1.0)


def test_footage_frames_missing_clip(tmp_path: Path) -> None:
    assert footage_frames("nothing", 24, tmp_path) == []
