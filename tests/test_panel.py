"""POE2Tube 側で描く図 (icons / table) と、連打・同じ前半の手を飛ばしてよい検査 (2026-10-02)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from PIL import Image

from poe2tube.config.settings import REPO_ROOT
from poe2tube.contracts.craft_stage import CraftStageResult
from poe2tube.names import icon_file, icon_path
from poe2tube.render.panel_draw import draw_icons, draw_table
from poe2tube.script.lint import stage_coverage
from poe2tube.script.model import Line, Scene, Section, VideoScript
from poe2tube.script.panel import Panel
from poe2tube.script.writer import skippable_steps

EX = "contracts/examples/result-transmute-augment-regal.json"


def _result() -> CraftStageResult:
    return CraftStageResult.model_validate(json.loads((REPO_ROOT / EX).read_text(encoding="utf-8")))


def test_panel_needs_icons_or_rows() -> None:
    assert Panel(icons=["exalt"]).key()[1] == ("exalt",)
    with pytest.raises(ValueError):
        Panel()
    with pytest.raises(ValueError):
        Panel(icons=["exalt"], rows=[["a"], ["b"]])
    with pytest.raises(ValueError):
        Panel(icons=["exalt", "regal"], names=["高貴"])
    with pytest.raises(ValueError):
        Panel(rows=[["a", "b"], ["c"]])


def test_scene_panel_only_for_icons_and_table() -> None:
    icons = Panel(icons=["exalt"])
    table = Panel(rows=[["a", "b"], ["1", "2"]])
    assert Scene(kind="icons", panel=icons).key() != Scene(kind="table", panel=table).key()
    with pytest.raises(ValueError):
        Scene(kind="icons")
    with pytest.raises(ValueError):
        Scene(kind="icons", panel=table)
    with pytest.raises(ValueError):
        Scene(kind="talk", panel=icons)


def test_icon_file_is_safe_for_essence_keys(tmp_path: Path) -> None:
    key = "essence:greater:Amulets/Essence_IncreasedLife"
    assert icon_file(key) == "essence__greater__Amulets_Essence_IncreasedLife"
    assert icon_path("exalt", tmp_path) == tmp_path / "exalt.png"


def test_draw_icons_and_table_smoke(tmp_path: Path) -> None:
    img = Image.new("RGBA", (1600, 900), (255, 255, 255, 255))
    keys = ["exalt", "regal", "transmute", "augment", "chaos", "annul", "divine", "mirror"]
    draw_icons(img, (100, 100, 1500, 800), Panel(title="見出し", icons=keys), tmp_path)
    draw_table(img, (100, 100, 1500, 800), Panel(rows=[["オーブ", "完全"], ["高貴", "50 以上"]]))
    assert img.getbbox() is not None


def _times_result(times: int) -> CraftStageResult:
    """手順の 1 手目を times 回の連打にした結果 (中身は例の結果の手を繰り返す)."""
    r = _result()
    plan = r.plan.model_copy(
        update={"steps": [r.plan.steps[0].model_copy(update={"times": times})]}
    )
    steps = [r.steps[0].model_copy(update={"index": i}) for i in range(1, times + 1)]
    return r.model_copy(update={"plan": plan, "steps": steps})


def test_skippable_repeats_and_same_prefix() -> None:
    r = _times_result(4)
    longer = _times_result(5)
    skip = skippable_steps(r, {"same": r, "longer": longer})
    assert skip[None] == {1, 2, 3}  # 最後の 1 手は見せる
    assert skip["same"] == {1, 2, 3}  # 全部メインと同じ実演は前半扱いにしない
    assert skip["longer"] == {1, 2, 3, 4}  # メインと同じ 4 手 + 連打の途中
    other = _result()
    assert skippable_steps(other, {"x": r})["x"] == {1, 2, 3}  # 前半が違う実演は連打の途中だけ


def test_stage_coverage_uses_skippable() -> None:
    lines = [Line(speaker="metan", text="あ", scene=Scene(kind="stage", step=4))]
    s = VideoScript(
        title="t",
        target_seconds=60,
        result_file=EX,
        sections=[Section(name="s", target_seconds=60, lines=lines)],
    )
    assert stage_coverage(s, 4)  # 1〜3 が無い
    assert stage_coverage(s, 4, None, {None: {1, 2, 3}}) == []


def test_floor_and_tags_only_on_their_views() -> None:
    assert (
        Scene(kind="tiers", mod="IncreasedLife", floor=50).key()
        != Scene(kind="tiers", mod="IncreasedLife").key()
    )
    assert Scene(kind="stage", step=1, tags=True).tags
    with pytest.raises(ValueError):
        Scene(kind="stage", step=1, floor=50)
    with pytest.raises(ValueError):
        Scene(kind="item", step=1, tags=True)


def test_tags_line_is_a_look_line() -> None:
    from poe2tube.video.clip_timing import stage_hit

    talk = Line(speaker="metan", text="あ", scene=Scene(kind="icons", panel=Panel(icons=["exalt"])))
    look = Line(speaker="metan", text="あ", scene=Scene(kind="stage", step=6, tags=True))
    hit = Line(speaker="metan", text="あ", scene=Scene(kind="stage", step=6))
    assert not stage_hit(talk, look)
    assert stage_hit(talk, hit)


def test_still_line_shows_without_hit() -> None:
    from poe2tube.video.clip_timing import stage_hit

    still = Line(speaker="metan", text="あ", scene=Scene(kind="stage", step=6, still=True))
    assert not stage_hit(None, still)
    with pytest.raises(ValueError):
        Scene(kind="item", step=1, still=True)


def test_short_wrap_keeps_ascii_words() -> None:
    from poe2tube.render.short_frame import wrap_text

    rows = wrap_text("まずは、エッセンスで付けた MOD が入ったアミュレット。", 14)
    assert all("M" not in r or "MOD" in r for r in rows)
