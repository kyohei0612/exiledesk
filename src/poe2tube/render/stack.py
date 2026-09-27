"""積み上げ図解: 工程カードが左から順に並び、指定の工程を強調する.

工程 1 を解説 → 工程 1+2 → 完成、と並ぶ枚数が増えていく (kyohei 発案の見せ方)。
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

from poe2tube.contracts.craft_stage import CraftStageResult, StageStep
from poe2tube.render.draw import Box, arrow_right, load_icon, pill, placeholder_icon, shadow_panel
from poe2tube.render.item_card import card_height, draw_item_card
from poe2tube.render.palette import ACCENT, GOLD, INK, MUTED, RARITY, WHITE, font

GAP = 48
ARROW = 70
HEADER_H = 190  # 工程番号 + カレンシー行の高さ (その下にアイテムカード)


def draw_stack(
    img: Image.Image,
    box: Box,
    result: CraftStageResult,
    show_steps: list[int],
    focus: int | None,
    highlight: str | None,
    icon_dir: Path,
) -> None:
    """``show_steps`` の工程カードを ``box`` に並べる。``focus`` は大きく、最後 (完成) は金縁."""
    x0, y0, x1, y1 = box
    n = len(show_steps)
    total_arrows = ARROW * (n - 1)
    card_w = min(560, (x1 - x0 - total_arrows - GAP * (n - 1)) // n)
    x = x0 + (x1 - x0 - (card_w * n + (ARROW + GAP) * (n - 1))) // 2
    final_index = len(result.steps)
    cy = (y0 + y1) // 2
    for i, s in enumerate(show_steps):
        step = result.steps[s - 1]
        is_focus = s == focus
        is_final = s == final_index and is_focus
        # 中身に合わせた高さで上下中央に置く。強調カードは少し大きく
        ch = HEADER_H + card_height(step.after, compact=True) + (90 if is_focus else 30)
        ch = min(ch, y1 - y0)
        top = cy - ch // 2 - (10 if is_focus else 0)
        box_i = (x, top, x + card_w, top + ch)
        _step_card(img, box_i, step, is_focus, is_final, highlight, icon_dir)
        if i < n - 1:
            arrow_right(img, x + card_w + GAP // 2, cy, ARROW, color=MUTED)
        x += card_w + ARROW + GAP


def _step_card(
    img: Image.Image,
    box: Box,
    step: StageStep,
    focus: bool,
    final: bool,
    highlight: str | None,
    icon_dir: Path,
) -> None:
    x0, y0, x1, y1 = box
    outline = GOLD if final else (ACCENT if focus else (214, 219, 226))
    shadow_panel(img, box, fill=WHITE, outline=outline, radius=28, blur=22 if focus else 12)
    d = ImageDraw.Draw(img)
    # 工程番号 + カレンシー
    pill(img, (x0 + 24, y0 + 20), f"工程 {step.index}", ACCENT if focus else MUTED, size=26)
    icon_path = icon_dir / f"{step.currency}.png"
    icon = (
        load_icon(icon_path, 96) if icon_path.exists() else placeholder_icon(step.currency_ja, 96)
    )
    img.alpha_composite(icon, (x0 + 24, y0 + 78))
    d.text((x0 + 140, y0 + 88), step.currency_ja, font=font(34), fill=INK)
    rar = f"{_rarity_ja(step.changed.rarity_from)} → {_rarity_ja(step.changed.rarity_to)}"
    d.text((x0 + 140, y0 + 134), rar, font=font(24), fill=RARITY[step.changed.rarity_to])
    if final:
        pill(img, (x1 - 150, y0 + 20), "完成！", GOLD, INK, size=26)
    # 変化後のアイテム (compact)
    hl = {m.mod_id for m in step.changed.added} if highlight in ("added", "step") else set()
    ch = card_height(step.after, compact=True)
    card_box = (x0 + 20, y0 + HEADER_H, x1 - 20, y0 + HEADER_H + ch)
    draw_item_card(
        img, card_box, step.after, hl, highlight_name=(highlight == "name"), compact=True
    )
    if step.changed.added and focus:
        added = "、".join(m.text_ja for m in step.changed.added)
        pill(img, (x0 + 24, y1 - 62), f"+ {added}", (46, 160, 67), size=22, pad=14)


def _rarity_ja(r: str) -> str:
    return {"normal": "白", "magic": "青", "rare": "黄"}[r]
