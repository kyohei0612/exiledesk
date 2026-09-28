from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from poe2tube.config.settings import REPO_ROOT
from poe2tube.contracts.craft_stage import CraftStageResult
from poe2tube.script.lint import stage_coverage
from poe2tube.script.model import Line, Scene, Section, VideoScript
from poe2tube.video import clip_timing as ct
from poe2tube.video.results import ResultSet, as_set, load_results

EX = "contracts/examples/result-transmute-augment-regal.json"


def _result() -> CraftStageResult:
    return CraftStageResult.model_validate(json.loads((REPO_ROOT / EX).read_text(encoding="utf-8")))


def _ln(kind: str, step: int | None = None, demo: str | None = None, who: str = "metan") -> Line:
    text = "あのだ" if who == "zundamon" else "あ"
    return Line(speaker=who, text=text, scene=Scene(kind=kind, step=step, demo=demo))  # type: ignore[arg-type]


def _script(lines: list[Line], demos: dict[str, str] | None = None) -> VideoScript:
    return VideoScript(
        title="t",
        target_seconds=60,
        result_file=EX,
        demos=demos or {},
        sections=[Section(name="s", target_seconds=60, lines=lines)],
    )


def test_result_set_picks_demo() -> None:
    main, other = _result(), _result()
    rs = ResultSet(main, {"weapon": other})
    assert rs.of(Scene(kind="talk")) is main
    assert rs.of(Scene(kind="stage", step=1, demo="weapon")) is other
    assert as_set(main).main is main and as_set(rs) is rs
    assert [k for k, _ in rs.items()] == [None, "weapon"]


def test_load_results_reads_demos() -> None:
    rs = load_results(_script([_ln("talk")], {"w": EX}))
    assert set(rs.demos) == {"w"} and len(rs.main.steps) == 3


def test_check_against_unknown_demo_and_steps() -> None:
    s = _script([_ln("stage", 1, "nope"), _ln("stage", 9, "w")], {"w": EX})
    probs = s.check_against(_result(), {"w": _result()})
    assert any("nope" in p for p in probs) and any("step 9" in p for p in probs)


def test_stage_coverage_per_demo() -> None:
    s = _script([_ln("stage", 1), _ln("stage", 2), _ln("stage", 1, "w")], {"w": EX})
    probs = stage_coverage(s, 2, {"w": 2, "flask": 1})
    assert any("'w' の" in p and "[2]" in p for p in probs)
    assert any("'flask' の stage 行が無い" in p for p in probs)
    assert stage_coverage(s, 2, {"w": 1}) == []


def test_stage_hit_counts_demo_switch() -> None:
    shown: set[tuple[str | None, int]] = {(None, 1)}
    assert ct.stage_hit(_ln("stage", 1), _ln("stage", 1, "w"), shown)
    assert not ct.stage_hit(_ln("talk"), _ln("stage", 1), shown)


def test_plan_hits_no_preroll_across_demos(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from PIL import Image

    clip = []
    for i in range(6):
        p = tmp_path / f"f{i}.png"
        Image.new("RGB", (1920, 1080), (200, 200, 200) if i >= 3 else (0, 0, 0)).save(p)
        clip.append(p)
    seen: list[Any] = []
    monkeypatch.setattr(ct, "clip_frames", lambda plan, step: (seen.append(plan), clip)[1])
    lines = [("s", _ln("stage", 0)), ("s", _ln("stage", 1, "w")), ("s", _ln("stage", 2, "w"))]
    hits = ct.plan_hits(lines, lambda sc: sc.demo or "main")
    assert not hits[1].preroll and hits[1].demo == "w"
    assert hits[2].preroll  # 同じ実演の中なら手つきを前の行で流す
    assert seen == ["w", "w"]


def test_demo_prompt_and_checks() -> None:
    from poe2tube.script.writer import demo_block, demo_files, demo_problems

    assert demo_block(None) == []
    block = demo_block({"weapon": _result()})[0]
    assert "scene.demo" in block and "### weapon" in block
    assert demo_files("x", {"weapon": _result()}) == {"weapon": "data/results/x__weapon.json"}
    s = _script(
        [_ln("stage", 1), _ln("stage", 2), _ln("stage", 3), _ln("stage", 1, "w")], {"w": EX}
    )
    probs = demo_problems(s, _result(), {"w": _result()})
    assert any("'w' の" in p for p in probs)  # w は 1 手目しか無い


def test_brief_checks_each_demo_plan() -> None:
    from poe2tube.contracts.craft_stage import CraftStagePlan
    from poe2tube.script.brief import Brief

    plan = CraftStagePlan.model_validate(
        json.loads(
            (REPO_ROOT / "contracts/examples/plan-transmute-augment-regal.json").read_text(
                encoding="utf-8"
            )
        )
    )
    good = plan.model_copy(update={"item_level": 36})
    bad = plan.model_copy(update={"item_level": 80})
    b = Brief(name="n", title_hint="t", goal="g", target_seconds=480, plan=good, demos={"w": bad})
    probs = b.problems()
    assert any(p.startswith("[w]") and "ilvl 80" in p for p in probs)
    assert not any(p.startswith("視聴者") for p in probs)
