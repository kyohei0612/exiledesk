"""サムネの土台 (列の形): end_craft_materials_2 (後編: お告げと骨).

kyohei 2026-10-04: 参考 (無職転生の総集編のサムネ) のように、背景を列に割って
「絵 + 色の帯の名前 + 説明」を大きく置き、手前にずんだもんを被せる。
下の大きな題は kyohei が入れるので空けておく。
帯の名前と説明は _facts.md の言葉 (高貴のお告げ・冒涜・発現・聖別)。

- d: ずんだもんを左の 2 列の境目に被せる (参考と同じ)
- e: 4 列を左の 3/4 に詰め、右の 1/4 にずんだもん (列の文字を全部見せる)

    python scripts/thumbs/end_craft_materials_2_panels.py [--variant d|e|all] [--zundamon 絵.png]

``--zundamon`` に生成 AI で作った絵を渡すと、背景の色を抜いて手前に置く (kyohei 2026-10-04
「頭を抱えるずんだもんはバナナで生成、背景グリーンバックで素材を色々」)。無ければ PSD から組んだ物。
ずんだもんは髪も服も緑なので**ブルーバック** (緑で抜くと体が透ける)、めたんはグリーンバック。
"""

from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path

import structlog
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from defence_mechanics import H, W, background, fit  # noqa: E402
from end_craft_materials_2 import PICK_SHOT, bust, glow, icon, zundamon_hold  # noqa: E402

from poe2tube.render.palette import font  # noqa: E402

# (絵, 帯の名前, 説明, 帯の色)。絵はアイコンのキー (assets/icons_hd にあれば大きい方) か
# "pick" (発現の実画面)。kyohei 2026-10-04「でっかくアイコンを数種類並べる」→ 全部アイコン
COLUMNS = [
    # kyohei 2026-10-04「お告げは最上位、紫・古代・光、聖別と勢力は OK」「名前の下には分かりやすい
    # 解説文、長ったらしく」。[..] は赤、| で改行。言葉は _facts.md (後編) の範囲
    (
        "OmenofGreaterExaltation",
        "偉大なる高貴",
        "次の高貴な|オーブで、|MOD が一気に|[2 個]付く",
        (214, 150, 20),
    ),
    (
        "OmenofWhittling",
        "削減",
        "次のカオス|オーブで、|[一番レベルの|低い MOD]が|消える",
        (140, 50, 200),
    ),
    (
        "rib_ancient",
        "古代の骨",
        "冒涜で付く|MOD が、|[レベル 40|以上]の物|だけになる",
        (40, 90, 214),
    ),
    ("OmenofLight", "光", "次の消去の|オーブで、|[冒涜の MOD|だけ]を消す", (30, 150, 90)),
    ("OmenoftheLiege", "勢力", "武器と宝飾品|に、勢力の|MOD が|[必ず 1 つ]付く", (214, 40, 40)),
    (
        "OmenofSanctification",
        "聖別",
        "神のオーブで|数値が[上下]|する。その後は|[クラフト|できない]",
        (200, 120, 40),
    ),
]
HD = ROOT / "assets" / "icons_hd"
LABELS = True  # --no-labels で絵だけ
BAND_Y, BAND_H = 330, 84  # 色の帯 (アイコンの欄は真ん中の少し上まで、kyohei 2026-10-04)
DESC_H = 230  # 帯の下の解説文 (欄の幅で折り返す)
RED = (255, 70, 70)


