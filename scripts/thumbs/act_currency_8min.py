"""サムネ: act_currency_8min (鞄に溜まったカレンシー、何に使う？).

案: 白地に、画面を「使う / 取っておく / 集める」の 3 色の箱に割り、それぞれにオーブを入れて見せる。
上に「そのオーブ、使っていいの？」、背面の右上に困り顔のずんだもんの顔アップ (箱で下半分を隠す)。
一目で「仕分けの動画」と分かる絵。

    python scripts/thumbs/act_currency_8min.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from poe2tube.render.draw import load_icon  # noqa: E402
from poe2tube.render.palette import font  # noqa: E402
from poe2tube.render.tachie import render_tachie  # noqa: E402
from poe2tube.render.telop_style import render_telop  # noqa: E402

W, H = 1280, 720
TOP = 275  # 箱の上端。見出しの下端より下 (文字を何にも被せない)
ICONS = ROOT / "assets" / "icons"
OUT = ROOT / "output" / "act_currency_8min_thumb.jpg"

BOXES = [
    ("使う", (214, 48, 49), ["alchemy", "artificer"]),
    ("取っておく", (33, 97, 196), ["chaos", "divine", "annul", "vaal"]),
    ("集める", (230, 126, 34), []),
]


def fit(im: Image.Image, max_w: int, max_h: int) -> Image.Image:
    k = min(max_w / im.width, max_h / im.height, 1.0)
    return im.resize((int(im.width * k), int(im.height * k)), Image.Resampling.LANCZOS)


def box_label(text: str, color: tuple[int, int, int]) -> Image.Image:
    """箱の見出し: 白い太字 + 箱の色を暗くした縁 + 影 (箱の色になじませる)."""
    dark = tuple(int(c * 0.45) for c in color)
    f = font(110)
    pad = 24
    tmp = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    x0, t, r, b = tmp.textbbox((0, 0), text, font=f, stroke_width=12)
    im = Image.new("RGBA", (r - x0 + pad * 2, b - t + pad * 2), (0, 0, 0, 0))
    shadow = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).text(
        (pad - x0 + 6, pad - t + 8),
        text,
        font=f,
        fill=(0, 0, 0, 150),
        stroke_width=12,
        stroke_fill=(0, 0, 0, 150),
    )
    im.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(4)))
    ImageDraw.Draw(im).text(
        (pad - x0, pad - t),
        text,
        font=f,
        fill=(255, 255, 255, 255),
        stroke_width=12,
        stroke_fill=(*dark, 255),
    )
    return im


def glow_icon(img: Image.Image, key: str, cx: int, cy: int, size: int) -> None:
    ic = load_icon(ICONS / f"{key}.png", size)
    halo = Image.new("RGBA", img.size, (0, 0, 0, 0))
    r = int(size * 0.62)
    ImageDraw.Draw(halo).ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 240, 180, 150))
    img.alpha_composite(halo.filter(ImageFilter.GaussianBlur(18)))
    img.alpha_composite(ic, (cx - ic.width // 2, cy - ic.height // 2))


VARIANTS = {
    # (1 行目のスタイル, [(語, スタイル, 大きさの倍率)], 傾き)
    "O": ("textstyle032", [("使っていいの？", "textstyle025", 1.0)], 0),  # 最初の形 (採用)
    "A": (
        "textstyle032",
        [("使って", "textstyle057", 1.15), ("いいの？", "textstyle099", 0.95)],
        3,
    ),
    "B": ("textstyle032", [("使って", "textstyle184", 1.1), ("いいの？", "textstyle190", 1.0)], 0),
    "C": ("textstyle154", [("使っていいの？", "textstyle013", 1.0)], 0),
}
VARIANT = sys.argv[1] if len(sys.argv) > 1 else "O"  # kyohei 2026-09-28: 見出しは最初の形


def headline(img: Image.Image, variant: str) -> None:
    """見出し 2 行。2 行目は語ごとにスタイルと大きさを変えて単調にしない."""
    first_style, words, tilt = VARIANTS[variant]
    q = fit(render_telop(first_style, "そのオーブ、", 1.3), 700, 110)
    img.alpha_composite(q, (40, 6))
    y = 6 + q.height + 4
    room = TOP - y - 8
    parts = [render_telop(st, w, 1.6 * k) for w, st, k in words]
    line = Image.new(
        "RGBA", (sum(p.width for p in parts), max(p.height for p in parts)), (0, 0, 0, 0)
    )
    x = 0
    for p_ in parts:
        line.alpha_composite(p_, (x, line.height - p_.height))  # 下そろえ
        x += p_.width - 10
    if tilt:
        line = line.rotate(tilt, expand=True, resample=Image.Resampling.BICUBIC)
    line = fit(line, 900, room)
    img.alpha_composite(line, (30, y))
    assert y + line.height <= TOP, "見出しが箱に被る"


def main() -> None:
    img = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    # 背面: 困り顔のずんだもんの顔アップ (右上、下半分は箱の後ろに隠れる)
    # 立ち絵 1200 高で頭は x 192〜576、目は y 288 あたり。見出しの右 (x 880〜) に頭を収め、
    # 目を y 190 に置く → あごから下は箱 (TOP) の後ろに隠れる
    z = render_tachie("zundamon", "troubled", 0, 1200)
    face = z.crop((0, 0, z.width, 420))
    img.alpha_composite(face, (W - 10 - 576, 190 - 288))
    d = ImageDraw.Draw(img)
    # 3 つの箱 (少し斜めの帯で「仕分け」らしく)
    cols = [(0, 430), (430, 860), (860, W)]
    for (label, color, orbs), (x0, x1) in zip(BOXES, cols, strict=True):
        poly = [(x0 + 30, TOP), (x1 + 30, TOP), (x1 - 10, H), (x0 - 10, H)]
        d.polygon(poly, fill=(*color, 255))
        d.line([(x1 + 30, TOP), (x1 - 10, H)], fill=(255, 255, 255, 255), width=14)
        tag = box_label(label, color)
        tag = fit(tag, x1 - x0 - 40, 120)
        img.alpha_composite(tag, ((x0 + x1) // 2 + 10 - tag.width // 2, TOP + 12))
        n = len(orbs)
        for i, key in enumerate(orbs):
            size = 150 if n <= 2 else 112
            per_row = 2
            row, colno = divmod(i, per_row)
            cx = (x0 + x1) // 2 + 10 + (colno - (min(n, per_row) - 1) / 2) * (size + 16)
            cy = TOP + 225 + row * (size + 14) - (40 if n > 2 else 0)
            glow_icon(img, key, int(cx), int(cy), size)
    # 集める: 変成のオーブ 1 個 +「シャード 10 個で 1 個」
    glow_icon(img, "transmute", 1085, TOP + 205, 140)
    d.text((1085, TOP + 318), "シャード 10 個で", font=font(46), fill=(255, 255, 255), anchor="mm")
    d.text((1085, TOP + 372), "オーブ 1 個", font=font(46), fill=(255, 255, 255), anchor="mm")
    headline(img, VARIANT)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out = OUT if len(sys.argv) < 3 else Path(sys.argv[2])
    img.convert("RGB").save(out, quality=92)
    print(out)


if __name__ == "__main__":
    main()
