"""手つきを 1/24 秒ずつ時刻を指定して撮る (録画をやめる、ExileDesk 要望 ㉖).

録画 (Playwright の record_video) はコマを落とし、スロー・カクつき・途中で止まるように見えた
(kyohei 2026-10-04)。ExileDesk の動画モードは ``&anim_t=<ミリ秒>`` でその時刻の絵で止まり、
``&anim_t=end`` で ``window.__stageAnim = {total_ms, attach_ms, ready}`` を返す。

- ``window.__stageSeek(t)`` があれば、ページを開いたまま時刻を進めて撮る (速い)
- 無ければ 1 コマずつ URL を開き直して撮る (遅いが同じ絵)
- 付いた瞬間のコマ番号を ``attach.txt`` に残す (画面の変化量からの推定をやめる)
"""

from __future__ import annotations

import math
import shutil
from pathlib import Path
from typing import Any

import structlog

log = structlog.get_logger()
READY = 'body[data-anim-ready="1"]'
ATTACH_FILE = "attach.txt"


def anim_info(page: Any, url: str) -> dict[str, Any] | None:
    """``anim_t=end`` で開いて手つきの長さと付いた時刻を読む。ExileDesk が古ければ None."""
    page.goto(f"{url}&anim_t=end", wait_until="networkidle", timeout=60000)
    try:
        page.wait_for_selector(READY, timeout=30000, state="attached")
    except Exception:  # 目印が出ない = anim_t を知らない古い ExileDesk
        return None
    info = page.evaluate("() => window.__stageAnim || null")
    return info if isinstance(info, dict) and info.get("total_ms") else None


def frame_times(total_ms: float, fps: int) -> list[int]:
    """撮る時刻 (ミリ秒): 0 から全体の長さまで 1/fps 秒ずつ."""
    n = math.ceil(total_ms * fps / 1000) + 1
    return [round(k * 1000 / fps) for k in range(n)]


def step_clip(page: Any, url: str, out_dir: Path, fps: int) -> bool:
    """手つきを 1 コマずつ撮って ``out_dir/f001.png…`` に。撮れなければ False (録画に戻す)."""
    info = anim_info(page, url)
    if info is None:
        return False
    times = frame_times(float(info["total_ms"]), fps)
    shutil.rmtree(out_dir, ignore_errors=True)
    out_dir.mkdir(parents=True, exist_ok=True)
    page.goto(f"{url}&anim_t=0", wait_until="networkidle", timeout=60000)
    page.wait_for_selector(READY, timeout=30000, state="attached")
    seek = bool(page.evaluate("() => typeof window.__stageSeek === 'function'"))
    for k, t in enumerate(times, start=1):
        if seek:
            page.evaluate("t => window.__stageSeek(t)", t)
        elif k > 1:
            page.goto(f"{url}&anim_t={t}", wait_until="networkidle", timeout=60000)
            page.wait_for_selector(READY, timeout=30000, state="attached")
        page.screenshot(path=str(out_dir / f"f{k:03d}.png"))
    attach = info.get("attach_ms")
    if attach is not None:
        (out_dir / ATTACH_FILE).write_text(str(round(float(attach) * fps / 1000)), encoding="utf-8")
    log.info("stage clip stepped", frames=len(times), seek=seek, attach_ms=attach, dir=out_dir.name)
    return True


def attach_from_file(clip: list[Path]) -> int | None:
    """撮った時に残した付いた瞬間のコマ番号 (無ければ None)."""
    if not clip:
        return None
    f = clip[0].parent / ATTACH_FILE
    return int(f.read_text(encoding="utf-8")) if f.exists() else None
