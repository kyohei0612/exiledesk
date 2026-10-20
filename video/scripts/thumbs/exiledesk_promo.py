"""サムネの土台: exiledesk_promo (無料のクラフトエミュレーター ExileDesk の使い方とテスター募集).

解説系の基本の形 (kyohei 2026-10-04、end_craft_materials_2_panels.py の案 g): 大きいアイコンの列
+ 色の帯の名前 + びっしりの解説文 (強調は赤) + 真ん中に大きなめたん。列の中身だけこの回に替える。
列はエミュレーターでできること (台本の章の順)。題は kyohei が入れる。

    python scripts/thumbs/exiledesk_promo.py
"""

from __future__ import annotations

import random
import sys
from pathlib import Path

import structlog
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))

import end_craft_materials_2_panels as base  # noqa: E402

# (アイコンのファイル名, 帯の名前, 解説文, 帯の色)。言葉は _facts.md の「ExileDesk エミュレーター」
base.COLUMNS = [
    (
        "exalt",
        "打ち放題",
        "本物のオーブは[1個も減らない]ゲームと同じ決まりで[何回でも]打てる",
        (214, 150, 20),
    ),
    (
        "regal",
        "1手戻す",
        "[Rキー]で1つ前に戻る工程の行を押せば[その手まで]戻れる",
        (40, 90, 214),
    ),
    (
        "chaos",
        "付く確率",
        "持つと一覧が[付く確率]に変わるそのオーブで付かないMODは[灰色]",
        (214, 40, 40),
    ),
    (
        "divine",
        "次の手で狙う",
        "欲しいMODの[付きやすい打ち方]と[付くまでの費用]を並べてくれる",
        (30, 150, 90),
    ),
    (
        "collarbone",
        "骨とお告げ",
        "[発現の3択]もアビスの反響の[引き直し]もそのまま試せる",
        (140, 50, 200),
    ),
    (
        "rune__Serle's Triumph",
        "ルーン",
        "[セールの凱旋]を差せば[4つ目のサフィックス]まで試せる",
        (120, 120, 130),
    ),
]


EXILEDESK = Path(r"C:\Users\kyohei\ExileDesk")
ICON = EXILEDESK / "src-tauri" / "icons" / "icon.png"  # アプリのアイコン (後ろ透過)
FONT = EXILEDESK / "public" / "fonts" / "cinzel-600.woff2"  # ロゴ「EXILEDESK」の字体
# ロゴの金のグラデーション (ExileDesk の game-ui.css .g-brand-word と同じ色)
GOLD = [
    (0.0, (255, 243, 207)),
    (0.38, (240, 207, 134)),
    (0.62, (184, 135, 60)),
    (1.0, (122, 83, 32)),
]


def _gold_at(t: float) -> tuple[int, int, int]:
    for (p0, c0), (p1, c1) in zip(GOLD, GOLD[1:], strict=False):
        if p0 <= t <= p1:
            e = (t - p0) / max(1e-6, p1 - p0)
            r, g, b = (int(a + (b2 - a) * e) for a, b2 in zip(c0, c1, strict=True))
            return (r, g, b)
    return GOLD[-1][1]


def gold_text(text: str, size: int) -> Image.Image:
    """金のグラデーション + 濃い縁 + 黒い影のロゴの文字."""
    f = ImageFont.truetype(str(FONT), size)
    x0, y0, x1, y1 = f.getbbox(text, stroke_width=8)
    w, h = x1 - x0 + 40, y1 - y0 + 40
    pos = (20 - x0, 20 - y0)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).text(pos, text, font=f, fill=255)
    edge = Image.new("L", (w, h), 0)
    ImageDraw.Draw(edge).text(pos, text, font=f, fill=255, stroke_width=8)
    grad = Image.new("RGBA", (w, h))
    gd = ImageDraw.Draw(grad)
    for yy in range(h):
        gd.line((0, yy, w, yy), fill=_gold_at(yy / max(1, h - 1)))
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste((0, 0, 0, 255), (6, 6), edge.filter(ImageFilter.GaussianBlur(6)))
    out.paste((40, 22, 6, 255), (0, 0), edge)
    out.paste(grad, (0, 0), mask)
    return out


def variant_logo(rng: random.Random) -> Image.Image:
    """解説系の背景のまま、めたんを左へ、右に ExileDesk のアイコンと名前.

    kyohei 2026-10-12「ExileDesk のアイコンとタイトルバーンって出したい、めたんは左に少し移動」
    「背景はいつもどおり解説系の奴でおk」。題の文字は kyohei が入れる。
    """
    canvas = base.panels(rng, base.W)
    m = base.fit(base.bust(base.metan_point(), 0.6), 720, 720)
    m = base.glow(m, (255, 255, 255), 7)
    canvas.alpha_composite(m, (-40, canvas.height - m.height + 30))
    icon = Image.open(ICON).convert("RGBA").resize((330, 330), Image.Resampling.LANCZOS)
    icon = base.glow(icon, (255, 210, 120), 10)
    cx = canvas.width - 300
    canvas.alpha_composite(icon, (cx - icon.width // 2, 40))
    word = gold_text("EXILEDESK", 120)
    if word.width > 600:
        word = word.resize((600, int(word.height * 600 / word.width)), Image.Resampling.LANCZOS)
    canvas.alpha_composite(word, (cx - word.width // 2, 40 + icon.height - 10))
    return canvas


def main() -> None:
    out = base.ROOT / "output" / "exiledesk_promo_thumb_base.jpg"
    img = base.variant_g(random.Random(20261012)).filter(ImageFilter.SHARPEN)
    img.convert("RGB").save(out, quality=92)
    logo = base.ROOT / "output" / "exiledesk_promo_thumb_logo.jpg"
    img = variant_logo(random.Random(20261012)).filter(ImageFilter.SHARPEN)
    img.convert("RGB").save(logo, quality=92)
    structlog.get_logger().info("thumbnail base written", path=str(out), logo=str(logo))


if __name__ == "__main__":
    main()
