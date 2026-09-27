"""描画のスモーク: 例外なく 1920x1080 が出て、白一色ではない."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from PIL import Image

from poe2tube.contracts.craft_stage import CraftStageResult
from poe2tube.render.item_card import card_height, draw_item_card
from poe2tube.render.stack import draw_stack
from poe2tube.render.tachie import SPECS
from poe2tube.script.model import Line, Scene, VideoScript

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def result() -> CraftStageResult:
    p = ROOT / "contracts/examples/result-transmute-augment-regal.json"
    return CraftStageResult.model_validate(json.loads(p.read_text(encoding="utf-8")))


def _ink_ratio(img: Image.Image) -> float:
    g = img.convert("L").resize((192, 108))
    dark = sum(1 for v in g.getdata() if v < 235)
    return dark / (192 * 108)


def test_item_card_draws_mods_and_highlight(result: CraftStageResult) -> None:
    img = Image.new("RGBA", (1000, 600), (255, 255, 255, 255))
    item = result.final
    h = card_height(item)
    draw_item_card(img, (50, 50, 950, 50 + h), item, {"cold_res_ring_t6"}, highlight_name=True)
    assert _ink_ratio(img) > 0.05


def test_stack_draws_three_steps(result: CraftStageResult) -> None:
    img = Image.new("RGBA", (1600, 700), (255, 255, 255, 255))
    draw_stack(img, (20, 20, 1580, 680), result, [1, 2, 3], 3, "rarity", ROOT / "assets/icons")
    assert _ink_ratio(img) > 0.08


def test_full_frames_for_each_scene_kind(result: CraftStageResult) -> None:
    if not all(spec.psd.exists() for spec in SPECS.values()):
        pytest.skip("立ち絵 PSD が無い環境")
    from poe2tube.render.frame import render_frame

    kinds = [
        Scene(kind="talk"),
        Scene(kind="stack", step=2, show_steps=[1, 2], highlight="added"),
        Scene(kind="item", step=3, highlight="name"),
        Scene(kind="stage", step=1, highlight="added"),
        Scene(kind="cost"),
    ]
    for sc in kinds:
        ln = Line(speaker="metan", text="テストなのだ。", emotion="happy", scene=sc)
        img = render_frame(ln, result, "検証", 0.5, mouth=1, props=["transmute"])
        assert img.size == (1920, 1080)
        assert _ink_ratio(img) > 0.03, sc.kind


def test_draft_script_renders_without_check_problems(result: CraftStageResult) -> None:
    p = ROOT / "data/scripts/test_1min_craft_intro.json"
    script = VideoScript.model_validate(json.loads(p.read_text(encoding="utf-8")))
    assert script.check_against(result) == []
