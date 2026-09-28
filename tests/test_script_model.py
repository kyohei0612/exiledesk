"""台本モデルと 1 分テスト台本の検証."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from poe2tube.contracts.craft_stage import CraftStageResult
from poe2tube.script.model import Line, Scene, VideoScript

ROOT = Path(__file__).resolve().parents[1]
DRAFT = ROOT / "data" / "scripts" / "test_1min_craft_intro.json"


def _script() -> VideoScript:
    return VideoScript.model_validate(json.loads(DRAFT.read_text(encoding="utf-8")))


def _result(script: VideoScript) -> CraftStageResult:
    return CraftStageResult.model_validate(
        json.loads((ROOT / script.result_file).read_text(encoding="utf-8"))
    )


def test_draft_loads_and_every_line_has_scene() -> None:
    script = _script()
    assert len(script.lines) >= 10
    assert all(ln.scene.kind for ln in script.lines)


def test_draft_matches_result_and_target_length() -> None:
    script = _script()
    problems = script.check_against(_result(script))
    assert problems == []
    assert 45 <= script.estimated_seconds() <= 75


def test_draft_follows_yukkuri_rules() -> None:
    script = _script()
    # 一文 40 字以内が目安 (句点区切り)
    too_long = [s for ln in script.lines for s in ln.text.split("。") if len(s.strip("！？")) > 40]
    assert too_long == []
    # 解説役 3〜5 に聞き役 1〜2: 聞き役の比率が 25〜50%
    zunda = sum(1 for ln in script.lines if ln.speaker == "zundamon")
    assert 0.25 <= zunda / len(script.lines) <= 0.5
    # 語尾固定
    for ln in script.lines:
        if ln.speaker == "zundamon":
            assert "のだ" in ln.text, ln.text
        else:
            assert not ln.text.endswith(("です。", "ます。")), ln.text


def test_scene_requires_step_for_visual_kinds() -> None:
    with pytest.raises(ValidationError):
        Scene(kind="stack")
    with pytest.raises(ValidationError):
        Scene(kind="talk", show_steps=[1])
    assert Scene(kind="stage", step=0).step == 0


def test_line_spoken_prefers_speech() -> None:
    ln = Line(speaker="metan", text="MOD", speech="モッド", scene=Scene(kind="talk"))
    assert ln.spoken == "モッド"
    assert Line(speaker="metan", text="MOD", scene=Scene(kind="talk")).spoken == "モッド"


def test_check_against_reports_bad_step() -> None:
    script = _script()
    result = _result(script)
    script.sections[0].lines[0].scene = Scene(kind="stage", step=9)
    problems = script.check_against(result)
    assert any("step 9" in p for p in problems)
