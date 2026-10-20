"""章ごとの動画 (1080p、その章の音入り) を作る。確認はこの動画で、最後は build_video がつなぐだけ.

    python scripts/build_chapter.py data/scripts/<name>.json            # 無い・古い章を全部
    python scripts/build_chapter.py data/scripts/<name>.json --only 3   # 3 章目だけ (0 始まり)

台本を章ごとに書いている間は、data/scripts/<name>.json に「OK になった章まで」を入れ、
``planned_sections`` (構成表の章の数) を書いておく (進み具合のバーが後で変わらないように)。
出来た動画は output/work/<name>/chapters/section_NN.mp4。中身が変わっていない章は作り直さない。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import structlog  # noqa: E402

from poe2tube.video.build import build_chapters  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("script", type=Path)
    ap.add_argument("--only", type=int, nargs="*", default=None, help="作る章 (0 始まり)")
    a = ap.parse_args()
    for path in build_chapters(a.script, a.only):
        structlog.get_logger().info("chapter ready", path=str(path))


if __name__ == "__main__":
    main()
