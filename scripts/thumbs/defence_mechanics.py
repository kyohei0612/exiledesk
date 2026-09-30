"""サムネ: defence_mechanics (防御の仕組み).

案 A (kyohei 2026-09-30): 右に大きなずんだもん (困った顔)、左に「アーマー / 回避 / 受け流し / ES / ブロック」
の札が散らばって周りに「？」。背景は白だと寂しいので、暗い PoE2 風の地にカレンシーと防具を
ランダムに並べてからぼかす (ダークでもぼかしているので主役が立つ)。

    python scripts/thumbs/defence_mechanics.py [--seed N]
"""

from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path

import structlog
from PIL import Image, ImageDraw, ImageFilter
from psd_tools import PSDImage

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from poe2tube.config.settings import get_settings  # noqa: E402
from poe2tube.render.palette import font  # noqa: E402
from poe2tube.render.tachie import ZUNDAMON, _apply, _find_group  # noqa: E402

W, H = 1280, 720
OUT = ROOT / "output" / "defence_mechanics_thumb.jpg"
CACHE = ROOT / "cache" / "thumb" / "zundamon_confused.png"
ICONS = ROOT / "assets" / "icons"
ART = get_settings().exiledesk_root / "public" / "base-art"

CONFUSED = [
    ("!右腕", "*基本"),
    ("!左腕", "*あごに指"),
    ("!顔色", "*青ざめ"),
    ("!枝豆", "*枝豆立ち片折れ"),
    ("!眉", "*困り眉"),
    ("!目", "*〇〇"),
    ("!口", "*うへえ"),
]
# 札: (文字, 色)。色は ExileDesk の防御の画面に合わせる
CARDS = [
    ("アーマー", (224, 160, 96)),
    ("回避力", (127, 214, 127)),
    ("受け流し", (240, 200, 90)),
    ("ES", (111, 184, 255)),
    ("ブロック", (190, 190, 205)),
]
# 札の置き場所 (中心 x, 中心 y, 回転)。上と下は kyohei が文字を入れるので、真ん中の帯 (y 210〜520)
# に、ずんだもんの手前 (x < 830) でまばらに置く (kyohei 2026-09-30)
SLOTS = [(175, 250, -6), (505, 235, 5), (705, 335, 6), (255, 440, 4), (560, 450, -5)]
QMARKS = [(55, 355, 90, -15), (395, 340, 80, 10), (790, 470, 90, 12)]


def confused() -> Image.Image:
    """困ったずんだもん (全身、透明背景)。PSD の合成は重いのでキャッシュ."""
    if CACHE.exists():
        return Image.open(CACHE).convert("RGBA")
    psd = PSDImage.open(ZUNDAMON.psd)
    _apply(psd, CONFUSED)
    marks = _find_group(psd, "!記号など")
    marks.visible = True
    for layer in marks:
        layer.visible = layer.name == "汗多め"
    img = psd.composite(force=True).convert("RGBA")
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    img.save(CACHE)
    return img


def fit(im: Image.Image, max_w: int, max_h: int) -> Image.Image:
    k = min(max_w / im.width, max_h / im.height)
    return im.resize((int(im.width * k), int(im.height * k)), Image.Resampling.LANCZOS)


def background(rng: random.Random) -> Image.Image:
    """暗い PoE2 風の地 + カレンシーと防具をランダムに散らして、ぼかす."""
    bg = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    d = ImageDraw.Draw(bg)
    for y in range(H):  # 上が少し明るい焦げ茶 → 下が黒
        t = y / H
        d.line([(0, y), (W, y)], fill=(int(78 - 50 * t), int(56 - 36 * t), int(38 - 26 * t)))
    pool = sorted(ICONS.glob("*.png")) + sorted(ART.glob("Armours_BodyArmours_*.webp"))[:12]
    for _ in range(55):
        p = rng.choice(pool)
        size = rng.randint(70, 150)
        im = fit(Image.open(p).convert("RGBA"), size, size)
        im = im.rotate(rng.uniform(-35, 35), expand=True, resample=Image.Resampling.BICUBIC)
        bg.alpha_composite(im, (rng.randint(-40, W - 40), rng.randint(-40, H - 40)))
    bg = bg.filter(ImageFilter.GaussianBlur(6))
    bg.alpha_composite(Image.new("RGBA", (W, H), (10, 6, 4, 40)))  # 少し沈める
    return bg


def card(text: str, color: tuple[int, int, int]) -> Image.Image:
    """防御の名前の札 (暗い地に色の枠、白い大きな文字)."""
    f = font(52)
    tw = int(ImageDraw.Draw(Image.new("RGBA", (1, 1))).textlength(text, font=f))
    w, h = tw + 56, 92
    im = Image.new("RGBA", (w + 30, h + 30), (0, 0, 0, 0))
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((18, 20, w + 18, h + 20), 22, fill=(0, 0, 0, 170))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(8)))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((10, 10, w + 10, h + 10), 22, fill=(28, 22, 18, 235), outline=color, width=7)
    d.text((10 + w // 2, 10 + h // 2), text, font=f, fill=color, anchor="mm")
    return im


def qmark(size: int) -> Image.Image:
    f = font(size)
    im = Image.new("RGBA", (size * 2, size * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.text((size, size), "？", font=f, fill=(255, 255, 255), anchor="mm",
           stroke_width=max(3, size // 12), stroke_fill=(30, 20, 15))
    return im


def paste_center(canvas: Image.Image, im: Image.Image, cx: int, cy: int, rot: float) -> None:
    im = im.rotate(rot, expand=True, resample=Image.Resampling.BICUBIC)
    canvas.alpha_composite(im, (cx - im.width // 2, cy - im.height // 2))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=20260930)
    ap.add_argument("--out", type=Path, default=OUT)
    a = ap.parse_args()
    rng = random.Random(a.seed)
    canvas = background(rng)
    z = confused()
    z = z.crop(z.getbbox())
    z = z.crop((0, 0, z.width, int(z.height * 0.46)))  # 肩から上を大きく (kyohei 2026-09-30)
    z = fit(z, 780, 860)
    canvas.alpha_composite(z, (W - z.width + 320, H - z.height + 60))
    for (text, color), (cx, cy, rot) in zip(CARDS, SLOTS):
        paste_center(canvas, card(text, color), cx, cy, rot)
    for cx, cy, size, rot in QMARKS:
        paste_center(canvas, qmark(size), cx, cy, rot)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(a.out, quality=92)
    structlog.get_logger().info("thumbnail written", path=str(a.out))


if __name__ == "__main__":
    main()
