"""チャンネルバナー (2560x1440)。スマホで見える真ん中 1546x423 に全部の情報を入れる (ADR 003)."""

from __future__ import annotations

import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from poe2tube.render.palette import font
from poe2tube.render.telop_style import load_presets, render_telop

W, H = 2560, 1440
SAFE = (W // 2 - 773, H // 2 - 212, W // 2 + 773, H // 2 + 211)  # 全端末で見える範囲
BG = (250, 249, 245)
BAND = (222, 243, 233)  # 淡いミント (黄色のキャラが映える)
INK = (74, 46, 22)
SPRINKLES = [(255, 90, 110), (80, 180, 255), (120, 220, 110), (250, 150, 230), (255, 150, 60)]


def cutout(icon: Path, bg: tuple[int, int, int] = BG) -> Image.Image:
    """アイコン画像 (背景が 1 色) から背景を抜いた RGBA."""
    rgb = np.asarray(Image.open(icon).convert("RGB")).astype(np.int16)
    diff = np.abs(rgb - np.array(bg, np.int16)).sum(axis=2)
    alpha = np.clip((diff - 6) * 40, 0, 255).astype(np.uint8)
    im = Image.fromarray(rgb.astype(np.uint8)).convert("RGBA")
    im.putalpha(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.6)))
    return im.crop(im.getbbox())


def _sprinkles(img: Image.Image, seed: int = 5) -> None:
    """帯の外 (PC / TV だけ見える所) にスプレーを散らす."""
    rnd = random.Random(seed)
    d = ImageDraw.Draw(img)
    for _ in range(260):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        if SAFE[1] - 40 < y < SAFE[3] + 40:
            continue
        a = rnd.uniform(0, math.pi)
        L = rnd.uniform(14, 26)
        dx, dy = L * math.cos(a), L * math.sin(a)
        d.line([(x - dx, y - dy), (x + dx, y + dy)], fill=rnd.choice(SPRINKLES), width=12)


def _text(img: Image.Image, text: str, size: int, xy: tuple[int, int], style: str | None) -> int:
    """GiftCut のスタイルがあればそれで、無ければ太字 + 縁取りで書く。戻り値は高さ."""
    presets = load_presets()
    if style and style in presets:
        t = render_telop(presets[style], text, size / 100)
        img.alpha_composite(t, xy)
        return t.height
    d = ImageDraw.Draw(img)
    f = font(size)
    d.text(xy, text, font=f, fill=INK, stroke_width=max(2, size // 14), stroke_fill=(255, 255, 255))
    return int(size * 1.25)


def render_banner(icon: Path, title: str, subtitle: str, tagline: str) -> Image.Image:
    img = Image.new("RGBA", (W, H), (*BG, 255))
    _sprinkles(img)
    d = ImageDraw.Draw(img)
    # 見える帯: 黄色の帯 + 上下にチョコのライン
    d.rectangle((0, SAFE[1], W, SAFE[3]), fill=BAND)
    d.rectangle((0, SAFE[1] - 18, W, SAFE[1]), fill=(96, 56, 30))
    d.rectangle((0, SAFE[3], W, SAFE[3] + 18), fill=(96, 56, 30))

    ch = cutout(icon)
    h = SAFE[3] - SAFE[1] + 30
    ch = ch.resize((int(ch.width * h / ch.height), h), Image.Resampling.LANCZOS)
    cx = SAFE[0] + 10
    img.alpha_composite(ch, (cx, SAFE[3] - h))

    tx = cx + ch.width + 40
    y = SAFE[1] + 22
    y += _text(img, title, 128, (tx, y), "textstyle025")
    y += _text(img, subtitle, 58, (tx, y), None)
    _text(img, tagline, 44, (tx, y), None)
    return img
