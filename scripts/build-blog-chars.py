"""build-blog-chars.py — ブログのキャラの吹き出し用の顔の絵を書き出す (2026-10-22、一度だけ回して src/data/blog/chars/ に置く)。

立ち絵は動画の側 (video/src/poe2tube/render/tachie.py) と同じ PSD・同じレイヤーの選び方 (SPECS・_apply・_select) を借りて描く (動画のキャッシュには書かない)。
顔の周りを四角に切り、256px の webp にする。絵は坂本アヒル氏の立ち絵素材 (四国めたん・ずんだもん、readme の規約どおり自由に利用可、クレジット任意)。

    video/.venv/Scripts/python scripts/build-blog-chars.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "video" / "src"))
from psd_tools import PSDImage  # noqa: E402
from PIL import Image  # noqa: E402
from poe2tube.render.tachie import SPECS, _apply, _select  # noqa: E402

OUT = ROOT / "src" / "data" / "blog" / "chars"
OUT.mkdir(parents=True, exist_ok=True)
EMOTIONS = ("normal", "happy", "surprised", "troubled")
# 顔の切り抜き (絵の幅に対する割合: 四角の真ん中の x, 上の y, 一辺)。キャラごとに目で合わせた
CROP = {"zundamon": (0.50, 0.03, 0.78), "metan": (0.45, 0.02, 0.70)}

for who, spec in SPECS.items():
    for emo in EMOTIONS:
        psd = PSDImage.open(spec.psd)
        _apply(psd, spec.fixed)
        _apply(psd, spec.emotions[emo])
        _select(psd, spec.mouth_group, spec.closed_mouth.get(emo, spec.mouths[0]))
        img = psd.composite(force=True).convert("RGBA")
        bbox = img.getbbox()
        img = img.crop(bbox)
        cx, t, s = CROP[who]
        side = int(img.width * s)
        x0 = int(img.width * cx - side / 2)
        y0 = int(img.width * t)
        face = img.crop((x0, y0, x0 + side, y0 + side)).resize((256, 256), Image.Resampling.LANCZOS)
        face.save(OUT / f"{who}-{emo}.webp", "WEBP", quality=88)
        print(who, emo, img.size, "->", OUT / f"{who}-{emo}.webp")
