"""チャンネル設定 (data/channel/chocobanana.json) を YouTube に反映する.

    python scripts/apply_channel.py            # やる事を表示するだけ (dry-run)
    python scripts/apply_channel.py --execute  # 反映する

接続先のチャンネル名が設定の expected_title と違えば、何もしないで止まる。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import structlog

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poe2tube.config.settings import get_settings  # noqa: E402
from poe2tube.publish.channel import apply_profile, load_profile  # noqa: E402
from poe2tube.publish.youtube import build_service, publish_lock  # noqa: E402

log = structlog.get_logger()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", type=Path, default=None)
    ap.add_argument("--execute", action="store_true", help="付けた時だけ YouTube に書き込む")
    a = ap.parse_args()
    profile = load_profile(a.profile or get_settings().channel_profile)
    service = build_service()
    with publish_lock():
        actions = apply_profile(service, profile, execute=a.execute)
    for act in actions:
        log.info("done" if a.execute else "plan", action=str(act))
    if not a.execute:
        log.info("dry-run でした。反映するなら --execute を付けて実行")


if __name__ == "__main__":
    main()
