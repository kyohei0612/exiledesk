"""アイテムカード: 結果 JSON の StageItem をゲーム風に 1 枚描く (白背景向け)."""

from __future__ import annotations

from PIL import Image, ImageDraw

from poe2tube.contracts.craft_stage import StageItem, StageMod
from poe2tube.render.draw import Box, pill, shadow_panel, text_fit
from poe2tube.render.palette import (
    GOLD_SOFT,
    INK,
    LINE,
    MUTED,
    RARITY,
    RARITY_JA,
    RARITY_SOFT,
    WHITE,
    font,
)

LINE_H = 54


HEAD_H = {True: 84, False: 100}
ROW_H = {True: 44, False: LINE_H}
# これより長い MOD 文は 2 行に折る (compact = 幅 300px 前後のカード想定)
WRAP_CHARS = {True: 13, False: 24}


def _rows_of(m: StageMod, compact: bool) -> int:
    return 2 if len(m.text_ja) > WRAP_CHARS[compact] else 1


def card_height(item: StageItem, compact: bool = False) -> int:
    mods = [*item.prefixes, *item.suffixes]
    rows = sum(_rows_of(m, compact) for m in mods) or 1
    return HEAD_H[compact] + 22 + rows * ROW_H[compact] + 20


def draw_item_card(
    img: Image.Image,
    box: Box,
    item: StageItem,
    highlight_ids: set[str] | None = None,
    highlight_name: bool = False,
    compact: bool = False,
) -> None:
    """``box`` の中にカードを描く。``highlight_ids`` の MOD 行を黄色く光らせる."""
    hl = highlight_ids or set()
    x0, y0, x1, y1 = box
    color = RARITY[item.rarity]
    shadow_panel(img, box, fill=WHITE, outline=color, radius=20)
    d = ImageDraw.Draw(img)
    # 見出し帯 (レアリティ色): 1 行目 = 名前 + レアリティピル、2 行目 = ベース名と ilvl
    head_h = HEAD_H[compact]
    d.rounded_rectangle((x0, y0, x1, y0 + head_h + 20), 20, fill=RARITY_SOFT[item.rarity])
    d.rectangle((x0, y0 + head_h, x1, y0 + head_h + 2), fill=color)
    # compact ではレアリティピルを 2 行目の右に置いて、名前に幅を全部使わせる
    pill_y = y0 + (48 if compact else 12)
    rar_box = pill(
        img,
        (x1 - 24 - (120 if compact else 175), pill_y),
        RARITY_JA[item.rarity],
        color,
        size=14 if compact else 20,
        pad=8 if compact else 10,
    )
    name_w = (x1 - x0 - 48) if compact else (rar_box[0] - x0 - 40)
    if highlight_name:
        nx = (x1 - 24 - 80) if compact else (rar_box[0] - 90)
        new_box = pill(img, (nx, y0 + 12), "NEW", GOLD_SOFT, INK, size=16, pad=10)
        name_w = new_box[0] - x0 - 40
    text_fit(img, (x0 + 24, y0 + 8), item.name, name_w, 26 if compact else 40, INK)
    # compact ではベース名が名前と同じことが多いので ilvl だけ (ピルと被らない)
    sub = (
        f"ilvl {item.item_level}"
        if compact
        else f"{item.base_ja or item.base}　ilvl {item.item_level}"
    )
    sub_w = (rar_box[0] - x0 - 36) if compact else (x1 - x0 - 48)
    text_fit(img, (x0 + 24, y0 + (50 if compact else 60)), sub, sub_w, 18 if compact else 24, MUTED)

    y = y0 + head_h + 22
    if not item.prefixes and not item.suffixes:
        d.text((x0 + 24, y + 8), "MOD なし", font=font(28 if not compact else 22), fill=MUTED)
        return
    for side, mods in (("接頭", item.prefixes), ("接尾", item.suffixes)):
        for m in mods:
            y = _mod_row(img, (x0, y, x1), m, side, m.mod_id in hl, compact)
    d.line((x0 + 16, y1 - 1, x1 - 16, y1 - 1), fill=LINE, width=1)


def _mod_row(
    img: Image.Image, xs: tuple[int, int, int], m: StageMod, side: str, hot: bool, compact: bool
) -> int:
    x0, y, x1 = xs
    d = ImageDraw.Draw(img)
    rows = _rows_of(m, compact)
    h = ROW_H[compact] * rows
    if hot:
        d.rounded_rectangle((x0 + 12, y - 4, x1 - 12, y + h - 6), 12, fill=GOLD_SOFT)
    side_col = (72, 104, 255) if side == "接頭" else (222, 120, 0)
    label = m.tier_name if compact else f"{side} {m.tier_name}"
    box = pill(img, (x0 + 20, y + 4), label, side_col, size=16 if compact else 20, pad=8)
    tx = box[2] + 14
    size = 24 if compact else 32
    lines = _wrap(m.text_ja, WRAP_CHARS[compact]) if rows == 2 else [m.text_ja]
    for i, text in enumerate(lines):
        ty = y + (4 if compact else 6) + i * (ROW_H[compact] - 8)
        text_fit(img, (tx, ty), text, x1 - tx - 20, size)
    return y + h


def _wrap(text: str, at: int) -> list[str]:
    """日本語の MOD 文を 2 行に。中央に近い助詞の直後で切る (両行 ``at`` 字以内を優先)."""
    half = len(text) // 2
    candidates = [
        k
        for k in range(max(1, half - 5), min(len(text) - 1, half + 5))
        if text[k - 1] in "がのをにで、" and k <= at and len(text) - k <= at
    ]
    if candidates:
        k = min(candidates, key=lambda c: abs(c - half))
        return [text[:k], text[k:]]
    return [text[:half], text[half:]]
