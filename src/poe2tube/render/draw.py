"""Pillow の小さな部品: 角丸パネル、影、ピル、矢印、アイコン読み込み."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

from poe2tube.render.palette import INK, LINE, PANEL, RGB, WHITE, font

Box = tuple[int, int, int, int]


def shadow_panel(
    img: Image.Image,
    box: Box,
    fill: RGB = WHITE,
    outline: RGB = LINE,
    radius: int = 24,
    blur: int = 18,
    offset: int = 8,
) -> None:
    """柔らかい影付きの角丸パネル (白背景で浮かせる用)."""
    x0, y0, x1, y1 = box
    pad = blur * 2
    sh = Image.new("RGBA", (x1 - x0 + pad * 2, y1 - y0 + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        (pad, pad + offset, pad + x1 - x0, pad + offset + y1 - y0), radius, fill=(0, 0, 0, 60)
    )
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    img.alpha_composite(sh, (x0 - pad, y0 - pad))
    ImageDraw.Draw(img).rounded_rectangle(box, radius, fill=fill, outline=outline, width=2)


def pill(
    img: Image.Image,
    xy: tuple[int, int],
    text: str,
    fill: RGB,
    color: RGB = WHITE,
    size: int = 30,
    pad: int = 18,
    max_w: int | None = None,
) -> Box:
    """角丸ラベル。左上座標で置き、占有した箱を返す。``max_w`` 超なら文字を縮める (下限 14)."""
    d = ImageDraw.Draw(img)
    f = font(size)
    if max_w is not None:
        while size > 14 and d.textlength(text, font=font(size)) + pad * 2 > max_w:
            size -= 2
        f = font(size)
    w = int(d.textlength(text, font=f))
    h = size + pad
    box = (xy[0], xy[1], xy[0] + w + pad * 2, xy[1] + h)
    d.rounded_rectangle(box, h // 2, fill=fill)
    d.text((xy[0] + pad, xy[1] + pad // 2 - 2), text, font=f, fill=color)
    return box


def arrow_right(img: Image.Image, x: int, y: int, length: int = 60, color: RGB = INK) -> None:
    d = ImageDraw.Draw(img)
    d.line((x, y, x + length - 14, y), fill=color, width=8)
    d.polygon([(x + length, y), (x + length - 26, y - 18), (x + length - 26, y + 18)], fill=color)


def text_fit(
    img: Image.Image, xy: tuple[int, int], text: str, max_w: int, size: int, fill: RGB = INK
) -> int:
    """幅に収まるまで縮めて描く。使ったフォントサイズを返す."""
    d = ImageDraw.Draw(img)
    while size > 14 and d.textlength(text, font=font(size)) > max_w:
        size -= 2
    d.text(xy, text, font=font(size), fill=fill)
    return size


@lru_cache(maxsize=64)
def load_icon(path: Path, height: int) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    scale = height / im.height
    return im.resize((max(1, int(im.width * scale)), height), Image.Resampling.LANCZOS)


def placeholder_icon(label: str, height: int) -> Image.Image:
    """アイコンが無い時の丸プレースホルダ (頭文字入り)."""
    im = Image.new("RGBA", (height, height), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((2, 2, height - 2, height - 2), fill=PANEL, outline=LINE, width=3)
    f = font(height // 2)
    w = d.textlength(label[:1], font=f)
    d.text(((height - w) / 2, height / 2 - height // 4 - 2), label[:1], font=f, fill=INK)
    return im
