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
    assert shot_at(frames, 24, 1.0, None, 0.5, rate=2.0) == frames[48]  # 倍速
    assert shot_at([], 24, 0.0, None, 0.0) is None


def test_scene_footage_needs_clip_and_at() -> None:
    scene = Scene(kind="footage", clip="orbs", at=1.5, hold=3.0)
    assert scene.key()[-5:] == ("orbs", 1.5, 3.0, 1.0, None)
    with pytest.raises(ValidationError):
        Scene(kind="footage", clip="orbs")
    with pytest.raises(ValidationError):
        Scene(kind="stage", step=1, clip="orbs", at=0)
    with pytest.raises(ValidationError):
        Scene(kind="footage", clip="orbs", at=3.0, hold=1.0)


def test_footage_frames_missing_clip(tmp_path: Path) -> None:
    assert footage_frames("nothing", 24, tmp_path) == []


def test_lint_counts_footage_as_practice() -> None:
    from poe2tube.script.lint import stage_coverage
    from poe2tube.script.model import VideoScript

    line = {"speaker": "metan", "emotion": "normal", "text": "打つわね。"}
    base = {
        "schema": "poe2tube-script/1",
        "title": "t",
        "target_seconds": 60,
        "result_file": "data/results/x.json",
        "sections": [
            {
                "name": "a",
                "target_seconds": 60,
                "lines": [{**line, "scene": {"kind": "footage", "clip": "orbs", "at": 0}}],
            }
        ],
    }
    assert stage_coverage(VideoScript.model_validate(base), None) == []


def test_zoom_box_eases_from_prev_to_cur() -> None:
    from poe2tube.capture.footage import FULL, ZOOM_BOX, ZOOM_SECONDS, zoom_box

    card = ZOOM_BOX["card"]
    assert zoom_box(FULL, card, 0.0) == FULL
    assert zoom_box(FULL, card, ZOOM_SECONDS) == card
    mid = zoom_box(FULL, card, ZOOM_SECONDS / 2)
    assert FULL[1] < mid[1] < card[1]
    for x0, y0, x1, y1 in ZOOM_BOX.values():  # どれも 16:9 (歪まない)
        assert abs((x1 - x0) / (y1 - y0) - 16 / 9) < 0.02


def test_reading_fuda() -> None:
    from poe2tube.script.reading import normalize_speech

    assert normalize_speech("横の札で変えられるの。") == "横のふだで変えられるの。"
    assert normalize_speech("右の%は、14%増加") == "右のパーセントは、14%増加"
    assert normalize_speech("Escか右クリック") == "エスケープか右クリック"
    assert normalize_speech("工程の行を押せば") == "工程のぎょうを押せば"
