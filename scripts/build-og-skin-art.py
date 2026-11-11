"""build-og-skin-art.py — デイリーのシェアのカード (server/web/daily-card.js、設計図 D-38) の飾りの絵と皮の数字を作る (2026-11-11)

python scripts/build-og-skin-art.py
- オーナー 11-11「ＰＯＥ２の雰囲気壊さないようにしてくれ」「３で真ん中かな」「見た目おｋ」: ゲームの UI の絵 (public/ui-art、クライアントから取り出した物) をカードの大きさで先に組む
  - _ui-card-frame.png … 面の枠 (frame = loadingscreenborder、画面の .g-panel と同じ 76 の切り方) を 1200×630 に。角は 0.62 倍、辺は並べる (引き伸ばさない)
  - _ui-frame-s.png    … 品の枠 (item-frame) を 9 分割で 124×124 に
  - _ui-head-l.png・_ui-head-r.png … 像の付いた見出し (head-l / head-r) を 0.85 倍に (費用・完成率の札)
  - _ui-divider.png    … 区切りの線 (元の大きさ)
  - _ui-title-c.png    … お題の札 (元の大きさ)
  - _ui-stone.jpg      … 暗い石の地 (決まった種の粒。毎回同じ)
- 皮の表 (src/views/daily/skin/skin.ts の SKINS) を server/web/daily-skins.json に写す (カードの地をシェアした人の皮の色で暗く染める)
"""
import json
import os
import re
import subprocess
import tempfile

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "og-art")


def webp(name):
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "x.png")
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", os.path.join(ROOT, "public", "ui-art", name + ".webp"), p], check=True)
        return Image.open(p).convert("RGBA").copy()


def skins():
    src = open(os.path.join(ROOT, "src", "views", "daily", "skin", "skin.ts"), encoding="utf-8").read()
    rows = re.findall(r'\{ id: "(\w+)",[^}]*?h: ([\d.]+), s: ([\d.]+), d: ([\d.]+), g: ([\d.]+), a: ([\d.]+), f: ([\d.]+) \}', src)
    return {r[0]: dict(zip("hsdgaf", map(float, r[1:]))) for r in rows}


def nine(im, w, h, c):
    """9 分割: 角は元のまま、上下の辺は横だけ・左右の辺は縦だけ伸ばす。中は透明"""
    sw, sh = im.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    box = lambda x0, y0, x1, y1: im.crop((x0, y0, x1, y1))
    out.paste(box(0, 0, c, c), (0, 0))
    out.paste(box(sw - c, 0, sw, c), (w - c, 0))
    out.paste(box(0, sh - c, c, sh), (0, h - c))
    out.paste(box(sw - c, sh - c, sw, sh), (w - c, h - c))
    out.paste(box(c, 0, sw - c, c).resize((w - 2 * c, c), Image.LANCZOS), (c, 0))
    out.paste(box(c, sh - c, sw - c, sh).resize((w - 2 * c, c), Image.LANCZOS), (c, h - c))
    out.paste(box(0, c, c, sh - c).resize((c, h - 2 * c), Image.LANCZOS), (0, c))
    out.paste(box(sw - c, c, sw, sh - c).resize((c, h - 2 * c), Image.LANCZOS), (w - c, c))
    return out


def tiled_nine(im, w, h, c, k):
    """面の枠。角は k 倍、辺は k 倍にして並べる (CSS の round と同じく引き伸ばさない)"""
    sw, sh = im.size
    ck = round(c * k)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    def piece(b, size):
        return im.crop(b).resize(size, Image.LANCZOS)

    for (bx, by, ox, oy) in [(0, 0, 0, 0), (sw - c, 0, w - ck, 0), (0, sh - c, 0, h - ck), (sw - c, sh - c, w - ck, h - ck)]:
        out.paste(piece((bx, by, bx + c, by + c), (ck, ck)), (ox, oy))
    ew = round((sw - 2 * c) * k)
    top, bot = piece((c, 0, sw - c, c), (ew, ck)), piece((c, sh - c, sw - c, sh), (ew, ck))
    n = max(1, round((w - 2 * ck) / ew)); tw = (w - 2 * ck) / n
    for i in range(n):
        x = ck + round(i * tw); ww = ck + round((i + 1) * tw) - x
        out.paste(top.resize((ww, ck), Image.LANCZOS), (x, 0)); out.paste(bot.resize((ww, ck), Image.LANCZOS), (x, h - ck))
    eh = round((sh - 2 * c) * k)
    left, right = piece((0, c, c, sh - c), (ck, eh)), piece((sw - c, c, sw, sh - c), (ck, eh))
    n = max(1, round((h - 2 * ck) / eh)); th = (h - 2 * ck) / n
    for i in range(n):
        y = ck + round(i * th); hh = ck + round((i + 1) * th) - y
        out.paste(left.resize((ck, hh), Image.LANCZOS), (0, y)); out.paste(right.resize((ck, hh), Image.LANCZOS), (w - ck, y))
    return out


def stone(w, h):
    """暗い石の地 (ゲームの面の地の色に、ぼかした粒を重ねる。決まった種で毎回同じ)"""
    rng = np.random.default_rng(20261111)
    acc = np.zeros((h, w))
    for s, amp in [(8, 1.0), (24, 0.6), (80, 0.35)]:
        small = rng.random((h // s + 2, w // s + 2))
        acc += amp * np.asarray(Image.fromarray((small * 255).astype(np.uint8)).resize((w + 2 * s, h + 2 * s), Image.BICUBIC))[s:s + h, s:s + w] / 255
    acc = (acc - acc.min()) / (acc.max() - acc.min())
    yy, xx = np.mgrid[0:h, 0:w]
    vig = 1 - 0.55 * (((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2) ** 0.8
    base = np.array([22, 18, 14]) / 255
    rgb = base[None, None, :] * (0.75 + 0.5 * acc[..., None]) * vig[..., None]
    return Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8))


def main():
    tiled_nine(webp("frame"), 1200, 630, 76, 0.62).save(os.path.join(OUT, "_ui-card-frame.png"), optimize=True)
    nine(webp("item-frame"), 124, 124, 18).save(os.path.join(OUT, "_ui-frame-s.png"), optimize=True)
    webp("head-l").resize((545, 118), Image.LANCZOS).save(os.path.join(OUT, "_ui-head-l.png"), optimize=True)
    webp("head-r").resize((549, 118), Image.LANCZOS).save(os.path.join(OUT, "_ui-head-r.png"), optimize=True)
    webp("divider").save(os.path.join(OUT, "_ui-divider.png"), optimize=True)
    webp("title-c").save(os.path.join(OUT, "_ui-title-c.png"), optimize=True)
    stone(1200, 630).save(os.path.join(OUT, "_ui-stone.jpg"), quality=88)
    table = skins()
    with open(os.path.join(ROOT, "server", "web", "daily-skins.json"), "w", encoding="utf-8") as f:
        json.dump(table, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"カードの飾り 7 枚 → public/og-art、皮 {len(table)} 色 → server/web/daily-skins.json")


main()
