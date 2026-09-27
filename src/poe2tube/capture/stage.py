"""クラフトステージの撮影: 再生モード URL (?stage-plan=…&step=N) を Playwright で開いて PNG にする.

- Vite dev (port 1420) が動いていなければ `pnpm dev` を隠し窓で起動する
- 撮るのは左サイドバーを除いた本体 (clip)。2 倍密度で撮って動画側で縮める
- キャッシュ: cache/stage/<手順のハッシュ>/step_N.png。同じ手順 JSON なら撮り直さない
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import socket
import subprocess
import time
import urllib.parse
from pathlib import Path

import structlog

from poe2tube.config.settings import REPO_ROOT, get_settings
from poe2tube.contracts.craft_stage import CraftStagePlan

log = structlog.get_logger()
CACHE_DIR = REPO_ROOT / "cache" / "stage"
CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0
SIDEBAR_W = 208
VIEWPORT = (SIDEBAR_W + 1400, 760)
SETTLE_MS = 1500  # 打った瞬間の演出 (波紋・光) が収まるまで


def plan_key(plan: CraftStagePlan) -> str:
    raw = plan.model_dump_json(by_alias=True, exclude_none=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def cached_path(plan: CraftStagePlan, step: int) -> Path:
    return CACHE_DIR / plan_key(plan) / f"step_{step}.png"


def replay_url(plan: CraftStagePlan, step: int, base: str) -> str:
    raw = json.dumps(plan.model_dump(by_alias=True, exclude_none=True), ensure_ascii=False)
    return f"{base}/?stage-plan={urllib.parse.quote(raw)}&step={step}"


def port_open(host: str, port: int) -> bool:
    """localhost が ::1 に解決されて Vite (IPv4) を見逃さないよう、全アドレスを試す."""
    try:
        with socket.create_connection((host, port), timeout=0.8):
            return True
    except OSError:
        return False


def ensure_vite(wait_seconds: int = 60) -> str:
    """ExileDesk の Vite dev を確認し、無ければ起動して URL を返す."""
    s = get_settings()
    base = s.exiledesk_dev_url.rstrip("/")
    host, port = (
        urllib.parse.urlparse(base).hostname or "localhost",
        urllib.parse.urlparse(base).port or 1420,
    )
    if port_open(host, port):
        return base
    pnpm = shutil.which("pnpm")
    if not pnpm:
        raise FileNotFoundError("pnpm が PATH に無い (ExileDesk の Vite dev を起動できない)")
    subprocess.Popen(
        [pnpm, "dev"],
        cwd=s.exiledesk_root,
        creationflags=CREATE_NO_WINDOW,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    log.info("vite dev starting", cwd=str(s.exiledesk_root), url=base)
    deadline = time.time() + wait_seconds
    while time.time() < deadline:
        if port_open(host, port):
            time.sleep(1.0)
            return base
        time.sleep(0.5)
    raise TimeoutError(f"Vite dev が {wait_seconds} 秒で起動しない: {base}")


def capture_plan(plan: CraftStagePlan, steps: list[int], force: bool = False) -> dict[int, Path]:
    """必要な手の画面を撮って {step: png} を返す (キャッシュ済みは撮らない)."""
    todo = [st for st in steps if force or not cached_path(plan, st).exists()]
    paths = {st: cached_path(plan, st) for st in steps}
    if not todo:
        return paths
    from playwright.sync_api import sync_playwright

    base = ensure_vite()
    out_dir = CACHE_DIR / plan_key(plan)
    out_dir.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(
            viewport={"width": VIEWPORT[0], "height": VIEWPORT[1]}, device_scale_factor=2
        )
        for st in todo:
            page.goto(replay_url(plan, st, base), wait_until="networkidle", timeout=60000)
            page.wait_for_selector("text=再生中", timeout=30000)
            page.wait_for_timeout(SETTLE_MS)
            page.screenshot(
                path=str(paths[st]),
                clip={
                    "x": SIDEBAR_W,
                    "y": 0,
                    "width": VIEWPORT[0] - SIDEBAR_W,
                    "height": VIEWPORT[1],
                },
            )
            log.info("stage captured", step=st, path=paths[st].name)
        browser.close()
    return paths
