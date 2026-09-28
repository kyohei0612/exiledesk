"""チャンネルバナーを作る → assets/brand/chocobanana_banner_2560x1440.png.

python scripts/make_banner.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import structlog

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poe2tube.render.banner import SAFE, render_banner  # noqa: E402

log = structlog.get_logger()
BRAND = ROOT / "assets" / "brand"


def main() -> None:
    img = render_banner(
        BRAND / "chocobanana_icon_flat_bg.png",
        title="チョコバナナ",
        subtitle="PoE2 初心者向け 解説チャンネル",
        tagline="ずんだもん × 四国めたん で、初心者向けにやさしく解説",
    )
    out = BRAND / "chocobanana_banner_2560x1440.png"
    img.convert("RGB").save(out, optimize=True)
    img.convert("RGB").crop(SAFE).save(BRAND / "chocobanana_banner_safe_preview.png")
    log.info("banner written", path=str(out), kb=out.stat().st_size // 1024)


if __name__ == "__main__":
    main()
