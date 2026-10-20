"""GiftCut のテロップスタイル (TelopStyle) を Pillow で描く移植版.

元: GiftCut `telopSvg.ts` (buildTelopSVG) / `telopStyle.ts` / `telopLayout.ts`。
- 数値は動画の高さ 1080px 基準。``scale`` で縮める (サムネ 720p なら 2/3)
- 重ね順: 影 (shadows[] の後ろから → shadow) → 縁 (太い順) → 塗り (縦グラデ)
- 縁: outside = width、center = width/2、inside = 0 だけ文字の外に出る (各縁は独立、積み上げない)
- 影: 角度 0°=上・時計回り、膨張 = 一番外の縁 + spread*0.667*(15/18)、ぼかし σ = blur*0.075*0.5
- プリセット: GiftCut `telop-presets/*.json`。kyohei 了承の上で自分の動画に使う
"""

from __future__ import annotations

import json
import math
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

from poe2tube.config.settings import get_settings

USER_FONTS = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "Windows" / "Fonts"
SYS_FONTS = Path(r"C:/Windows/Fonts")
# CSS の font-family 名 → フォントファイル (GiftCut が Windows に入れた物)
FONT_FILES: dict[str, list[Path]] = {
    "dela gothic one": [USER_FONTS / "DelaGothicOne-Regular.ttf"],
    "reggae one": [USER_FONTS / "ReggaeOne-Regular.ttf"],
    "m plus rounded 1c": [USER_FONTS / "MPLUSRounded1c-Black.ttf"],
    "zen maru gothic": [USER_FONTS / "ZenMaruGothic-Black.ttf"],
    "mochiy pop one": [USER_FONTS / "MochiyPopOne-Regular.ttf"],
    "hachi maru pop": [USER_FONTS / "HachiMaruPop-Regular.ttf"],
    "yusei magic": [USER_FONTS / "YuseiMagic-Regular.ttf"],
    "けいふぉんと": [USER_FONTS / "keifont.ttf"],
    "noto sans jp black": [USER_FONTS / "NotoSansJP-Black.ttf"],
    "noto sans jp": [USER_FONTS / "NotoSansJP-Black.ttf", SYS_FONTS / "NotoSansJP-VF.ttf"],
    "noto serif jp black": [USER_FONTS / "NotoSerifJP-Black.ttf", SYS_FONTS / "NotoSerifJP-VF.ttf"],
    "noto serif jp": [SYS_FONTS / "NotoSerifJP-VF.ttf"],
    "ラノベpop v2": [USER_FONTS / "LanobePOPv2.otf"],
    "たぬき油性マジック": [USER_FONTS / "TanukiMagic.ttf"],
    "07にくまるフォント": [USER_FONTS / "Nikumaru.otf"],
    "07ロゴたいぷゴシック7": [USER_FONTS / "07LogoTypeGothic7.ttf"],
    "コーポレート・ロゴ ver3 bold": [USER_FONTS / "CorporateLogoBold.otf"],
    "yu gothic ui": [SYS_FONTS / "YuGothB.ttc"],
}
FALLBACK_FONT = SYS_FONTS / "meiryob.ttc"
RGBA = tuple[int, int, int, int]


def resolve_font(family: str) -> Path:
    for name in family.split(","):
        key = name.strip().strip('"').strip("'").lower()
        for path in FONT_FILES.get(key, []):
            if path.exists():
                return path
    return FALLBACK_FONT


@lru_cache(maxsize=64)
def _font(path: str, size: int) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(path, size)
    if "-VF" in path:  # Variable フォントは一番太いウェイトに (GiftCut は Black を指定している)
        try:
            f.set_variation_by_name("Black")
        except (OSError, ValueError):
            pass  # Black の名前付きインスタンスが無いフォントは既定の太さのまま
    return f


@lru_cache(maxsize=1)
def load_presets() -> dict[str, dict[str, Any]]:
    """GiftCut のプリセット {name: style}。無ければ空."""
    root = get_settings().giftcut_root / "telop-presets"
    out: dict[str, dict[str, Any]] = {}
    for p in sorted(root.glob("*.json")) if root.exists() else []:
        for item in json.loads(p.read_text(encoding="utf-8")):
            out.setdefault(item["name"], item["style"])
    return out


def _hex(color: str, opacity: float = 1.0) -> RGBA:
    c = color.lstrip("#")
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), int(255 * opacity))


def _outward(stroke: dict[str, Any]) -> float:
    pos = stroke.get("position", "outside")
    w = float(stroke.get("width", 0))
    return w if pos == "outside" else w / 2 if pos == "center" else 0.0


