"""サムネの土台: socketables (差すとクラフトの決まりが変わるルーン).

解説系の基本の形 (kyohei 2026-10-04、end_craft_materials_2_panels.py の案 g): 大きいアイコンの列
+ 色の帯の名前 + びっしりの解説文 (強調は赤) + 真ん中に大きなめたん。列の中身だけこの回に替える。
題は kyohei が入れる。

    python scripts/thumbs/socketables.py [--zunda]
"""

from __future__ import annotations

import random
import sys
from pathlib import Path

import structlog
from PIL import ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))

import end_craft_materials_2_panels as base  # noqa: E402

# (アイコンのファイル名, 帯の名前, 解説文, 帯の色)。
# 言葉は _facts.md の「ソケット品」「クラフトの決まりを変えるソケット品」
base.COLUMNS = [
    (
        "artificer",
        "熟練工",
        "防具と武器に[ソケットを1個]足す胴と両手武器は[2個]まで",
        (120, 120, 130),
    ),
    (
        "rune__Serle's Triumph",
        "セール",
        "差すと[サフィックスが4つ]まで付くプレフィックスは3つのまま[外せない]",
        (214, 40, 40),
    ),
    (
        "rune__Astrid's Creativity",
        "アストリッド",
        "[クラフトMODを2つ]持てるエッセンスを2つ付けられる[コラプト品は不可]",
        (40, 90, 214),
    ),
    (
        "rune__Kolr's Hunt",
        "コルの狩り",
        "手袋に差すと[マークスマンMOD]が抽選に加わる差したら[替えられない]",
        (30, 150, 90),
    ),
    (
        "rune__Passion of Aldur",
        "アルダー",
        "武器の冷気と雷のMODを[火に変える]後から付けたMODは[変わらない]",
        (214, 150, 20),
    ),
    (
        "rune__Legacy of Blackbraid",
        "遺産",
        "ユニークを壊して作る[元の効果の一部]を持つ[コラプト品にも差せる]",
        (140, 50, 200),
    ),
]


def main() -> None:
    out = base.ROOT / "output" / "socketables_thumb_base.jpg"
    img = base.variant_g(random.Random(20261005)).filter(ImageFilter.SHARPEN)
    img.convert("RGB").save(out, quality=92)
    structlog.get_logger().info("thumbnail base written", path=str(out))


# ずんだもんの 3 パターン (kyohei 2026-10-05「ずんだもん使うか、パターン 3 つ」)。PSD の組み合わせ
ZUNDA_POSES = {
    "z1": [  # 驚き: 両手を挙げて目を丸く
        ("!右腕", "*手を挙げる"),
        ("!左腕", "*手を挙げる"),
        ("!顔色", "*ほっぺ赤め"),
        ("!枝豆", "*枝豆立ち"),
        ("!眉", "*上がり眉"),
        ("!目", "*〇〇"),
        ("!口", "*うわー"),
    ],
    "z2": [  # 指差し: 得意げ
        ("!右腕", "*指差し横"),
        ("!左腕", "*腰"),
        ("!顔色", "*ほっぺ基本"),
        ("!枝豆", "*枝豆通常"),
        ("!眉", "*基本眉"),
        ("!目", "*^^"),
        ("!口", "*にやり"),
    ],
    "z3": [  # 腕組み: ジト目
        ("!右腕", "*(非表示)"),
        ("!左腕", "*腕組み(右腕は非表示に)"),
        ("!顔色", "*ほっぺ基本"),
        ("!枝豆", "*枝豆通常"),
        ("!眉", "*怒り眉"),
        ("!目", "*ジト目"),
        ("!口", "*むふ"),
    ],
}


def zundamon(pose: str) -> base.Image.Image:
    from psd_tools import PSDImage

    from poe2tube.render.tachie import ZUNDAMON, _apply

    path = base.ROOT / "cache" / "thumb" / f"zundamon_{pose}.png"
    if path.exists():
        return base.Image.open(path).convert("RGBA")
    psd = PSDImage.open(ZUNDAMON.psd)
    _apply(psd, ZUNDA_POSES[pose])
    im = psd.composite(force=True).convert("RGBA")
    im = im.crop(im.getbbox())
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path)
    return im


def zunda_variants() -> None:
    for pose in ZUNDA_POSES:
        canvas = base.panels(random.Random(20261005), base.W)
        z = base.fit(base.bust(zundamon(pose), 0.6), 760, 760)
        z = base.glow(z, (255, 255, 255), 7)
        canvas.alpha_composite(z, ((base.W - z.width) // 2, base.H - z.height + 30))
        out = base.ROOT / "output" / f"socketables_thumb_base_{pose}.jpg"
        canvas.filter(ImageFilter.SHARPEN).convert("RGB").save(out, quality=92)
        structlog.get_logger().info("thumbnail base written", path=str(out))


if __name__ == "__main__":
    if "--zunda" in sys.argv:
        zunda_variants()
    else:
        main()
