"""上げ済み動画の公開範囲を変える.

python scripts/set_privacy.py <video_id> public            # 表示だけ (dry-run)
python scripts/set_privacy.py <video_id> public --execute  # 即時公開
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import structlog

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poe2tube.config.settings import get_settings  # noqa: E402
from poe2tube.publish.channel import load_profile  # noqa: E402
from poe2tube.publish.youtube import (  # noqa: E402
    build_service,
    publish_lock,
    set_privacy,
    verify_channel,
)

log = structlog.get_logger()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("video_id")
    ap.add_argument("privacy", choices=["private", "unlisted", "public"])
    ap.add_argument("--execute", action="store_true")
    a = ap.parse_args()
    service = build_service()
    with publish_lock():
        verify_channel(service, load_profile(get_settings().channel_profile).expected_title)
        act = set_privacy(service, a.video_id, a.privacy, a.execute)
    log.info("done" if a.execute else "plan", action=str(act), url=f"https://youtu.be/{a.video_id}")


if __name__ == "__main__":
    main()
