"""brief の設定と手順の食い違い検査."""

from __future__ import annotations

import json
from pathlib import Path

from poe2tube.script.brief import Brief

ROOT = Path(__file__).resolve().parents[1]


def _brief(**over: object) -> Brief:
    raw = json.loads((ROOT / "data/briefs/craft_intro_8min.json").read_text(encoding="utf-8"))
    raw.update(over)
    return Brief.model_validate(raw)


def test_act_stage_rejects_high_ilvl_and_endgame_currency() -> None:
    b = _brief(player_stage="act")  # 8 分 brief は ilvl 80 + chaos を含む
    problems = b.problems()
    assert any("ilvl 80" in p for p in problems)
    assert any("chaos" in p for p in problems)


def test_endgame_stage_accepts_everything() -> None:
    assert _brief(player_stage="endgame").problems() == []


def test_final_step_must_be_within_steps() -> None:
    b = _brief(player_stage="endgame", final_step=99)
    assert any("final_step" in p for p in b.problems())


def test_all_briefs_on_disk_are_consistent() -> None:
    for p in (ROOT / "data/briefs").glob("*.json"):
        b = Brief.model_validate(json.loads(p.read_text(encoding="utf-8")))
        assert b.problems() == [], f"{p.name}: {b.problems()}"
