"""カレンシーのアイコンを poe2scout から 1 回だけ取得して assets/icons/<key>.png にキャッシュする.

    python scripts/fetch_icons.py transmute augment regal exalt

ExileDesk のカレンシーランキングと同じ出どころ (poe2scout /Items の IconUrl)。
既にある物は取り直さない。
英語名 (NameBook の en) で /Items の Text と突き合わせる。
"""

from __future__ import annotations

import sys
from pathlib import Path

import requests
import structlog

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poe2tube.names import NameBook  # noqa: E402

log = structlog.get_logger()
BASE = "https://api.poe2scout.com/poe2"
ICON_DIR = ROOT / "assets" / "icons"
UA = {"User-Agent": "POE2Tube/0.1 (icon cache; contact: nekodori0612@gmail.com)"}


def current_league(session: requests.Session) -> str:
    leagues = session.get(f"{BASE}/Leagues", headers=UA, timeout=20).json()
    current = [x["Value"] for x in leagues if x.get("IsCurrent")]
    return str(current[0] if current else leagues[0]["Value"])


def fetch(keys: list[str]) -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    book = NameBook.load()
    todo = {k: book.names[k].en for k in keys if not (ICON_DIR / f"{k}.png").exists()}
    if not todo:
        log.info("all icons cached", keys=keys)
        return
    with requests.Session() as s:
        league = current_league(s)
        items = s.get(f"{BASE}/Leagues/{league}/Items", headers=UA, timeout=30).json()
        by_text = {it["Text"]: it["IconUrl"] for it in items if it.get("IconUrl")}
        for key, en in todo.items():
            url = by_text.get(en)
            if not url:
                log.warning("icon not found in poe2scout", key=key, en=en)
                continue
            img = s.get(url, headers=UA, timeout=30)
            img.raise_for_status()
            (ICON_DIR / f"{key}.png").write_bytes(img.content)
            log.info("icon saved", key=key, bytes=len(img.content), url=url)


if __name__ == "__main__":
    fetch(sys.argv[1:] or ["transmute", "augment", "regal", "exalt"])
