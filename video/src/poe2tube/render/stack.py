"""積み上げ図解: 工程カードが左から順に並び、指定の工程を強調する.

工程 1 を解説 → 工程 1+2 → 完成、と並ぶ枚数が増えていく (kyohei 発案の見せ方)。
4 工程以上は古い工程を「ミニカード」(アイコン + 付いた MOD だけ) に畳み、直近 2 工程をフルで見せる。
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

from poe2tube.contracts.craft_stage import CraftStageResult, StageStep
from poe2tube.render.draw import (
    Box,
    arrow_right,
    load_icon,
    pill,
    placeholder_icon,
    shadow_panel,
    text_fit,
)
from poe2tube.render.item_card import card_height, draw_item_card
from poe2tube.render.palette import ACCENT, GOLD, GREEN, INK, LINE, MUTED, RARITY, WHITE, font

GAP = 40
ARROW = 60
HEADER_H = 190  # 工程番号 + カレンシー行の高さ (その下にアイテムカード)
FULL_MAX = 2  # フルカードで見せる直近の工程数 (4 工程以上の時)
MINI_W = 170


def draw_stack(
    img: Image.Image,
    box: Box,
    result: CraftStageResult,
    show_steps: list[int],
    focus: int | None,
    highlight: str | None,
    icon_dir: Path,
    final_step: int | None = None,
) -> None:
    """``show_steps`` の工程カードを ``box`` に並べる。``focus`` は大きく、完成の手は金縁."""
    x0, y0, x1, y1 = box
    n = len(show_steps)
    # 枚数が増えるほど隙間とミニ札を詰め、フルカードは最低 300px を確保する (6〜8 工程でも崩れない)
    arrow, gap, mini_w = (ARROW, GAP, MINI_W) if n <= 4 else (36, 16, 110)
    full = show_steps if n <= 3 else show_steps[-FULL_MAX:]
    minis = [s for s in show_steps if s not in full]
    total_gap = (arrow + gap) * (n - 1)
    full_w = min(560, (x1 - x0 - total_gap - mini_w * len(minis)) // max(1, len(full)))
    if full_w < 300 and len(full) > 1:
        full = show_steps[-1:]
        minis = [s for s in show_steps if s not in full]
        full_w = min(560, (x1 - x0 - total_gap - mini_w * len(minis)) // 1)
    full_w = max(full_w, 240)
    width = mini_w * len(minis) + full_w * len(full) + total_gap
    x = x0 + max(0, (x1 - x0 - width) // 2)
    cy = (y0 + y1) // 2
    final_index = final_step or len(result.steps)
    for i, s in enumerate(show_steps):
        step = result.steps[s - 1]
        is_focus = s == focus
        if s in minis:
            _mini_card(img, (x, cy - 150, x + mini_w, cy + 150), step, icon_dir)
            w = mini_w
        else:
            is_final = s == final_index and is_focus
            ch = HEADER_H + card_height(step.after, compact=True) + (90 if is_focus else 30)
            ch = min(ch, y1 - y0)
            top = cy - ch // 2 - (10 if is_focus else 0)
            _step_card(
                img, (x, top, x + full_w, top + ch), step, is_focus, is_final, highlight, icon_dir
            )
            w = full_w
        if i < n - 1:
            arrow_right(img, x + w + gap // 2, cy, arrow, color=MUTED)
        x += w + arrow + gap


def _mini_card(img: Image.Image, box: Box, step: StageStep, icon_dir: Path) -> None:
    """済んだ工程の小さい札: 工程番号 + アイコン + 付いた MOD (2 行まで)."""
    x0, y0, x1, y1 = box
    shadow_panel(img, box, fill=WHITE, outline=LINE, radius=22, blur=10)
    d = ImageDraw.Draw(img)
    pill(img, (x0 + 16, y0 + 14), f"工程 {step.index}", MUTED, size=20, pad=10)
    icon_path = icon_dir / f"{step.currency}.png"
    icon = (
        load_icon(icon_path, 72) if icon_path.exists() else placeholder_icon(step.currency_ja, 72)
    )
    img.alpha_composite(icon, ((x0 + x1) // 2 - 36, y0 + 60))
    text_fit(img, (x0 + 12, y0 + 140), step.currency_ja, x1 - x0 - 24, 18, MUTED)
    y = y0 + 176
    for m in step.changed.added[:2]:
        d.text((x0 + 12, y), f"+ {m.text_ja[:9]}", font=font(16), fill=GREEN)
        if len(m.text_ja) > 9:
            d.text((x0 + 26, y + 22), m.text_ja[9:18], font=font(16), fill=GREEN)
        y += 48


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
    w = x1 - x0
    outline = GOLD if final else (ACCENT if focus else LINE)
    shadow_panel(img, box, fill=WHITE, outline=outline, radius=28, blur=22 if focus else 12)
    d = ImageDraw.Draw(img)
    # 1 行目: 工程番号 (+ 完成)。2 行目: アイコン + カレンシー名 + レアリティ変化
    head = pill(img, (x0 + 24, y0 + 20), f"工程 {step.index}", ACCENT if focus else MUTED, size=26)
    if final:
        pill(
            img,
            (head[2] + 12, y0 + 20),
            "完成！",
            GOLD,
            INK,
            size=22,
            pad=12,
            max_w=x1 - head[2] - 36,
        )
    icon_size = 96 if w >= 420 else 72
    icon_path = icon_dir / f"{step.currency}.png"
    icon = (
        load_icon(icon_path, icon_size)
        if icon_path.exists()
        else placeholder_icon(step.currency_ja, icon_size)
    )
    img.alpha_composite(icon, (x0 + 24, y0 + 78))
    tx = x0 + 24 + icon_size + 20
    text_fit(img, (tx, y0 + 84), step.currency_ja, x1 - tx - 20, 34 if w >= 420 else 26, INK)
    rar = f"{_rarity_ja(step.changed.rarity_from)} → {_rarity_ja(step.changed.rarity_to)}"
    d.text((tx, y0 + 134), rar, font=font(22), fill=RARITY[step.changed.rarity_to])
    # 変化後のアイテム (compact)
    hl = {m.mod_id for m in step.changed.added} if highlight in ("added", "step") else set()
    ch = card_height(step.after, compact=True)
    card_box = (x0 + 20, y0 + HEADER_H, x1 - 20, y0 + HEADER_H + ch)
    draw_item_card(
        img, card_box, step.after, hl, highlight_name=(highlight == "name"), compact=True
    )
    if step.changed.added and focus:
        added = "、".join(m.text_ja for m in step.changed.added)
        pill(img, (x0 + 24, y1 - 62), f"+ {added}", GREEN, size=22, pad=14, max_w=w - 48)


def _rarity_ja(r: str) -> str:
    return {"normal": "白", "magic": "青", "rare": "黄"}[r]
