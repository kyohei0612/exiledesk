"""サムネ: act_offense_defense_8min (アクト中の火力と防御).

採用 (2026-09-30): 案 3 (武器のカード 2 枚 + 矢印 + 嘆くずんだもん、文字なし) を土台に、
kyohei が GiftCut で文字 (「アクトが難しいのだ!!」「アクト中のコツ紹介！」) を入れて仕上げた物
(Downloads/giftcut_screenshot.png → output/act_offense_defense_8min_thumb.jpg、1280x720)。

案 (kyohei 2026-09-30): 白地の右側に、ずんだもんの顔を大きく。嘆いて叫ぶ表情 (困り眉・><・うわー・
青ざめ・涙・両手を挙げる・萎えた枝豆)。左に「アクト、ムズすぎ！」と、答えの「火力は武器・防御は耐性」。
文字はずんだもんに被せない。

    python scripts/thumbs/act_offense_defense_8min.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter
from psd_tools import PSDImage

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from poe2tube.config.settings import get_settings  # noqa: E402
from poe2tube.render.tachie import ZUNDAMON, _apply, _find_group  # noqa: E402
from poe2tube.render.telop_style import render_telop  # noqa: E402

W, H = 1280, 720
OUT = ROOT / "output" / "act_offense_defense_8min_thumb.jpg"
CACHE = ROOT / "cache" / "thumb" / "zundamon_scream.png"
TEXT_RIGHT = 700  # 文字はここより左 (ずんだもんに被せない)

SCREAM = [
    ("!右腕", "*手を挙げる"),
    ("!左腕", "*手を挙げる"),
    ("!顔色", "*青ざめ"),
    ("!枝豆", "*枝豆萎え"),
    ("!眉", "*困り眉"),
    ("!目", "*><"),
    ("!口", "*うわー"),
]


def scream(one_arm: bool = False) -> Image.Image:
    """嘆いて叫ぶずんだもん (全身、透明背景)。PSD の合成は重いのでキャッシュ.

    one_arm: 画面の左側の腕 (ずんだもんの右腕) を下ろす (カードの文字に手を被せない)。
    """
    cache = CACHE.with_name(CACHE.stem + ("_one" if one_arm else "") + ".png")
    if cache.exists():
        return Image.open(cache).convert("RGBA")
    psd = PSDImage.open(ZUNDAMON.psd)
    _apply(psd, SCREAM + ([("!右腕", "*基本")] if one_arm else []))
    marks = _find_group(psd, "!記号など")
    marks.visible = True
    for layer in marks:
        layer.visible = layer.name in ("涙", "汗")
    img = psd.composite(force=True).convert("RGBA")
    cache.parent.mkdir(parents=True, exist_ok=True)
    img.save(cache)
    return img


def fit(im: Image.Image, max_w: int, max_h: int) -> Image.Image:
    k = min(max_w / im.width, max_h / im.height)
    return im.resize((int(im.width * k), int(im.height * k)), Image.Resampling.LANCZOS)


PUB = get_settings().exiledesk_root / "public"
ICONS = ROOT / "assets" / "icons"
# PoE2 の小物 (ExileDesk が書き出したゲームの絵): (絵, 幅, 高さの上限, 中心 x, 中心 y, 回転)
PROPS = [
    (ICONS / "transmute.png", 90, 90, 90, 660, -10),
    (ICONS / "augment.png", 90, 90, 200, 665, 8),
    (ICONS / "regal.png", 90, 90, 310, 660, -6),
    (ICONS / "exalt.png", 90, 90, 420, 668, 10),
    (PUB / "skill-art" / "SkillGemIceStrike_icon.webp", 110, 110, 1205, 70, 0),
    (PUB / "rune-art" / "Currency_Runes_ColdRuneTier1.webp", 80, 80, 1100, 60, 12),
    (PUB / "base-art" / "Armours_BodyArmours_Basetypes_BodyStrDex01.webp", 130, 150, 620, 600, -8),
    (PUB / "base-art" / "Rings_Basetypes_SapphireRing.webp", 70, 70, 700, 470, 15),
]
STAFF = PUB / "base-art" / "Weapons_TwoHandWeapons_WarStaves_Warstaff06.webp"


def shadowed(im: Image.Image, blur: int = 6, alpha: int = 110) -> Image.Image:
    """落ち影を付ける (白地で浮いて見えるように)."""
    pad = blur * 3
    out = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
    sh = Image.new("RGBA", im.size, (0, 0, 0, alpha))
    sh.putalpha(im.getchannel("A").point(lambda a: a * alpha // 255))
    out.alpha_composite(sh, (pad + 4, pad + 6))
    out = out.filter(ImageFilter.GaussianBlur(blur))
    out.alpha_composite(im, (pad, pad))
    return out


def put(canvas: Image.Image, path: Path, w: int, h: int, cx: int, cy: int, rot: float) -> None:
    im = fit(Image.open(path).convert("RGBA"), w, h).rotate(
        rot, expand=True, resample=Image.BICUBIC
    )
    im = shadowed(im)
    canvas.alpha_composite(im, (cx - im.width // 2, cy - im.height // 2))


COMPARE = (
    ROOT / "cache" / "stage" / "views" / "76007dcb2b975efb.png"
)  # 比べる (ずんだもん / おすすめ)


def base_canvas(variant: str) -> Image.Image:
    """背景。1 = 比べる画面を全体に薄く敷く、2 = 白 (DPS の箱は後で札として置く)."""
    canvas = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    if variant == "1":
        cmp_ = Image.open(COMPARE).convert("RGBA").resize((W, H), Image.Resampling.LANCZOS)
        canvas.alpha_composite(cmp_)
        canvas.alpha_composite(Image.new("RGBA", (W, H), (255, 255, 255, 185)))
    return canvas


def dps_card() -> Image.Image:
    """比べる画面の真ん中の DPS の箱 (165 → 202 (+22%)) を札に."""
    box = Image.open(COMPARE).convert("RGBA").crop((700, 90, 1222, 272))
    return shadowed(fit(box, 470, 170), 8, 120)


def main() -> None:
    for variant in ("1", "2"):
        canvas = base_canvas(variant)
        z = scream()
        # 顔から胸までを大きく: 上から 58% を切り出して、高さ 980 に (下と右は画面の外へ)
        bust = z.crop((0, 0, z.width, int(z.height * 0.58)))
        bust = bust.resize((int(bust.width * 980 / bust.height), 980), Image.Resampling.LANCZOS)
        canvas.alpha_composite(bust, (W - int(bust.width * 0.61), -60))
        small = variant == "2"  # 札を置く分だけ文字を詰める
        top = fit(
            render_telop("textstyle032", "アクト、", 1.5), TEXT_RIGHT - 40, 118 if small else 150
        )
        main_w = fit(
            render_telop("textstyle025", "ムズすぎ！", 2.2), TEXT_RIGHT - 30, 205 if small else 250
        )
        sub1 = fit(
            render_telop("textstyle010", "火力は武器", 1.3), TEXT_RIGHT - 60, 92 if small else 120
        )
        sub2 = fit(
            render_telop("textstyle100", "防御は耐性", 1.3), TEXT_RIGHT - 60, 92 if small else 120
        )
        y = 16 if small else 30
        for im, x in ((top, 40), (main_w, 20), (sub1, 60), (sub2, 60)):
            canvas.alpha_composite(im, (x, y))
            y += im.height + 4
        if variant == "2":
            card = dps_card()
            assert y <= H - card.height + 14, f"札が文字に被る (文字の下端 {y})"
            canvas.alpha_composite(card, (20, H - card.height + 10))
        out = OUT.with_name(OUT.stem + f"_{variant}.jpg")
        canvas.convert("RGB").save(out, quality=92)
        print(out)  # noqa: T201 — 手で回すスクリプトの出力先


def weapon_card(box: tuple[int, int, int, int], h: int) -> Image.Image:
    """比べる画面から武器のカードだけ切り出す (A = 今の装備、B = 入れ替える物)."""
    card = Image.open(COMPARE).convert("RGBA").crop(box)
    card = card.resize((int(card.width * h / card.height), h), Image.Resampling.LANCZOS)
    return shadowed(card, 10, 130)


def arrow(w: int, h: int) -> Image.Image:
    """「こっちに替えよう」の太い矢印 (赤、白縁 + 影)."""
    im = Image.new("RGBA", (w + 40, h + 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    body = h // 3
    pts = [
        (20, 20 + body),
        (20 + w * 0.55, 20 + body),
        (20 + w * 0.55, 20),
        (20 + w, 20 + h // 2),
        (20 + w * 0.55, 20 + h),
        (20 + w * 0.55, 20 + h - body),
        (20, 20 + h - body),
    ]
    d.polygon(pts, fill=(255, 255, 255, 255))
    inner = Image.new("RGBA", im.size, (0, 0, 0, 0))
    k = 0.8
    cx, cy = 20 + w / 2, 20 + h / 2
    ImageDraw.Draw(inner).polygon(
        [(cx + (x - cx) * k, cy + (y - cy) * k) for x, y in pts], fill=(222, 38, 38, 255)
    )
    im.alpha_composite(inner)
    return shadowed(im, 6, 140)


def weapons_only() -> None:
    """案 3: 文字なし。武器のカード 2 枚 + 矢印 + 嘆くずんだもん (kyohei 2026-09-30)."""
    canvas = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    a_card = weapon_card((18, 72, 674, 884), 500)
    b_card = weapon_card((1246, 72, 1904, 884), 500)
    gap = 120  # 矢印を置く間 (カードの文字に被せない)
    y = (H - a_card.height) // 2
    canvas.alpha_composite(a_card, (-20, y))
    bx = -20 + a_card.width - 60 + gap
    canvas.alpha_composite(b_card, (bx, y))
    ar = arrow(110, 130)
    canvas.alpha_composite(ar, (bx - gap - ar.width // 2 + 70, (H - ar.height) // 2))
    z = scream(one_arm=True)
    bust = z.crop((0, 0, z.width, int(z.height * 0.58)))
    bust = bust.resize((int(bust.width * 900 / bust.height), 900), Image.Resampling.LANCZOS)
    # 顔が全部見える所まで左へ。右のカードの余白 (文字の無い右端) にだけ少しかかる
    canvas.alpha_composite(bust, (bx + b_card.width - 300, -10))
    out = OUT.with_name(OUT.stem + "_3.jpg")
    canvas.convert("RGB").save(out, quality=92)
    print(out)  # noqa: T201 — 手で回すスクリプトの出力先


if __name__ == "__main__":
    main()
    weapons_only()
