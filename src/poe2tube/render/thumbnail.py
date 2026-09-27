"""サムネイル (1280x720): 暗い実画面を背景に、左右に 2 人、中央に太い縁取りの大文字、下に色バッジ.

kyohei が見本にした「初心者必見！/ 最初から知りたかった / スタートガイド / 4 つの色バッジ」の型。
文字は 2 段: 上段 (白・黒縁、状況) → 下段 (黄・赤縁、結論)。
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont
from pydantic import BaseModel, ConfigDict, Field

from poe2tube.render.palette import FONT_PATH
from poe2tube.render.tachie import render_tachie

W, H = 1280, 720
# 極太のロゴ用フォント (PC にあれば使う。無ければメイリオ太字)
LOGO_FONT_CANDIDATES = [
    Path.home() / "AppData/Local/Microsoft/Windows/Fonts/07LogoTypeGothic7.ttf",
    Path(r"C:/Windows/Fonts/BIZ-UDGothicB.ttc"),
]


@lru_cache(maxsize=16)
def font(size: int) -> ImageFont.FreeTypeFont:
    for cand in LOGO_FONT_CANDIDATES:
        if cand.exists():
            return ImageFont.truetype(str(cand), size)
    return ImageFont.truetype(str(FONT_PATH), size)


BADGE_COLORS = [(214, 40, 40), (31, 111, 235), (222, 120, 0), (46, 160, 67)]


class ThumbnailSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    top: str = Field(description="上段 (白・黒縁)。例: 最初から知りたかった")
    main: str = Field(description="下段 (黄・赤縁、一番大きい)。例: クラフト入門")
    corner: str = Field(default="初心者必見！", description="左上の赤いラベル")
    badges: list[str] = Field(
        default_factory=list, max_length=4, description="下の色バッジ (4 つまで)"
    )
    background: Path | None = Field(default=None, description="背景に敷く画像 (実画面の撮影など)")


def _stroke_text(
    d: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    size: int,
    fill: tuple[int, int, int],
    stroke: tuple[int, int, int],
    width: int,
) -> None:
    f = font(size)
    d.text(xy, text, font=f, fill=fill, stroke_width=width, stroke_fill=stroke, anchor="mm")


def _fit(d: ImageDraw.ImageDraw, text: str, size: int, max_w: int) -> int:
    while size > 24 and d.textlength(text, font=font(size)) > max_w:
        size -= 4
    return size


def render_thumbnail(spec: ThumbnailSpec) -> Image.Image:
    img = Image.new("RGBA", (W, H), (18, 14, 24, 255))
    if spec.background and spec.background.exists():
        bg = Image.open(spec.background).convert("RGBA")
        scale = max(W / bg.width, H / bg.height)
        bg = bg.resize((int(bg.width * scale), int(bg.height * scale)), Image.Resampling.LANCZOS)
        bg = bg.crop(
            ((bg.width - W) // 2, (bg.height - H) // 2, (bg.width + W) // 2, (bg.height + H) // 2)
        )
        bg = bg.filter(ImageFilter.GaussianBlur(3))
        dark = Image.new("RGBA", (W, H), (0, 0, 0, 120))
        img.alpha_composite(bg)
        img.alpha_composite(dark)
    # 2 人 (上半身が大きく入るように高さを画面より大きく取り、下を切る)
    metan = render_tachie("metan", "proud", 0, 820)
    zunda = render_tachie("zundamon", "surprised", 2, 780)
    # 顔が文字に隠れないよう、2 人は外側に寄せて文字は中央 780px に収める
    img.alpha_composite(metan, (-110, 110))
    img.alpha_composite(zunda, (W - zunda.width + 120, 140))
    d = ImageDraw.Draw(img)
    # 中央の帯 (文字の背面を少し暗くして読みやすく)
    band = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(band).rectangle((0, 190, W, 540), fill=(0, 0, 0, 110))
    img.alpha_composite(band)
    d = ImageDraw.Draw(img)
    top_size = _fit(d, spec.top, 74, 760)
    _stroke_text(d, (W // 2, 265), spec.top, top_size, (255, 255, 255), (0, 0, 0), 8)
    main_size = _fit(d, spec.main, 150, 780)
    _stroke_text(d, (W // 2, 420), spec.main, main_size, (255, 224, 40), (170, 20, 20), 12)
    # 左上ラベル
    if spec.corner:
        cw = int(d.textlength(spec.corner, font=font(34))) + 40
        d.rectangle((0, 0, cw, 62), fill=(214, 40, 40))
        d.text((20, 12), spec.corner, font=font(34), fill=(255, 255, 255))
    # 下のバッジ
    if spec.badges:
        n = len(spec.badges)
        bw, gap = 250, 16
        x = (W - (bw * n + gap * (n - 1))) // 2
        for i, label in enumerate(spec.badges):
            color = BADGE_COLORS[i % len(BADGE_COLORS)]
            d.rectangle((x, 585, x + bw, 665), fill=color, outline=(255, 255, 255), width=4)
            size = _fit(d, label, 44, bw - 30)
            d.text((x + bw // 2, 625), label, font=font(size), fill=(255, 255, 255), anchor="mm")
            x += bw + gap
    return img
