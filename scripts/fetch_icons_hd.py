"""サムネ用の大きいアイコン (ゲームの元の絵、108px) を poe2db から assets/icons_hd/<key>.png に.

    python scripts/fetch_icons_hd.py OmenofSanctification rib

kyohei 2026-10-04「サムネはでっかくアイコンを数種類並べる」。poe2scout のアイコン (assets/icons) は
64px で、大きく並べるとぼやける。poe2db の英語のページ (英語名の空白を _ に) にある
cdn.poe2db.tw/image/Art/2DItems/… の絵を使う。既にある物は取り直さない。
"""

from __future__ import annotations

import io
import re
import sys
from pathlib import Path

import requests
import structlog
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poe2tube.names import NameBook  # noqa: E402

log = structlog.get_logger()
OUT = ROOT / "assets" / "icons_hd"
UA = {"User-Agent": "POE2Tube/0.1 (thumbnail icons; contact: nekodori0612@gmail.com)"}
ART = re.compile(r"https://cdn\.poe2db\.tw/image/Art/2DItems/[^\"']+?\.webp")


def fetch(keys: list[str]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    book = NameBook.load()
    with requests.Session() as s:
        for key in keys:
            dst = OUT / f"{key}.png"
            if dst.exists():
                continue
            page = f"https://poe2db.tw/us/{book.names[key].en.replace(' ', '_')}"
            m = ART.search(s.get(page, headers=UA, timeout=30).text)
            if not m:
                log.warning("art not found on poe2db", key=key, page=page)
                continue
            img = s.get(m.group(0), headers=UA, timeout=30)
            img.raise_for_status()
            Image.open(io.BytesIO(img.content)).convert("RGBA").save(dst)
            log.info("hd icon saved", key=key, url=m.group(0))


if __name__ == "__main__":
    fetch(sys.argv[1:])
