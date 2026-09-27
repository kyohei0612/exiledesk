"""シーンパネルの中身: stack / item / stage (仮) / cost を結果 JSON から描く."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

from poe2tube.contracts.craft_stage import CraftStageResult
from poe2tube.render.draw import load_icon, pill
from poe2tube.render.item_card import card_height, draw_item_card
from poe2tube.render.palette import ACCENT, GOLD, INK, LINE, MUTED, font
from poe2tube.render.stack import draw_stack
from poe2tube.script.model import Scene

Box = tuple[int, int, int, int]


def draw_scene_panel(
    img: Image.Image, inner: Box, scene: Scene, result: CraftStageResult, icon_dir: Path
) -> None:
    x0, y0, x1, y1 = inner
    if scene.kind == "stack":
        steps = scene.show_steps or list(range(1, (scene.step or 0) + 1))
        draw_stack(img, inner, result, steps, scene.step, scene.highlight, icon_dir)
    elif scene.kind == "item":
        item = result.steps[scene.step - 1].after if scene.step else result.steps[0].before
        hl: set[str] = set()
        if scene.highlight == "added" and scene.step:
            hl = {m.mod_id for m in result.steps[scene.step - 1].changed.added}
        ch = card_height(item)
        cw = 900
        cx = (x0 + x1) // 2 - cw // 2
        cy = (y0 + y1) // 2 - ch // 2
        draw_item_card(img, (cx, cy, cx + cw, cy + ch), item, hl, scene.highlight == "name")
    elif scene.kind == "stage":
        _stage_placeholder(img, inner, scene, result, icon_dir)
    elif scene.kind == "cost":
        _cost(img, inner, result)


def _stage_placeholder(
    img: Image.Image, box: Box, scene: Scene, result: CraftStageResult, icon_dir: Path
) -> None:
    """クラフトステージの撮影画面が来るまでの仮: 左に工程アイコン列、右に現在のアイテム."""
    x0, y0, x1, _ = box
    d = ImageDraw.Draw(img)
    pill(img, (x0, y0), "実践: クラフトステージ (仮画面)", MUTED, size=24)
    step = scene.step or 0
    item = result.steps[step - 1].after if step else result.steps[0].before
    y = y0 + 80
    for st in result.steps:
        done = st.index <= step
        icon_path = icon_dir / f"{st.currency}.png"
        if icon_path.exists():
            ic = load_icon(icon_path, 110)
            if not done:
                ic = ic.copy()
                ic.putalpha(ic.getchannel("A").point(lambda a: a // 4))
            img.alpha_composite(ic, (x0, y))
        d.text((x0 + 130, y + 30), st.currency_ja, font=font(30), fill=INK if done else MUTED)
        if st.index == step:
            pill(img, (x0 + 130, y + 72), "← いま使った", GOLD, INK, size=20, pad=10)
        y += 150
    hl = {m.mod_id for m in result.steps[step - 1].changed.added} if step else set()
    ch = card_height(item)
    draw_item_card(img, (x0 + 520, y0 + 60, x1, y0 + 60 + ch), item, hl)


def _cost(img: Image.Image, box: Box, result: CraftStageResult) -> None:
    x0, y0, x1, _ = box
    d = ImageDraw.Draw(img)
    y = y0 + 20
    for st in result.steps:
        d.text((x0 + 40, y), f"工程 {st.index}  {st.currency_ja}", font=font(36), fill=INK)
        d.text(
            (x1 - 420, y), f"{st.cost.subtotal:.2f} {result.price_unit}", font=font(36), fill=MUTED
        )
        y += 80
    d.line((x0 + 40, y, x1 - 40, y), fill=LINE, width=3)
    d.text((x0 + 40, y + 30), "合計", font=font(48), fill=INK)
    total = f"{result.total_cost:.2f} {result.price_unit}"
    d.text((x1 - 420, y + 30), total, font=font(48), fill=ACCENT)