def pick_crop(w: int, h: int) -> Image.Image:
    """発現の小窓の、カーソルが乗って光った候補のあたりを列の大きさに切り出す."""
    shot = Image.open(PICK_SHOT).convert("RGBA")
    box = (400, 630, 900, 900)  # 1 行目の候補 + カーソル (1920x1080 の撮影)
    im = shot.crop(box)
    k = max(w / im.width, h / im.height)
    im = im.resize((int(im.width * k), int(im.height * k)), Image.Resampling.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def column(
    key: str, name: str, desc: str, color: tuple[int, int, int], w: int, rng: random.Random
) -> Image.Image:
    COL_W = w  # noqa: N806
    col = background(rng).crop((0, 0, COL_W, H))
    tint = Image.new("RGBA", (COL_W, H), (*color, 60))
    col.alpha_composite(tint)
    if key == "pick":
        col.alpha_composite(pick_crop(COL_W, BAND_Y), (0, 0))
    else:
        size = min(BAND_Y - 20, COL_W - 6)
        hd = HD / f"{key}.png"
        art = fit(Image.open(hd).convert("RGBA"), size, size) if hd.exists() else icon(key, size)
        im = glow(art, (255, 240, 200), 16)
        col.alpha_composite(im, ((COL_W - im.width) // 2, (BAND_Y - im.height) // 2 + 6))
    d = ImageDraw.Draw(col)
    if not LABELS:
        shade = Image.new("RGBA", (COL_W, H - BAND_Y), (0, 0, 0, 120))
        col.alpha_composite(shade, (0, BAND_Y))
        return col
    d.rectangle((0, BAND_Y, COL_W, BAND_Y + BAND_H), fill=(*color, 255))
    size = 64
    while d.textlength(name, font=font(size)) > COL_W - 20:
        size -= 2
    d.text(
        (COL_W // 2, BAND_Y + BAND_H // 2),
        name,
        font=font(size),
        fill="white",
        anchor="mm",
        stroke_width=4,
        stroke_fill=(20, 10, 10),
    )
    y0 = BAND_Y + BAND_H
    d.rectangle((0, y0, COL_W, y0 + DESC_H), fill=(18, 16, 30, 235))
    rich_lines(d, desc, COL_W, y0, DESC_H)
    # 下は題のために暗く沈める
    shade = Image.new("RGBA", (COL_W, H - y0 - DESC_H), (0, 0, 0, 150))
    col.alpha_composite(shade, (0, y0 + DESC_H))
    return col


def _lines(text: str) -> list[list[tuple[str, bool]]]:
    """| で行に分け、[..] の赤を行をまたいでも保つ."""
    out: list[list[tuple[str, bool]]] = []
    red = False
    for raw in text.split("|"):
        ln: list[tuple[str, bool]] = []
        for ch in raw:
            if ch in "[]":
                red = ch == "["
                continue
            ln.append((ch, red))
        out.append(ln)
    return out


def desc_size(d: ImageDraw.ImageDraw, w: int) -> int:
    """全部の列の解説文が収まる、そろった文字の大きさ."""
    size = 36
    while any(
        sum(d.textlength(ch, font=font(size)) for ch, _ in ln) > w - 14
        for _, _, text, _ in COLUMNS
        for ln in _lines(text)
    ):
        size -= 1
    return size


def rich_lines(d: ImageDraw.ImageDraw, text: str, w: int, y0: int, h: int) -> None:
    """解説文を上下の真ん中に。[..] は赤."""
    size = desc_size(d, w)
    f = font(size)
    lines = _lines(text)
    step = size * 1.42
    y = y0 + (h - step * len(lines)) / 2 + step / 2
    for ln in lines:
        x = (w - sum(d.textlength(ch, font=f) for ch, _ in ln)) / 2
        for ch, red in ln:
            d.text(
                (x, y),
                ch,
                font=f,
                fill=RED if red else "white",
                anchor="lm",
                stroke_width=2 if red else 0,
                stroke_fill=(40, 0, 0),
            )
            x += d.textlength(ch, font=f)
        y += step


def panels(rng: random.Random, width: int) -> Image.Image:
    """左から width の幅に列を並べる (残りは暗い地)."""
    canvas = background(rng)
    canvas.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, 120)))
    cw = width // len(COLUMNS)
    for i, (key, name, desc, color) in enumerate(COLUMNS):
        canvas.alpha_composite(column(key, name, desc, color, cw, rng), (i * cw, 0))
        if i:
            ImageDraw.Draw(canvas).line([(i * cw, 0), (i * cw, H)], fill="white", width=4)
    return canvas


ZUNDAMON_ART: Path | None = None  # --zundamon で差し替え


def chroma_key(path: Path, key: str = "blue") -> Image.Image:
    """ブルーバック (key="blue") かグリーンバック ("green") の背景を抜く (縁の色かぶりも抑える)."""
    im = Image.open(path).convert("RGBA")
    px = im.load()
    assert px is not None
    k = 2 if key == "blue" else 1
    for y in range(im.height):
        for x in range(im.width):
            c = list(px[x, y])
            others = max(c[i] for i in range(3) if i != k)
            excess = c[k] - others
            if excess > 60:
                px[x, y] = (c[0], c[1], c[2], 0)
            elif excess > 0:  # 縁: 半透明にして背景の色を引く
                c[k] = others
                px[x, y] = (c[0], c[1], c[2], 255 - excess * 4)
    return im.crop(im.getbbox())


def with_zundamon(canvas: Image.Image, cx: int, max_w: int) -> Image.Image:
    art = chroma_key(ZUNDAMON_ART) if ZUNDAMON_ART else bust(zundamon_hold(), 0.62)
    z = fit(art, max_w, 640)
    z = glow(z, (255, 255, 255), 6)  # 白い縁で背景から浮かせる
    canvas.alpha_composite(z, (cx - z.width // 2, H - z.height + 40))
    return canvas


def variant_d(rng: random.Random) -> Image.Image:
    return with_zundamon(panels(rng, W), W // 4, 560)


def variant_e(rng: random.Random) -> Image.Image:
    width = W * 3 // 4
    return with_zundamon(panels(rng, width), width + (W - width) // 2 - 20, 480)


def variant_f(rng: random.Random) -> Image.Image:
    """背景だけ (ずんだもんは後で生成した物を被せる)."""
    return panels(rng, W)


VARIANTS = {"d": variant_d, "e": variant_e, "f": variant_f}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", default="all", choices=[*VARIANTS, "all"])
    ap.add_argument("--seed", type=int, default=20261004)
    ap.add_argument("--zundamon", type=Path, default=None, help="グリーンバックのずんだもん")
    ap.add_argument("--no-labels", action="store_true", help="帯の名前と説明を入れない")
    a = ap.parse_args()
    global ZUNDAMON_ART, LABELS
    ZUNDAMON_ART = a.zundamon
    LABELS = not a.no_labels
    for k in VARIANTS if a.variant == "all" else [a.variant]:
        tail = "" if LABELS else "_plain"
        out = ROOT / "output" / f"end_craft_materials_2_thumb_base_{k}{tail}.jpg"
        VARIANTS[k](random.Random(a.seed)).filter(ImageFilter.SHARPEN).convert("RGB").save(
            out, quality=92
        )
        structlog.get_logger().info("thumbnail base written", path=str(out))


if __name__ == "__main__":
    main()
