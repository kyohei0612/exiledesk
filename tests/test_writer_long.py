"""構成表 → 章ごと → 全体検査 の流れ (runner はモック)。final_step の貫通."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from poe2tube.contracts.craft_stage import CraftStageResult
from poe2tube.script.brief import Brief
from poe2tube.script.lint import lint_section
from poe2tube.script.model import Line, Scene, Section, VideoScript
from poe2tube.script.outline import Outline
from poe2tube.script.writer_long import (
    _sections_to_rewrite,
    outline_prompt,
    section_prompt,
    write_script_long,
)

ROOT = Path(__file__).resolve().parents[1]


def _result() -> CraftStageResult:
    p = ROOT / "contracts/examples/result-transmute-augment-regal.json"
    return CraftStageResult.model_validate(json.loads(p.read_text(encoding="utf-8")))


def _brief() -> Brief:
    b = Brief.model_validate(
        json.loads((ROOT / "data/briefs/craft_intro_1min.json").read_text(encoding="utf-8"))
    )
    return b.model_copy(update={"target_seconds": 200, "final_step": 3})


def _outline_json() -> dict[str, object]:
    return {
        "title": "【PoE2 初心者】テスト",
        "sections": [
            {
                "name": "導入",
                "target_seconds": 25,
                "goal": "g",
                "points": ["p"],
                "steps": [],
                "scenes": ["talk"],
                "bridge": "b",
            },
            {
                "name": "仕組み",
                "target_seconds": 95,
                "goal": "g",
                "points": ["p"],
                "steps": [1, 2, 3],
                "scenes": ["stack"],
                "bridge": "b",
            },
            {
                "name": "実践",
                "target_seconds": 60,
                "goal": "g",
                "points": ["p"],
                "steps": [1, 2, 3],
                "scenes": ["stage"],
                "bridge": "b",
            },
            {
                "name": "まとめ",
                "target_seconds": 20,
                "goal": "g",
                "points": ["p"],
                "steps": [],
                "scenes": ["talk"],
                "bridge": "b",
            },
        ],
    }


def _lines(
    n_metan: int, n_zunda: int, scene: dict[str, object], chars: int = 28
) -> list[dict[str, object]]:
    out: list[dict[str, object]] = []
    for i in range(max(n_metan, n_zunda)):
        if i < n_metan:
            out.append(
                {
                    "speaker": "metan",
                    "text": ("説明するわ" + "よ" * chars)[:chars] + "。",
                    "scene": scene,
                }
            )
        if i < n_zunda:
            out.append(
                {
                    "speaker": "zundamon",
                    "text": ("なるほど" + "な" * chars)[:chars] + "のだ。",
                    "scene": scene,
                }
            )
    return out


def _section_json(name: str, seconds: int) -> dict[str, object]:
    # 320 字/分 → seconds 秒ぶんの行を作る (1 行 ≈ 30 字)
    n = max(2, round(seconds * 320 / 60 / 30))
    if name == "実践":
        lines = []
        st = 0
        while len(lines) < n:  # 手を巡回して 1 手 1 行以上、同じ画面が 3 行以上続かない
            st = st % 3 + 1
            lines += _lines(1, 1, {"kind": "stage", "step": st, "highlight": "added"})
        lines = lines[:n]
    elif name == "仕組み":
        lines = []
        st = 0
        while len(lines) < n:  # 工程を巡回して目標の行数まで (同じ画面が 3 行以上続かない)
            st = st % 3 + 1
            lines += _lines(
                1, 1, {"kind": "stack", "step": st, "show_steps": list(range(1, st + 1))}
            )
        lines = lines[:n]
    else:
        lines = []
        for i in range(n):
            scene = {"kind": "item", "step": 0} if i % 2 == 0 else {"kind": "item", "step": 3}
            lines += _lines(1 if i % 2 == 0 else 0, 0 if i % 2 == 0 else 1, scene)
    return {"name": name, "target_seconds": seconds, "lines": lines}


def test_outline_validation_catches_total_and_stage_coverage() -> None:
    o = Outline.model_validate(_outline_json())
    assert o.check_against(_brief(), _result()) == []
    bad = _outline_json()
    bad["sections"][2]["steps"] = [1, 2]  # type: ignore[index]
    bad["sections"][1]["target_seconds"] = 300  # type: ignore[index]
    problems = Outline.model_validate(bad).check_against(_brief(), _result())
    assert any("合計" in p for p in problems) and any("[3]" in p for p in problems)


def test_write_script_long_with_mock_runner() -> None:
    brief, result = _brief(), _result()
    calls: list[str] = []

    names = ("導入", "仕組み", "実践", "まとめ")
    secs = _outline_json()["sections"]

    def runner(prompt: str) -> str:
        calls.append(prompt)
        if "「構成表」" in prompt:
            return json.dumps(_outline_json(), ensure_ascii=False)
        for name, sec in zip(names, secs, strict=True):  # type: ignore[arg-type]
            if f"「{name}」の本文" in prompt:
                seconds = int(sec["target_seconds"])  # type: ignore[index]
                return json.dumps(_section_json(name, seconds), ensure_ascii=False)
        raise AssertionError("unknown prompt")

    lw = write_script_long(
        brief, result, "contracts/examples/result-transmute-augment-regal.json", runner
    )
    assert [s.name for s in lw.script.sections] == ["導入", "仕組み", "実践", "まとめ"]
    assert lw.script.final_step == 3
    assert lw.attempts["outline"] == 1
    # 2 章目のプロンプトには 1 章目の本文が入っている
    second = [p for p in calls if "「仕組み」の本文" in p][0]
    assert "ここまでの本文" in second and "導入" in second


def test_sections_to_rewrite_maps_line_numbers() -> None:
    s1 = Section(
        name="a",
        target_seconds=10,
        lines=[Line(speaker="metan", text="x。", scene=Scene(kind="item", step=0))] * 2,
    )
    s2 = Section(
        name="b",
        target_seconds=10,
        lines=[Line(speaker="metan", text="x。", scene=Scene(kind="item", step=0))] * 3,
    )
    script = VideoScript(title="t", target_seconds=20, result_file="r", sections=[s1, s2])
    assert _sections_to_rewrite(script, ["line 1: だめ", "line 4: だめ"]) == [0, 1]
    assert _sections_to_rewrite(script, ["尺の見込みが外"]) == [1]


def test_lint_section_checks_duration_and_steps() -> None:
    sec = Section(
        name="s",
        target_seconds=60,
        lines=[Line(speaker="metan", text="短い。", scene=Scene(kind="stage", step=9))],
    )
    problems = lint_section(sec, n_steps=3)
    assert any("尺" in p for p in problems) and any("step 9" in p for p in problems)


def test_prompts_mention_final_step_and_prior_text() -> None:
    brief, result = _brief(), _result()
    p = outline_prompt(brief, result, [])
    assert "完成とみなす手は 3 手目" in p
    o = Outline.model_validate(_outline_json())
    done = [Section.model_validate(_section_json("導入", 25))]
    q = section_prompt(brief, result, o, 1, done, ["前の問題"])
    assert "「仕組み」の本文" in q and "前の問題" in q and "ここまでの本文" in q


@pytest.mark.parametrize("final_step", [None, 2])
def test_stack_marks_final_step(final_step: int | None) -> None:
    from PIL import Image

    from poe2tube.render.stack import draw_stack

    result = _result()
    img = Image.new("RGBA", (1600, 700), (255, 255, 255, 255))
    draw_stack(
        img, (20, 20, 1580, 680), result, [1, 2, 3], 2, "rarity", ROOT / "assets/icons", final_step
    )
    assert img.size == (1600, 700)


def test_write_script_long_resumes_from_cache(tmp_path: Path) -> None:
    brief, result = _brief(), _result()
    names = ("導入", "仕組み", "実践", "まとめ")
    secs = _outline_json()["sections"]
    calls: list[str] = []

    def runner(prompt: str) -> str:
        calls.append(prompt)
        if "「構成表」" in prompt:
            return json.dumps(_outline_json(), ensure_ascii=False)
        for name, sec in zip(names, secs, strict=True):  # type: ignore[arg-type]
            if f"「{name}」の本文" in prompt:
                seconds = int(sec["target_seconds"])  # type: ignore[index]
                return json.dumps(_section_json(name, seconds), ensure_ascii=False)
        raise AssertionError("unknown prompt")

    rf = "contracts/examples/result-transmute-augment-regal.json"
    write_script_long(brief, result, rf, runner, cache_dir=tmp_path)
    assert (tmp_path / "outline.json").exists() and (tmp_path / "section_03.json").exists()
    n_first = len(calls)
    write_script_long(brief, result, rf, runner, cache_dir=tmp_path)
    assert len(calls) == n_first  # 2 回目は Claude を呼ばない
