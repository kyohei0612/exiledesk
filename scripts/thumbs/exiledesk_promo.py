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
from PIL import ImageFilter

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


def main() -> None:
    out = base.ROOT / "output" / "exiledesk_promo_thumb_base.jpg"
    img = base.variant_g(random.Random(20261012)).filter(ImageFilter.SHARPEN)
    img.convert("RGB").save(out, quality=92)
    structlog.get_logger().info("thumbnail base written", path=str(out))


if __name__ == "__main__":
    main()
