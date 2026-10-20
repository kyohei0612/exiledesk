"""クラフトステージ受け渡し JSON の検証."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from poe2tube.contracts.craft_stage import (
    PLAN_SCHEMA,
    CraftStagePlan,
    CraftStageResult,
    PlanStep,
    StageItem,
    StageMod,
)

EXAMPLES = Path(__file__).resolve().parents[1] / "contracts" / "examples"


def _load(name: str) -> dict[str, object]:
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))  # type: ignore[no-any-return]


def test_example_plan_validates() -> None:
    plan = CraftStagePlan.model_validate(_load("plan-transmute-augment-regal.json"))
    assert plan.schema_id == PLAN_SCHEMA
    assert [s.currency for s in plan.steps] == ["transmute", "augment", "regal"]


def test_example_result_validates_and_chains() -> None:
    result = CraftStageResult.model_validate(_load("result-transmute-augment-regal.json"))
    assert len(result.steps) == 3
    assert result.final.rarity == "rare"
    assert result.steps[-1].cost.cumulative == pytest.approx(result.total_cost)
    assert result.steps[0].before.prefixes == []


def test_plan_roundtrip_uses_schema_alias() -> None:
    plan = CraftStagePlan(base="Mnemonic Ring", seed=1, steps=[PlanStep(currency="chaos", times=3)])
    dumped = plan.model_dump(by_alias=True)
    assert dumped["schema"] == PLAN_SCHEMA
    assert CraftStagePlan.model_validate(dumped) == plan


def test_expanded_steps_unrolls_times() -> None:
    plan = CraftStagePlan(
        base="Mnemonic Ring",
        seed=1,
        steps=[PlanStep(currency="alchemy"), PlanStep(currency="chaos", times=4)],
    )
    expanded = plan.expanded_steps()
    assert [s.currency for s in expanded] == ["alchemy"] + ["chaos"] * 4
    assert all(s.times == 1 for s in expanded)


@pytest.mark.parametrize(
    "key", ["transmute_perfect", "desecrate_ancient", "essence:breach", "catalyst_life"]
)
def test_currency_keys_accepted(key: str) -> None:
    assert PlanStep(currency=key).currency == key


@pytest.mark.parametrize("key", ["transmutation", "Chaos", "essence", "bone_jaw"])
def test_currency_keys_rejected(key: str) -> None:
    with pytest.raises(ValidationError):
        PlanStep(currency=key)


def test_plan_rejects_unknown_field_and_wrong_schema() -> None:
    with pytest.raises(ValidationError):
        CraftStagePlan.model_validate(
            {
                "schema": PLAN_SCHEMA,
                "base": "x",
                "seed": 0,
                "steps": [{"currency": "chaos"}],
                "extra": 1,
            }
        )
    with pytest.raises(ValidationError):
        CraftStagePlan.model_validate(
            {
                "schema": "craft-stage-plan/2",
                "base": "x",
                "seed": 0,
                "steps": [{"currency": "chaos"}],
            }
        )


def _mod(side: str = "prefix") -> StageMod:
    return StageMod(
        mod_id="m", family="F", side=side, tier_name="T1", mod_level=1, text_ja="x", text_en="x"  # type: ignore[arg-type]
    )


def test_item_rejects_mod_on_wrong_side() -> None:
    with pytest.raises(ValidationError):
        StageItem(name="n", base="b", item_level=80, rarity="magic", prefixes=[_mod("suffix")])


def test_result_rejects_broken_chain() -> None:
    raw = _load("result-transmute-augment-regal.json")
    steps = raw["steps"]
    assert isinstance(steps, list)
    steps[1]["before"]["rarity"] = "rare"  # step1.after と食い違わせる
    with pytest.raises(ValidationError, match="before"):
        CraftStageResult.model_validate(raw)


def test_result_rejects_step_count_mismatch() -> None:
    raw = _load("result-transmute-augment-regal.json")
    plan = raw["plan"]
    assert isinstance(plan, dict)
    plan["steps"][0]["times"] = 2
    with pytest.raises(ValidationError, match="展開数"):
        CraftStageResult.model_validate(raw)


def test_result_ignores_extra_keys_from_newer_exiledesk() -> None:
    raw = _load("result-transmute-augment-regal.json")
    raw["future_field"] = {"anything": True}
    steps = raw["steps"]
    assert isinstance(steps, list)
    steps[0]["after"]["implicit_ja"] = "将来の implicit 欄"
    CraftStageResult.model_validate(raw)
