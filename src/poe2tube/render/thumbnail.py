"""サムネイル (1280x720): PoE2 クラフト解説で「見たい」と思わせる型 (2026-09-28 リサーチ).

伸びている競合 (やざわ 2.5 万 / GPD 1.6 万再生) と記事の共通点:
- 題名は 10 字以内・1 メッセージ・極太で多重縁取り。攻略系はキャラ顔より**ゲーム素材が主役**
- 上に色バッジ、中央に巨大な赤/黄の題名、**カレンシーのオーブを大きく散らす** (PoE だと一目で分かる)
- 右下は再生時間で隠れるので重要な物を置かない。画面は分割しない

文字は GiftCut のテロップスタイル (telop_style.render_telop、プリセット名で指定)。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFilter
from pydantic import BaseModel, ConfigDict, Field

from poe2tube.config.settings import REPO_ROOT
from poe2tube.render.tachie import render_tachie
from poe2tube.render.telop_style import render_telop

W, H = 1280, 720
ICON_DIR = REPO_ROOT / "assets" / "icons"
# 実画面 (動画モード 1920x1080) の完成アイテム枠
ITEM_CARD_BOX = (200, 175, 945, 680)
DEFAULT_ORBS = ["exalt", "chaos", "regal", "transmute", "divine", "augment", "annul", "vaal"]
# (中心 x, 中心 y, 直径, 傾き) — 左右の帯に大小をつけて。中央の題名と右下の再生時間を避ける
ORB_SLOTS = [
    (95, 290, 190, -8),
    (250, 170, 120, 6),
    (330, 470, 100, 10),
    (60, 130, 90, -12),
    (1185, 290, 190, 8),
    (1030, 170, 120, -6),
    (950, 470, 100, -10),
    (1220, 130, 90, 12),
]
# バッジ文字: 色付きの箱の上で読める白・黒縁 (GiftCut の組み込み「ホワイト」相当)
BADGE_TEXT_STYLE = {
    "fontFamily": "Noto Sans JP Black",
    "fontSize": 90,
    "fill": {"enabled": True, "color": "#ffffff"},
    "strokes": [{"enabled": True, "color": "#111111", "width": 9, "position": "outside"}],
    "shadow": {"enabled": True, "color": "#000000", "opacity": 70, "angle": 135, "distance": 5},
}


class ThumbnailSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    top: str = Field(description="上段 (状況)。例: 最初から知りたかった")
    main: str = Field(description="下段 (一番大きい結論)。10 字以内")
    corner: str = Field(default="初心者必見！", description="左上の赤いラベル")
    badges: list[str] = Field(
        default_factory=list, max_length=4, description="上のバッジ (4 つまで)"
    )
    background: Path | None = Field(default=None, description="実画面の撮影 (1920x1080)")
    orbs: list[str] = Field(default_factory=lambda: list(DEFAULT_ORBS))
    top_style: str = Field(default="textstyle032", description="上段の GiftCut プリセット")
    main_style: str = Field(default="textstyle025", description="題名の GiftCut プリセット")


def _fit_telop(
    style: str | dict[str, Any], text: str, max_w: int, max_h: int, start: float
) -> Image.Image:
    scale = start
    im = render_telop(style, text, scale)
    while (im.width > max_w or im.height > max_h) and scale > 0.2:
        scale *= 0.92
        im = render_telop(style, text, scale)
    return im


def _orb(key: str, size: int, tilt: int) -> Image.Image | None:
    """金縁の丸メダルの中にオーブ + 後ろに光 (GPD 型)."""
    path = ICON_DIR / f"{key}.png"
    if not path.exists():
        return None
    s = size + 60
    out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((22, 22, s - 22, s - 22), fill=(255, 190, 70, 170))
    out.alpha_composite(glow.filter(ImageFilter.GaussianBlur(14)))
    d = ImageDraw.Draw(out)
    d.ellipse((30, 36, s - 30, s - 24), fill=(0, 0, 0, 160))
    d.ellipse((30, 30, s - 30, s - 30), fill=(30, 22, 14, 255), outline=(235, 195, 95), width=6)
    icon = Image.open(path).convert("RGBA")
    k = int(size * 0.82)
    icon = icon.resize((k, int(icon.height * k / icon.width)), Image.Resampling.LANCZOS)
    out.alpha_composite(icon, ((s - icon.width) // 2, (s - icon.height) // 2))
    return out.rotate(tilt, resample=Image.Resampling.BICUBIC, expand=True)


def _background(img: Image.Image, src_path: Path | None) -> None:
    if not src_path or not src_path.exists():
        return
    src = Image.open(src_path).convert("RGBA")
    bg = src.resize((W, int(src.height * W / src.width)), Image.Resampling.LANCZOS)
    bg = bg.crop((0, (bg.height - H) // 2, W, (bg.height + H) // 2)).filter(
        ImageFilter.GaussianBlur(7)
    )
    img.alpha_composite(bg)
    # 中央から外へ暗くする (周辺減光)
    vig = Image.new("L", (W, H), 0)
    ImageDraw.Draw(vig).ellipse((-200, -160, W + 200, H + 160), fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(120))
    dark = Image.new("RGBA", (W, H), (0, 0, 0, 200))
    dark.putalpha(Image.eval(vig, lambda v: 200 - int(v * 0.55)))
    img.alpha_composite(dark)
    # 完成アイテムを中央下に (金の光)
    card = src.crop(ITEM_CARD_BOX)
    card = card.resize((int(card.width * 0.6), int(card.height * 0.6)), Image.Resampling.LANCZOS)
    cx, cy = (W - card.width) // 2, H - card.height - 26
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).rounded_rectangle(
        (cx - 16, cy - 16, cx + card.width + 16, cy + card.height + 16),
        20,
        fill=(255, 196, 70, 190),
    )
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(18)))
    img.alpha_composite(card, (cx, cy))


def render_thumbnail(spec: ThumbnailSpec) -> Image.Image:
    img = Image.new("RGBA", (W, H), (26, 18, 12, 255))
    _background(img, spec.background)
    for key, (x, y, size, tilt) in zip(spec.orbs, ORB_SLOTS, strict=False):
        orb = _orb(key, size, tilt)
        if orb is not None:
            img.alpha_composite(orb, (x - orb.width // 2, y - orb.height // 2))
    # 2 人 (小さめ、左右下の角)
    metan = render_tachie("metan", "proud", 0, 440)
    zunda = render_tachie("zundamon", "surprised", 2, 420)
    img.alpha_composite(metan, (-30, H - 380))
    img.alpha_composite(zunda, (W - zunda.width + 40, H - 370))
    # 上のバッジ列
    d = ImageDraw.Draw(img)
    colors = [(214, 40, 40), (31, 111, 235), (222, 120, 0), (46, 160, 67)]
    if spec.badges:
        n = len(spec.badges)
        bw, gap, y0 = 236, 10, 14
        x = (W - (bw * n + gap * (n - 1))) // 2
        for i, label in enumerate(spec.badges):
            d.rectangle(
                (x, y0, x + bw, y0 + 66), fill=colors[i % 4], outline=(255, 255, 255), width=4
            )
            t = _fit_telop(BADGE_TEXT_STYLE, label, bw - 20, 56, 0.6)
            img.alpha_composite(t, (x + (bw - t.width) // 2, y0 + (66 - t.height) // 2))
            x += bw + gap
    # 題名 2 段 (GiftCut のスタイル)
    top = _fit_telop(spec.top_style, spec.top, 760, 110, 0.75)
    img.alpha_composite(top, ((W - top.width) // 2, 110))
    main = _fit_telop(spec.main_style, spec.main, 900, 240, 1.6)
    img.alpha_composite(main, ((W - main.width) // 2, 215))
    # 左上ラベル (バッジと重ならないよう、バッジがある時は出さない)
    if spec.corner and not spec.badges:
        lab = _fit_telop(BADGE_TEXT_STYLE, spec.corner, 400, 60, 0.5)
        d.rectangle((0, 0, lab.width + 36, lab.height + 20), fill=(214, 40, 40))
        img.alpha_composite(lab, (18, 10))
    return img
