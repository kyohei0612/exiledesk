"""色とフォント。レアリティ色は PoE のゲーム内表示に寄せる."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from PIL import ImageFont

RGB = tuple[int, int, int]

WHITE: RGB = (255, 255, 255)
INK: RGB = (34, 40, 49)
MUTED: RGB = (120, 128, 140)
LINE: RGB = (214, 219, 226)
PANEL: RGB = (247, 248, 250)
ACCENT: RGB = (31, 111, 235)
ACCENT_SOFT: RGB = (222, 234, 255)
GOLD: RGB = (255, 196, 0)
GOLD_SOFT: RGB = (255, 246, 205)
GREEN: RGB = (46, 160, 67)
GREEN_SOFT: RGB = (222, 245, 228)
RED: RGB = (220, 53, 69)

RARITY: dict[str, RGB] = {
    "normal": (170, 176, 186),
    "magic": (72, 104, 255),
    "rare": (222, 170, 0),
}
RARITY_SOFT: dict[str, RGB] = {
    "normal": (240, 241, 244),
    "magic": (228, 233, 255),
    "rare": (255, 246, 205),
}
RARITY_JA = {"normal": "ノーマル (白)", "magic": "マジック (青)", "rare": "レア (黄)"}

FONT_PATH = Path(r"C:\Windows\Fonts\meiryob.ttc")


@lru_cache(maxsize=32)
def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    # meiryob.ttc: index 0 = Meiryo Bold, meiryo.ttc: index 0 = Meiryo
    path = FONT_PATH if bold else FONT_PATH.with_name("meiryo.ttc")
    return ImageFont.truetype(str(path), size)
