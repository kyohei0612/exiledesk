"""ExileDesk の画面の「登場の動き」(`&play=1`) を録画して連番 PNG にする (要望 ⑰ の F).

ExileDesk は動きの長さを ``body.dataset.animMs`` に書き、終わると ``animDone = "1"`` にする。
Playwright の動画録画で開いてから終わりまでを撮り、終わった時刻から長さぶんだけ切り出す。
- 画面が変わった行: ``<画面の URL>&play=1`` (登場の動き)
- 答えを隠した行の次で答えを出す行: ``<隠した URL>&play=1&reveal=1`` (隠した所から答えが出る動き)
"""

from __future__ import annotations

import hashlib
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

import structlog

from poe2tube.capture.stage import (
    BROWSER_ARGS,
    CACHE_DIR,
    CREATE_NO_WINDOW,
    READY_SELECTOR,
    VIEWPORT,
    cache_ver,
    ensure_video_mode,
    ensure_vite,
)
from poe2tube.capture.views import view_query
from poe2tube.script.model import Scene
from poe2tube.video.results import ResultSet

log = structlog.get_logger()
ANIM_DIR = CACHE_DIR / "anim"
# ExileDesk v0.1.331 で動きがある画面 (use-anim.ts を使う物)
ANIM_KINDS = (
    "compare",
    "dps",
    "ttk",
    "hit",
    "resists",
    "layers",
    "armour",
    "evasion",
    "es",
    "bases",
)
TAIL_SECONDS = 0.3  # 動きが終わった後の止め (切り出しの余白)


def _hidden(scene: Scene) -> bool:
    return not scene.reveal or not scene.show_dps


# 質問の行 (答えを隠す) でも動きを流すと答えが見える画面 (倒すまでの時間 = どちらが先に倒れるか)。
# 動きの最初のコマ (競争の前) で止めて見せる
HOLD_FIRST_KINDS = ("ttk",)


def holds_first(scene: Scene) -> bool:
    return scene.kind in HOLD_FIRST_KINDS and _hidden(scene)


def anim_query(scene: Scene, prev: Scene | None, rs: ResultSet) -> str | None:
    """この行の頭で流す動きの URL。動かない画面・前の行と同じ画面なら None."""
    if scene.kind not in ANIM_KINDS:
        return None
    q = view_query(scene, rs)
    if q is None:
        return None
    if prev is not None and prev.key() == scene.key():
        return None
    same_view = (
        prev is not None
        and prev.model_copy(update={"reveal": scene.reveal, "show_dps": scene.show_dps}).key()
        == scene.key()
    )
    if same_view and prev is not None and _hidden(prev) and not _hidden(scene):
        hidden_q = view_query(prev, rs)
        return f"{hidden_q}&play=1&reveal=1" if hidden_q else None
    return f"{q}&play=1"


def anim_dir(query: str) -> Path:
    key = hashlib.sha256(f"{cache_ver()}|{query}".encode()).hexdigest()[:16]
    return ANIM_DIR / key


def anim_frames(query: str | None) -> list[Path]:
    """録画済みの連番 (無ければ空)."""
    return sorted(anim_dir(query).glob("f*.png")) if query else []


def capture_anims(queries: list[str], fps: int = 24, force: bool = False) -> None:
    """まとめて録画する (録画済みは撮らない)。音は出さない."""
    todo = [q for q in dict.fromkeys(queries) if force or not anim_frames(q)]
    if not todo:
        return
    from playwright.sync_api import sync_playwright

    base = ensure_vite()
    with sync_playwright() as p:
        browser = p.chromium.launch(args=BROWSER_ARGS)
        for q in todo:
            _record(browser, f"{base}/?{q}", anim_dir(q), fps)
        browser.close()


def _record(browser: Any, url: str, out_dir: Path, fps: int) -> None:
    shutil.rmtree(out_dir, ignore_errors=True)
    out_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        ctx = browser.new_context(
            viewport={"width": VIEWPORT[0], "height": VIEWPORT[1]},
            record_video_dir=tmp,
            record_video_size={"width": VIEWPORT[0], "height": VIEWPORT[1]},
        )
        t0 = time.perf_counter()
        page = ctx.new_page()
        page.goto(url, wait_until="networkidle", timeout=60000)
        page.wait_for_selector(READY_SELECTOR, timeout=30000)
        ensure_video_mode(page)
        ms = int(page.evaluate("Number(document.body.dataset.animMs || 0)"))
        page.wait_for_function("document.body.dataset.animDone === '1'", timeout=ms + 15000)
        t_done = time.perf_counter() - t0
        page.wait_for_timeout(int(TAIL_SECONDS * 1000) + 200)
        video = page.video
        ctx.close()
        if video is None:
            raise RuntimeError("Playwright の動画録画が無効")
        start = max(0.0, t_done - ms / 1000 - 0.05)
        _to_frames(Path(video.path()), start, ms / 1000 + TAIL_SECONDS, fps, out_dir)
    log.info("view anim recorded", ms=ms, frames=len(list(out_dir.glob("f*.png"))))


def _to_frames(webm: Path, start: float, seconds: float, fps: int, out_dir: Path) -> None:
    exe = shutil.which("ffmpeg")
    if not exe:
        raise FileNotFoundError("ffmpeg が PATH に無い")
    cmd = [
        exe,
        "-y",
        "-loglevel",
        "error",
        "-ss",
        f"{start:.3f}",
        "-i",
        str(webm),
        "-t",
        f"{seconds:.2f}",
        "-vf",
        f"fps={fps},scale={VIEWPORT[0]}:{VIEWPORT[1]}",
        str(out_dir / "f%03d.png"),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, creationflags=CREATE_NO_WINDOW)
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg 連番化 失敗: {r.stderr[-300:]}")


def intro_timing(scenes: list[Scene], rs: ResultSet, fps: int) -> dict[int, tuple[float, bool]]:
    """行の位置 → (登場の動きの秒, 答えを出す動きか)。録画済みの行だけ (行の長さ・声の遅れ用)."""
    out: dict[int, tuple[float, bool]] = {}
    for i, sc in enumerate(scenes):
        q = anim_query(sc, scenes[i - 1] if i else None, rs)
        frames = anim_frames(q)
        if q and frames and not holds_first(sc):
            out[i] = (len(frames) / fps, q.endswith("&reveal=1"))
    return out
