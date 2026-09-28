"""サムネ: act_currency_8min (鞄に溜まったカレンシー、何に使う？).

案: 白地に、画面を「使う / 取っておく / 集める」の 3 色の箱に割り、それぞれにオーブを入れて見せる。
上に「そのオーブ、使っていいの？」、右下に困り顔のずんだもん。一目で「仕分けの動画」と分かる絵。

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


def glow_icon(img: Image.Image, key: str, cx: int, cy: int, size: int) -> None:
    ic = load_icon(ICONS / f"{key}.png", size)
    halo = Image.new("RGBA", img.size, (0, 0, 0, 0))
    r = int(size * 0.62)
    ImageDraw.Draw(halo).ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 240, 180, 150))
    img.alpha_composite(halo.filter(ImageFilter.GaussianBlur(18)))
    img.alpha_composite(ic, (cx - ic.width // 2, cy - ic.height // 2))


def main() -> None:
    img = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    d = ImageDraw.Draw(img)
    # 3 つの箱 (少し斜めの帯で「仕分け」らしく)
    cols = [(0, 430), (430, 860), (860, W)]
    for (label, color, orbs), (x0, x1) in zip(BOXES, cols, strict=True):
        poly = [(x0 + 30, TOP), (x1 + 30, TOP), (x1 - 10, H), (x0 - 10, H)]
        d.polygon(poly, fill=(*color, 255))
        d.line([(x1 + 30, TOP), (x1 - 10, H)], fill=(255, 255, 255, 255), width=14)
        tag = render_telop("textstyle025", label, 0.9)
        tag = fit(tag, x1 - x0 - 40, 120)
        img.alpha_composite(tag, ((x0 + x1) // 2 + 10 - tag.width // 2, TOP + 10))
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
    # 上: 問いかけ
    q = fit(render_telop("textstyle032", "そのオーブ、", 1.3), 700, 110)
    img.alpha_composite(q, (40, 4))
    y = 4 + q.height + 4  # 1 行目の下に隙間を空ける (文字同士も被せない)
    big = fit(render_telop("textstyle025", "使っていいの？", 1.6), 900, TOP - y - 6)
    img.alpha_composite(big, (40, y))
    assert y + big.height <= TOP, "見出しが箱に被る"
    # 右上: 困り顔のずんだもん (見出しの右、箱の上)
    z = render_tachie("zundamon", "troubled", 0, 300)
    img.alpha_composite(z, (W - z.width - 20, -30))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(OUT, quality=92)
    print(OUT)


if __name__ == "__main__":
    main()