def _mask(
    text: str, font: ImageFont.FreeTypeFont, size: tuple[int, int], xy: tuple[int, int], grow: int
) -> Image.Image:
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).text(
        xy, text, font=font, fill=255, stroke_width=max(0, grow), stroke_fill=255
    )
    return m


def _gradient(
    size: tuple[int, int], bbox: tuple[int, int, int, int], fill: dict[str, Any]
) -> Image.Image:
    """縦グラデ (angle 90 = 上が stop0)。mid は区間内の中間点 (簡易: べき乗で寄せる)."""
    img = Image.new("RGBA", size, _hex(fill.get("color", "#ffffff")))
    grad = fill.get("gradient")
    if not grad or not grad.get("stops"):
        return img
    stops = sorted(grad["stops"], key=lambda s: s["pos"])
    x0, y0, x1, y1 = bbox
    d = ImageDraw.Draw(img)
    h = max(1, y1 - y0)
    for i in range(h):
        t = i / (h - 1 or 1)
        a, b = stops[0], stops[-1]
        for s0, s1 in zip(stops, stops[1:], strict=False):
            if s0["pos"] <= t <= s1["pos"]:
                a, b = s0, s1
                break
        span = (b["pos"] - a["pos"]) or 1
        u = min(1.0, max(0.0, (t - a["pos"]) / span))
        mid = float(a.get("mid", 0.5)) or 0.5
        u = u ** (math.log(0.5) / math.log(mid)) if 0 < mid < 1 else u
        ca, cb = _hex(a["color"]), _hex(b["color"])
        col = tuple(int(ca[k] + (cb[k] - ca[k]) * u) for k in range(3))
        d.line((0, y0 + i, size[0], y0 + i), fill=(*col, 255))
    return img


def render_telop(style: dict[str, Any] | str, text: str, scale: float = 1.0) -> Image.Image:
    """TelopStyle (または プリセット名) と文字から、余白込みの透過 PNG を作る."""
    if isinstance(style, str):
        style = load_presets()[style]
    size = max(8, int(style.get("fontSize", 90) * scale))
    font = _font(str(resolve_font(style.get("fontFamily", ""))), size)
    strokes = [s for s in style.get("strokes", []) if s.get("enabled", True)]
    outer = max((_outward(s) for s in strokes), default=0.0)
    shadows = [
        s for s in [style.get("shadow"), *style.get("shadows", [])] if s and s.get("enabled")
    ]
    reach = outer + max(
        (
            s.get("distance", 0) + s.get("spread", 0) * 0.556 + s.get("blur", 0) * 0.12
            for s in shadows
        ),
        default=0,
    )
    pad = int((reach + 8) * scale) + 4
    tw, th = (int(v) for v in font.getbbox(text)[2:])
    canvas = (tw + pad * 2, th + pad * 2)
    xy = (pad, pad)
    out = Image.new("RGBA", canvas, (0, 0, 0, 0))
    # 影 (後ろの物から)
    for sh in reversed(shadows):
        grow = int((outer + sh.get("spread", 0) * 0.667 * 15 / 18) * scale)
        m = _mask(text, font, canvas, xy, grow)
        a = math.radians(sh.get("angle", 45))
        dx, dy = (
            int(math.sin(a) * sh.get("distance", 0) * scale),
            int(-math.cos(a) * sh.get("distance", 0) * scale),
        )
        m = ImageChops.offset(m, dx, dy)
        sigma = sh.get("blur", 0) * 0.075 * 0.5 * scale
        if sigma > 0.3:
            m = m.filter(ImageFilter.GaussianBlur(sigma))
        layer = Image.new(
            "RGBA", canvas, _hex(sh.get("color", "#000000"), sh.get("opacity", 100) / 100)
        )
        layer.putalpha(ImageChops.multiply(m, layer.getchannel("A")))
        out.alpha_composite(layer)
    # 縁 (太い順)
    for st in sorted(strokes, key=_outward, reverse=True):
        grow = int(_outward(st) * scale)
        if grow <= 0:
            continue
        layer = Image.new("RGBA", canvas, _hex(st.get("color", "#000000")))
        layer.putalpha(_mask(text, font, canvas, xy, grow))
        out.alpha_composite(layer)
    # 塗り
    fill = style.get("fill", {})
    if fill.get("enabled", True):
        m = _mask(text, font, canvas, xy, 0)
        bbox = m.getbbox() or (0, 0, *canvas)
        layer = _gradient(canvas, bbox, fill)
        layer.putalpha(m)
        out.alpha_composite(layer)
    return out.crop(out.getbbox() or (0, 0, *canvas))
