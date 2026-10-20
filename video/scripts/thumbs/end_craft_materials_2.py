"""サムネの土台: end_craft_materials_2 (エンドのクラフト素材 後編: お告げと骨).

kyohei 2026-10-04「同じような感じやな、頭かかえさそう」「全く別のアプローチで 3 パターン、
文字入れはやる」。上と下 (と C の真ん中) は文字のために空けておく。

- a: お告げの洪水 — 頭を抱えたずんだもんの周りに、お告げ 20 種と骨が渦を巻いて降ってくる
- b: 実画面 — ExileDesk の発現 (カーソルで候補を選ぶ瞬間) を大きく、右に指差すめたん
- c: 骨 vs お告げ — 斜めに割って左に骨 3 つ、右にお告げ、下に 2 人

    python scripts/thumbs/end_craft_materials_2.py [--variant a|b|c|all]
"""

from __future__ import annotations

import argparse
import math
import random
import sys
from pathlib import Path

import structlog
from PIL import Image, ImageDraw, ImageFilter
from psd_tools import PSDImage

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from defence_mechanics import H, W, background, fit  # noqa: E402

from poe2tube.render.tachie import METAN, ZUNDAMON, _apply, _find_group  # noqa: E402

ICONS = ROOT / "assets" / "icons"
CACHE = ROOT / "cache" / "thumb"
OMENS = sorted(p.stem for p in ICONS.glob("Omen*.png"))
BONES = ["rib", "collarbone", "jawbone"]
# 発現の撮影 (リリース版 v0.1.362、本編 step 3): カーソルが候補に乗って光ったコマ
PICK_SHOT = ROOT / "cache" / "stage" / "334bd19533f923df" / "step_3_clip" / "f058.png"
HOLD = [
    ("!右腕", "*手を挙げる"),
    ("!左腕", "*手を挙げる"),
    ("!顔色", "*青ざめ"),
    ("!枝豆", "*枝豆萎え"),
    ("!眉", "*困り眉"),
    ("!目", "*><"),
    ("!口", "*うわー"),
]


def _layer_image(psd: PSDImage, group: str, name: str) -> Image.Image:
    lay = next(x for x in _find_group(psd, group) if x.name == name)
    im = Image.new("RGBA", psd.size)
    if (c := lay.composite()) is not None:
        im.alpha_composite(c.convert("RGBA"), (lay.left, lay.top))
    return im


def zundamon_hold() -> Image.Image:
    """頭を抱えたずんだもん。PSD に無い形。挙げた腕を回して頭の後ろへ、手のひらは髪の上."""
    path = CACHE / "zundamon_hold.png"
    if path.exists():
        return Image.open(path).convert("RGBA")
    psd = PSDImage.open(ZUNDAMON.psd)
    _apply(psd, HOLD)
    marks = _find_group(psd, "!記号など")
    marks.visible = True
    for layer in marks:
        layer.visible = layer.name in ("汗多め", "涙")
    arms = {g: _layer_image(psd, g, "*手を挙げる") for g in ("!右腕", "!左腕")}
    for g in arms:
        _find_group(psd, g).visible = False
    body = psd.composite(force=True).convert("RGBA")
    bic = Image.Resampling.BICUBIC
    r = arms["!右腕"].rotate(-20, center=(430, 700), resample=bic)
    r = r.transform(body.size, Image.Transform.AFFINE, (1, 0, -55, 0, 1, 30))
    left = arms["!左腕"].rotate(20, center=(600, 690), resample=bic)
    left = left.transform(body.size, Image.Transform.AFFINE, (1, 0, 55, 0, 1, 30))
    out = Image.new("RGBA", body.size)
    for a in (r, left, body):
        out.alpha_composite(a)
    for a in (r, left):  # 手のひら (腕の上の端から 110px) は髪の上
        bb = a.getbbox()
        if bb:
            out.alpha_composite(a.crop((0, 0, a.width, bb[1] + 110)))
    out = out.crop(out.getbbox())
    CACHE.mkdir(parents=True, exist_ok=True)
    out.save(path)
    return out


def metan_point() -> Image.Image:
    """指差すめたん (得意げ)."""
    path = CACHE / "metan_point.png"
    if path.exists():
        return Image.open(path).convert("RGBA")
    psd = PSDImage.open(METAN.psd)
    _apply(psd, [*METAN.fixed, ("!右腕", "*指差す"), *METAN.emotions["proud"], ("!口", "*わあー")])
    im = psd.composite(force=True).convert("RGBA")
    im = im.crop(im.getbbox())
    CACHE.mkdir(parents=True, exist_ok=True)
    im.save(path)
    return im


def bust(im: Image.Image, ratio: float) -> Image.Image:
    return im.crop((0, 0, im.width, int(im.height * ratio)))


def icon(key: str, size: int, rot: float = 0.0) -> Image.Image:
    im = fit(Image.open(ICONS / f"{key}.png").convert("RGBA"), size, size)
    return im.rotate(rot, expand=True, resample=Image.Resampling.BICUBIC) if rot else im


def glow(im: Image.Image, color: tuple[int, int, int], radius: int = 18) -> Image.Image:
    """絵の形の後ろに色の光."""
    pad = radius * 2
    out = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2))
    halo = Image.new("RGBA", out.size, (*color, 0))
    halo.putalpha(Image.new("L", out.size, 0))
    mask = Image.new("L", out.size, 0)
    mask.paste(im.getchannel("A"), (pad, pad))
    halo = Image.new("RGBA", out.size, (*color, 255))
    halo.putalpha(mask.filter(ImageFilter.GaussianBlur(radius)))
    out.alpha_composite(halo)
    out.alpha_composite(halo)
    out.alpha_composite(im, (pad, pad))
    return out


