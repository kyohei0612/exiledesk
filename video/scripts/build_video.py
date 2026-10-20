"""台本 JSON から mp4 を作る.

python scripts/build_video.py data/scripts/test_1min_craft_intro.json [--keep-frames]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poe2tube.video.build import build_video  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("script", type=Path)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--keep-frames", action="store_true")
    a = ap.parse_args()
    build_video(a.script, a.out, a.keep_frames)


if __name__ == "__main__":
    main()
