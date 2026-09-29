"""撮影用に固定した ExileDesk (~/ExileDesk-stage) を最新のリリースの印に進める (ADR 006).

    python scripts/update_exiledesk.py            # 最新のリリース (v0.1.*) に
    python scripts/update_exiledesk.py v0.1.330   # 決めた印に

固定版の Vite (1430) が動いていたら止めてから進める (古い物を配り続けないように)。
進めた後は撮影のキャッシュが古い見た目のままなので、capture/stage.py の CAPTURE_VER を上げる。
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import structlog

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poe2tube.config.settings import get_settings  # noqa: E402

log = structlog.get_logger()
NOWIN = 0x08000000 if os.name == "nt" else 0
DEV = Path.home() / "ExileDesk"  # 印 (タグ) を持っている本体


def git(cwd: Path, *args: str) -> str:
    r = subprocess.run(
        ["git", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        creationflags=NOWIN,
        check=True,
    )
    return r.stdout.strip()


def latest_tag() -> str:
    tags = git(DEV, "tag", "--list", "v*", "--sort=-v:refname").splitlines()
    if not tags:
        raise SystemExit("ExileDesk にリリースの印 (v*) が無い")
    return tags[0]


def main() -> None:
    stage = get_settings().exiledesk_root
    if stage.resolve() == DEV.resolve():
        raise SystemExit("今は開発版を見る設定 (.env)。固定版に戻してから実行する")
    tag = sys.argv[1] if len(sys.argv) > 1 else latest_tag()
    before = git(stage, "describe", "--tags", "--always")
    git(stage, "checkout", "--detach", tag)
    subprocess.run(
        ["pnpm", "install", "--frozen-lockfile"],
        cwd=stage,
        creationflags=NOWIN,
        check=True,
        shell=os.name == "nt",
    )
    log.info("exiledesk-stage updated", before=before, after=tag, path=str(stage))
    log.info("次: 固定版の Vite (1430) を止めて、capture/stage.py の CAPTURE_VER を上げる")


if __name__ == "__main__":
    main()