def variant_a(rng: random.Random) -> Image.Image:
    """お告げの洪水: 頭の周りを渦巻くお告げと骨."""
    canvas = background(rng)
    canvas.alpha_composite(Image.new("RGBA", (W, H), (40, 10, 60, 70)))  # 紫に寄せる
    z = fit(bust(zundamon_hold(), 0.5), 640, 640)
    zx, zy = (W - z.width) // 2 + 150, H - z.height + 10
    cx, cy = zx + z.width // 2, zy + z.height * 0.3
    keys = OMENS + BONES
    rng.shuffle(keys)
    back, front = [], []
    for i, key in enumerate(keys):
        ang = i / len(keys) * math.tau + rng.uniform(-0.15, 0.15)
        rad = rng.uniform(260, 470)
        x, y = cx + math.cos(ang) * rad * 1.35, cy + math.sin(ang) * rad * 0.8
        size = rng.randint(80, 150)
        im = glow(icon(key, size, rng.uniform(-30, 30)), (190, 120, 255), 10)
        (front if size > 120 else back).append((im, int(x - im.width / 2), int(y - im.height / 2)))
    for im, x, y in back:
        canvas.alpha_composite(im.filter(ImageFilter.GaussianBlur(1.5)), (x, y))
    canvas.alpha_composite(z, (zx, zy))
    for im, x, y in front:
        canvas.alpha_composite(im, (x, y))
    return canvas


def variant_b(rng: random.Random) -> Image.Image:
    """実画面: カーソルで発現の候補を選ぶ瞬間を大きく、右に指差すめたん."""
    canvas = background(rng)
    shot = Image.open(PICK_SHOT).convert("RGBA")
    gray = shot.convert("L").point(lambda v: 255 if v > 40 else 0)
    shot = shot.crop(gray.getbbox() or (0, 0, shot.width, shot.height))
    shot = fit(shot, 860, 600)
    frame = Image.new("RGBA", (shot.width + 16, shot.height + 16), (0, 0, 0, 0))
    ImageDraw.Draw(frame).rounded_rectangle(
        (0, 0, frame.width - 1, frame.height - 1), 18, fill=(12, 10, 8, 255)
    )
    frame.alpha_composite(shot, (8, 8))
    framed = glow(frame, (255, 200, 90), 22)
    canvas.alpha_composite(framed, (30, (H - framed.height) // 2 + 20))
    m = fit(bust(metan_point(), 0.55), 520, 640)
    canvas.alpha_composite(m, (W - m.width + 40, H - m.height + 20))
    return canvas


def variant_c(rng: random.Random) -> Image.Image:
    """骨 vs お告げ: 斜めに割る。左は冷たい灰青に骨、右は紫にお告げ、下に 2 人."""
    left = Image.new("RGBA", (W, H))
    right = Image.new("RGBA", (W, H))
    dl, dr = ImageDraw.Draw(left), ImageDraw.Draw(right)
    for y in range(H):
        t = y / H
        dl.line([(0, y), (W, y)], fill=(int(40 - 25 * t), int(58 - 35 * t), int(72 - 40 * t), 255))
        dr.line([(0, y), (W, y)], fill=(int(70 - 40 * t), int(30 - 20 * t), int(90 - 50 * t), 255))
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).polygon([(W * 0.58, 0), (W, 0), (W, H), (W * 0.42, H)], fill=255)
    canvas = Image.composite(right, left, mask)
    d = ImageDraw.Draw(canvas)  # 割れ目に光の線
    d.line([(W * 0.58, 0), (W * 0.42, H)], fill=(255, 230, 160, 255), width=10)
    canvas = canvas.filter(ImageFilter.GaussianBlur(0.6))
    for i, key in enumerate(BONES):
        im = glow(icon(key, 190, rng.uniform(-20, 20)), (170, 210, 255), 14)
        canvas.alpha_composite(im, (40 + i * 150, 120 + (i % 2) * 120))
    for i, key in enumerate(["OmenofDextralExaltation", "OmenofAbyssalEchoes", "OmenoftheLiege"]):
        im = glow(icon(key, 170, rng.uniform(-20, 20)), (210, 140, 255), 14)
        canvas.alpha_composite(im, (W - 600 + i * 165, 110 + ((i + 1) % 2) * 120))
    z = fit(bust(zundamon_hold(), 0.5), 360, 360)
    m = fit(bust(metan_point(), 0.45), 330, 360)
    canvas.alpha_composite(m, (W // 2 - m.width - 10, H - m.height))
    canvas.alpha_composite(z, (W // 2 + 10, H - z.height))
    return canvas


VARIANTS = {"a": variant_a, "b": variant_b, "c": variant_c}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", default="all", choices=[*VARIANTS, "all"])
    ap.add_argument("--seed", type=int, default=20261004)
    a = ap.parse_args()
    for k in VARIANTS if a.variant == "all" else [a.variant]:
        out = ROOT / "output" / f"end_craft_materials_2_thumb_base_{k}.jpg"
        VARIANTS[k](random.Random(a.seed)).convert("RGB").save(out, quality=92)
        structlog.get_logger().info("thumbnail base written", path=str(out))


if __name__ == "__main__":
    main()
