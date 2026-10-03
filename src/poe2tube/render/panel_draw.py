"""POE2Tube 側で描く図 (``scene.panel``): アイコンの並び (icons) と表 (table).

ExileDesk に頼まない軽い図。白背景に影付きのカード / 表で、ほかの図解と見た目をそろえる。
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw

from poe2tube.names import NameBook, icon_path
from poe2tube.render.draw import load_icon, placeholder_icon, shadow_panel
from poe2tube.render.palette import GOLD_SOFT, INK, LINE, PANEL, WHITE, font
from poe2tube.script.panel import Panel

Box = tuple[int, int, int, int]
PER_ROW = 6
TITLE_H = 90


@lru_cache(maxsize=1)
def _names() -> NameBook:
    return NameBook.load()


def _title(img: Image.Image, box: Box, title: str | None) -> int:
    """見出しを描いて、中身の上端を返す."""
    x0, y0, x1, _ = box
    if not title:
        return y0
    ImageDraw.Draw(img).text(((x0 + x1) // 2, y0 + 10), title, font=font(56), fill=INK, anchor="ma")
    return y0 + TITLE_H


def draw_icons(img: Image.Image, box: Box, panel: Panel, icon_dir: Path) -> None:
    """アイコン + 公式名のカードを 1〜2 行に並べる (6 個で折り返す)."""
    keys = panel.icons or []
    x0, _, x1, y1 = box
    top = _title(img, box, panel.title)
    rows = [keys[i : i + PER_ROW] for i in range(0, len(keys), PER_ROW)]
    gap = 28
    per = min(PER_ROW, len(keys))
    cw = min(300, (x1 - x0 - gap * (per - 1)) // per)
    ch = min((y1 - top - gap * (len(rows) - 1)) // len(rows), int(cw * 1.3))
    oy = top + (y1 - top - (ch * len(rows) + gap * (len(rows) - 1))) // 2
    d = ImageDraw.Draw(img)
    names = panel.names or [_names().ja(k) for k in keys]
    fs = 34  # 1 枚の図の中では名前の大きさをそろえる (長い名前に合わせる)
    while fs > 18 and max(d.textlength(n, font=font(fs)) for n in names) > cw - 20:
        fs -= 2
    for r, row in enumerate(rows):
        ox = (x0 + x1) // 2 - (cw * len(row) + gap * (len(row) - 1)) // 2
        for c, key in enumerate(row):
            i = r * PER_ROW + c
            cx, cy = ox + c * (cw + gap), oy + r * (ch + gap)
            shadow_panel(img, (cx, cy, cx + cw, cy + ch), fill=WHITE, outline=LINE, radius=24)
            name = names[i]
            size = int(min(cw, ch) * 0.56)
            path = icon_path(key, icon_dir)
            ic = load_icon(path, size) if path.exists() else placeholder_icon(name, size)
            img.alpha_composite(ic, (cx + (cw - ic.width) // 2, cy + 20))
            d.text((cx + cw // 2, cy + 36 + size), name, font=font(fs), fill=INK, anchor="ma")


def draw_table(img: Image.Image, box: Box, panel: Panel) -> None:
    """表: 1 行目は見出し (色付き)。列の幅は中身の長さに合わせ、行が多ければ字を小さくする."""
    rows = panel.rows or []
    x0, _, x1, y1 = box
    top = _title(img, box, panel.title)
    n_col = len(rows[0])
    longest = [max(len(r[c]) for r in rows) for c in range(n_col)]
    tw = min(x1 - x0, max(360 * n_col, sum(longest) * 40))
    rh = min(110, (y1 - top) // len(rows))
    tx = (x0 + x1) // 2 - tw // 2
    ty = top + (y1 - top - rh * len(rows)) // 2
    shadow_panel(img, (tx, ty, tx + tw, ty + rh * len(rows)), fill=WHITE, outline=LINE, radius=20)
    d = ImageDraw.Draw(img)
    weight = [max(n, 3) + 2 for n in longest]  # 短い列 (「サフィ」等) にも余白を
    widths = [tw * w // sum(weight) for w in weight]
    lefts = [tx + sum(widths[:c]) for c in range(n_col)]
    base = min(46, int(rh * 0.5))  # 行が多い表 (勢力の MOD の一覧など) は字を小さく
    fs = base  # 本文は表の中で同じ大きさにそろえる (一番きつい列に合わせる)
    while fs > 16 and any(
        d.textlength(r[c], font=font(fs)) > widths[c] - 24 for r in rows[1:] for c in range(n_col)
    ):
        fs -= 2
    for r, row in enumerate(rows):
        ry = ty + r * rh
        if r == 0:
            d.rounded_rectangle((tx, ry, tx + tw, ry + rh), 20, fill=GOLD_SOFT)
        elif r % 2 == 0:
            d.rectangle((tx + 2, ry, tx + tw - 2, ry + rh), fill=PANEL)
        for c, cell in enumerate(row):
            size = fs
            if r == 0:
                size = base
                while size > 16 and d.textlength(cell, font=font(size)) > widths[c] - 24:
                    size -= 2
            d.text(
                (lefts[c] + widths[c] // 2, ry + rh // 2),
                cell,
                font=font(size),
                fill=INK,
                anchor="mm",
            )
        if r:
            d.line((tx + 10, ry, tx + tw - 10, ry), fill=LINE, width=2)
