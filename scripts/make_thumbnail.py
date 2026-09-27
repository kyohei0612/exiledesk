"""サムネイルを作る.

    python scripts/make_thumbnail.py --top "最初から知りたかった" --main "クラフト入門" \
        --badges 変成 増強 王者 高貴 --bg cache/stage/<hash>/step_6.png --out output/thumb.png
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import structlog

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poe2tube.render.thumbnail import ThumbnailSpec, render_thumbnail  # noqa: E402

log = structlog.get_logger()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", required=True)
    ap.add_argument("--main", required=True)
    ap.add_argument("--corner", default="初心者必見！")
    ap.add_argument("--badges", nargs="*", default=[])
    ap.add_argument("--bg", type=Path, default=None)
    ap.add_argument("--out", type=Path, default=ROOT / "output" / "thumbnail.png")
    a = ap.parse_args()
    spec = ThumbnailSpec(top=a.top, main=a.main, corner=a.corner, badges=a.badges, background=a.bg)
    img = render_thumbnail(spec)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(a.out, quality=92)
    log.info("thumbnail written", path=str(a.out))


if __name__ == "__main__":
    main()
