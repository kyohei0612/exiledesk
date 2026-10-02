"""サムネの土台: end_craft_materials_1 (エンドのクラフト素材 前編).

案 A (kyohei 2026-10-02「土台のサムネ見して」): 真ん中の帯に前編の 4 つの素材 (完全の高貴・
グレーターエッセンス・フラクチャーオーブ・肉体のカタリスト) をアイコン + 名前の札で並べ、右に困った
ずんだもん。地は前回 (defence_mechanics) と同じ暗い PoE2 風のぼかし。上と下は kyohei が文字を入れる。
アイコンは元が 64px なので 2 倍までにとどめる (それ以上はぼやける)。

    python scripts/thumbs/end_craft_materials_1.py [--seed N]
"""

from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path

import structlog
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from defence_mechanics import H, W, background, confused, fit  # noqa: E402

from poe2tube.names import icon_file  # noqa: E402
from poe2tube.render.palette import font  # noqa: E402

OUT = ROOT / "output" / "end_craft_materials_1_thumb_base.jpg"
ICONS = ROOT / "assets" / "icons"
# (アイコンのキー, 札の名前, 枠の色)。色は素材の見た目に合わせる
ITEMS = [
    ("exalt_perfect", "上位のオーブ", (230, 190, 110)),
    ("essence:greater:Amulets/Essence_IncreasedLife", "エッセンス", (235, 90, 90)),
    ("fracture", "フラクチャー", (200, 168, 106)),
    ("catalyst_life", "カタリスト", (230, 80, 120)),
]
# 真ん中の帯 (y 210〜520)、ずんだもんの手前 (x < 830) に 4 枚
TILE_W, TILE_H, GAP, LEFT, TOP = 182, 250, 18, 40, 225


def name_size() -> int:
    """4 枚の名前の大きさをそろえる (一番長い名前が札に収まる大きさ)."""
    d = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    size = 36
    while max(d.textlength(n, font=font(size)) for _, n, _ in ITEMS) > TILE_W - 24:
        size -= 2
    return size


def tile(key: str, name: str, color: tuple[int, int, int]) -> Image.Image:
    """暗い角丸の札に、2 倍のアイコンと名前."""
    im = Image.new("RGBA", (TILE_W + 30, TILE_H + 30), (0, 0, 0, 0))
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        (18, 20, TILE_W + 18, TILE_H + 20), 24, fill=(0, 0, 0, 170)
    )
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(8)))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle(
        (10, 10, TILE_W + 10, TILE_H + 10), 24, fill=(28, 22, 18, 235), outline=color, width=6
    )
    ic = Image.open(ICONS / f"{icon_file(key)}.png").convert("RGBA")
    ic = ic.resize((128, 128), Image.Resampling.LANCZOS)
    im.alpha_composite(ic, (10 + (TILE_W - 128) // 2, 34))
    f = font(name_size())
    d.text((10 + TILE_W // 2, 10 + TILE_H - 44), name, font=f, fill=color, anchor="mm")
    return im


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=20261002)
    ap.add_argument("--out", type=Path, default=OUT)
    a = ap.parse_args()
    canvas = background(random.Random(a.seed))
    z = confused()
    z = z.crop(z.getbbox())
    z = z.crop((0, 0, z.width, int(z.height * 0.46)))
    z = fit(z, 780, 860)
    canvas.alpha_composite(z, (W - z.width + 320, H - z.height + 60))
    for i, (key, name, color) in enumerate(ITEMS):
        canvas.alpha_composite(tile(key, name, color), (LEFT + i * (TILE_W + GAP), TOP))
    a.out.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(a.out, quality=92)
    structlog.get_logger().info("thumbnail base written", path=str(a.out))


if __name__ == "__main__":
    main()
