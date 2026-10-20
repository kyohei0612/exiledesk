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

from functools import lru_cache  # noqa: E402

from defence_mechanics import H, W, background, fit  # noqa: E402
from end_craft_materials_2 import (  # noqa: E402
    PICK_SHOT,
    bust,
    glow,
    icon,
    metan_point,
    zundamon_hold,
)
from PIL import ImageFont  # noqa: E402

# 塗りの太い字 (kyohei 2026-10-04「フォントは塗り幅おおきいね、説明も含め」)
HEAVY = Path.home() / "AppData/Local/Microsoft/Windows/Fonts/NotoSansJP-Black.ttf"


@lru_cache(maxsize=64)
def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(HEAVY), size)


# (絵, 帯の名前, 説明, 帯の色)。絵はアイコンのキー (assets/icons_hd にあれば大きい方) か
# "pick" (発現の実画面)。kyohei 2026-10-04「でっかくアイコンを数種類並べる」→ 全部アイコン
COLUMNS = [
    # kyohei 2026-10-04「お告げは最上位、紫・古代・光、聖別と勢力は OK」「名前の下は解説文で
    # びっしり、句読点いらん、横は半分隠れてもいい、下まで書く」。[..] は赤。言葉は _facts.md
    (
        "OmenofGreaterExaltation",
        "偉大なる高貴",
        "次の高貴なオーブで MOD が一気に[2 個]付く 高貴なオーブ 1 回で[MOD 2 個]足せる",
        (214, 150, 20),
    ),
    (
        "OmenofWhittling",
        "削減",
        "次のカオスオーブで[一番レベルの低い MOD]が消える 消える MOD を[狙える]",
        (140, 50, 200),
    ),
    (
        "rib_ancient",
        "古代の骨",
        "冒涜で付く MOD が[レベル 40 以上]の物だけになる 低いレベルの MOD は[出ない]",
        (40, 90, 214),
    ),
    (
        "OmenofLight",
        "光",
        "次の消去のオーブで[冒涜の MOD だけ]を消す ほかの MOD は[消えない]",
        (30, 150, 90),
    ),
    (
        "OmenoftheLiege",
        "勢力",
        "武器と宝飾品に勢力の MOD が[必ず 1 つ]付く 君主なら[アマナム]の MOD 防具には効かない",
        (214, 40, 40),
    ),
    (
        "OmenofSanctification",
        "聖別",
        "神のオーブで数値が[0.78〜1.22 倍]に上下 元の上限も超える その後は[クラフトできない]",
        (200, 120, 40),
    ),
]
HD = ROOT / "assets" / "icons_hd"
LABELS = True  # --no-labels で絵だけ
BAND_Y, BAND_H = 330, 84  # 色の帯 (アイコンの欄は真ん中の少し上まで、kyohei 2026-10-04)
DESC_H = 720 - 330 - 84  # 帯の下の解説文: 下の端まで、字は欄ぎりぎり (kyohei「下の説明はつめつめ」)
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
        stroke_width=6,
        stroke_fill=(15, 8, 8),
    )
    y0 = BAND_Y + BAND_H
    d.rectangle((0, y0, COL_W, y0 + DESC_H), fill=(18, 16, 30, 235))
    rich_lines(d, desc, COL_W, y0, DESC_H)
    # 下は題のために暗く沈める
    shade = Image.new("RGBA", (COL_W, H - y0 - DESC_H), (0, 0, 0, 150))
    col.alpha_composite(shade, (0, y0 + DESC_H))
    return col


Run = list[tuple[str, bool]]  # (文字, 赤か) の並び


def _tokens(text: str) -> list[Run]:
    """改行してよい単位: 日本語は 1 文字ずつ、英数字 (MOD・40) は切らない。[..] は赤."""
    out: list[Run] = []
    red = False
    for ch in text:
        if ch in "[]":
            red = ch == "["
            continue
        if ch == " ":  # 英数字と日本語の間の空白は詰める (びっしり)
            continue
        if ch.isascii() and out and out[-1][-1][0].isascii():
            out[-1].append((ch, red))
        else:
            out.append([(ch, red)])
    return out


LINE = 1.04  # 解説文の行の間隔 (字の大きさの倍)
DESC_FONT = 50  # 全部の列で同じ大きさ。横は欄から少しはみ出して隠れてよい
OVERFLOW = 1.12  # 欄の幅の何倍まで 1 行に詰めるか (はみ出た分は隣の列に隠れる)


def _wrap_px(d: ImageDraw.ImageDraw, tokens: list[Run], f: object, w: float) -> list[Run]:
    """幅 w (px) で折り返す."""
    lines: list[Run] = [[]]
    width = 0.0
    for tok in tokens:
        tw = sum(d.textlength(c, font=f) for c, _ in tok)  # type: ignore[arg-type]
        if lines[-1] and width + tw > w:
            lines.append([])
            width = 0.0
        lines[-1].extend(tok)
        width += tw
    return lines


def rich_lines(d: ImageDraw.ImageDraw, text: str, w: int, y0: int, h: int) -> None:
    """解説文を上から下までびっしり。横は少しはみ出す。[..] は赤."""
    f = font(DESC_FONT)
    lines = _wrap_px(d, _tokens(text), f, w * OVERFLOW)
    step = DESC_FONT * LINE
    # 1 行目は色の帯のすぐ下から (字の上の余白を測って詰める、kyohei「帯からぎりぎり」)
    top = d.textbbox((0, 0), "冒", font=f, anchor="ls", stroke_width=4)[1]  # 基準線から上の端 (負)
    y = y0 - top + 2
    for ln in lines:
        x = (w - sum(d.textlength(c, font=f) for c, _ in ln)) / 2
        for c, red in ln:
            d.text(
                (x, y),
                c,
                font=f,
                fill=RED if red else "white",
                anchor="ls",
                stroke_width=4,
                stroke_fill=(10, 6, 6),
            )
            x += d.textlength(c, font=f)
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


def variant_g(rng: random.Random) -> Image.Image:
    """背景 (f) の真ん中に大きなめたん (kyohei 2026-10-04「めたんを真ん中にでかく」)."""
    canvas = panels(rng, W)
    m = fit(bust(metan_point(), 0.6), 760, 760)
    m = glow(m, (255, 255, 255), 7)  # 白い縁で背景から浮かせる
    canvas.alpha_composite(m, ((W - m.width) // 2, H - m.height + 30))
    return canvas


VARIANTS = {"d": variant_d, "e": variant_e, "f": variant_f, "g": variant_g}


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
