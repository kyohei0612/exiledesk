"""クラフトステージの撮影: ExileDesk の動画モード (video=1) を Playwright で開いて PNG にする.

- 撮影用の ExileDesk (リリースで固定、Vite 1430、ADR 006) が動いていなければ隠し窓で起動する
- 1920x1080 で開けば動画と同じ解像度なので、縮めず貼れる (サイドバー・操作欄は動画モードが隠す)
- キャッシュ: cache/stage/<手順のハッシュ>/step_N.png。同じ手順 JSON なら撮り直さない
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.parse
from pathlib import Path
from typing import Any

import structlog

from poe2tube.config.settings import REPO_ROOT, get_settings
from poe2tube.contracts.craft_stage import CraftStagePlan, CraftStageResult

log = structlog.get_logger()
CACHE_DIR = REPO_ROOT / "cache" / "stage"
CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0
# ExileDesk の動画モード (v0.1.308、VideoStage.vue): 16:9 の撮影用画面を窓いっぱいに出す。
# 1920x1080 の窓で撮れば動画と同じ解像度なので、そのまま貼れる (サイドバー・操作欄は出ない)
VIEWPORT = (1920, 1080)
CAPTURE_VER = "v17-pob"  # 撮り方を変えたらキャッシュを切替 (v17 = v0.1.331、PoB の DPS・新画面)
# アイテム枠が描けたら撮る。v0.1.314 の撮影用は英語ベース名を出さないので「アイテムレベル」を待つ
# ジェムにはアイテムレベルが無い。⑰ の画面は見出しの文字を待つ
READY_SELECTOR = "text=/アイテムレベル|スキルジェム|耐性|倒すまでの時間|受けるダメージ|DPS の内訳/"
# 動画モードは普通の画面の上に重ねて出る (fixed inset-0)。真ん中の一番手前がそれでなければ
# 開けていない (2026-09-29: ExileDesk 開発版の版ずれで普通の画面のまま動画ができていた)
VIDEO_OVERLAY_JS = "!!document.elementFromPoint(960, 540)?.closest('.fixed.inset-0')"
SETTLE_MS = 1500  # 打った瞬間の演出 (波紋・光) が収まるまで
CLIP_SECONDS = 4.4  # 棚から拾って運んで付ける手つき (ExileDesk v0.1.311、約 2.5 秒) + 付いた所


def plan_key(plan: CraftStagePlan) -> str:
    raw = plan.model_dump_json(by_alias=True, exclude_none=True)
    return hashlib.sha256(f"{CAPTURE_VER}|{raw}".encode()).hexdigest()[:16]


def cached_path(plan: CraftStagePlan, step: int) -> Path:
    return CACHE_DIR / plan_key(plan) / f"step_{step}.png"


def clip_dir(plan: CraftStagePlan, step: int) -> Path:
    return CACHE_DIR / plan_key(plan) / f"step_{step}_clip"


def clip_frames(plan: CraftStagePlan, step: int) -> list[Path]:
    """打った瞬間の連番 PNG (無ければ空)。step 0 (開始前) には無い."""
    return sorted(clip_dir(plan, step).glob("f*.png")) if step >= 1 else []


def pob_json(result: CraftStageResult) -> str | None:
    """結果 JSON の pob (DPS の札・比べる・倒すまでの時間の画面に渡す)。無ければ None."""
    if result.pob is None:
        return None
    return json.dumps(result.pob.model_dump(by_alias=True, mode="json"), ensure_ascii=False)


def replay_url(plan: CraftStagePlan, step: int, base: str, pob: str | None = None) -> str:
    raw = json.dumps(plan.model_dump(by_alias=True, exclude_none=True), ensure_ascii=False)
    extra = f"&stage-pob={urllib.parse.quote(pob)}" if pob else ""
    return (
        f"{base}/?stage-plan={urllib.parse.quote(raw)}&step={step}&video=1&controls=0&layout=clip"
        + extra
    )


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
        urllib.parse.urlparse(base).port or 1430,
    )
    if port_open(host, port):
        return base
    pnpm = shutil.which("pnpm")
    if not pnpm:
        raise FileNotFoundError("pnpm が PATH に無い (ExileDesk の Vite dev を起動できない)")
    # 固定版 (1430) は ExileDesk の開発版 (1420) と並べて動かすので、ポートを指定して起動する
    subprocess.Popen(
        [pnpm, "exec", "vite", "--port", str(port), "--strictPort"],
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


def capture_plan(
    plan: CraftStagePlan,
    steps: list[int],
    force: bool = False,
    clips: bool = True,
    fps: int = 24,
    pob: str | None = None,
) -> dict[int, Path]:
    """必要な手の静止画 (と打った瞬間の連番) を撮って {step: png} を返す (キャッシュ済みは撮らない).

    静止画 = その手まで進めた止め絵。連番 = 1 つ前の手から → キーで進めた瞬間の演出
    (kyohei 2026-09-27「クリックして付けた時の挙動が寂しい、動いてる感が欲しい」)。
    """
    todo = [st for st in steps if force or not cached_path(plan, st).exists()]
    todo_clips = [st for st in steps if clips and st >= 1 and (force or not clip_frames(plan, st))]
    paths = {st: cached_path(plan, st) for st in steps}
    if not todo and not todo_clips:
        return paths
    from playwright.sync_api import sync_playwright

    base = ensure_vite()
    out_dir = CACHE_DIR / plan_key(plan)
    out_dir.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--mute-audio"])  # テストでも音を出さない
        page = browser.new_page(
            viewport={"width": VIEWPORT[0], "height": VIEWPORT[1]}, device_scale_factor=1
        )
        for st in todo:
            page.goto(replay_url(plan, st, base, pob), wait_until="networkidle", timeout=60000)
            page.wait_for_selector(READY_SELECTOR, timeout=30000)
            page.wait_for_timeout(SETTLE_MS)
            ensure_video_mode(page)
            page.screenshot(path=str(paths[st]))
            log.info("stage captured", step=st, path=paths[st].name)
        page.close()
        for st in todo_clips:
            _record_clip(browser, base, plan, st, fps, pob)
        browser.close()
    return paths


class NotVideoModeError(RuntimeError):
    """ExileDesk が動画モードで開けていない (普通の画面を撮ってしまうので止める)."""


def ensure_video_mode(page: Any) -> None:
    if not page.evaluate(VIDEO_OVERLAY_JS):
        raise NotVideoModeError(
            "ExileDesk が動画モードで開けていない (普通の画面が写った)。版ずれか不具合を疑う"
        )


def _record_clip(
    browser: Any, base: str, plan: CraftStagePlan, step: int, fps: int, pob: str | None = None
) -> None:
    """1 つ前の手で開き、→ キーで 1 手進めた瞬間を Playwright の動画録画で撮って連番 PNG にする."""
    out_dir = clip_dir(plan, step)
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
        page.goto(replay_url(plan, step - 1, base, pob), wait_until="networkidle", timeout=60000)
        page.wait_for_selector(READY_SELECTOR, timeout=30000)
        ensure_video_mode(page)
        page.wait_for_timeout(800)
        page.keyboard.press("ArrowRight")
        t_press = time.perf_counter() - t0
        page.wait_for_timeout(int(CLIP_SECONDS * 1000) + 400)
        video = page.video
        ctx.close()
        if video is None:
            raise RuntimeError("Playwright の動画録画が無効")
        webm = Path(video.path())
        exe = shutil.which("ffmpeg")
        if not exe:
            raise FileNotFoundError("ffmpeg が PATH に無い")
        cmd = [
            exe,
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(webm),
            "-ss",
            f"{max(0.0, t_press - 0.05):.3f}",
            "-t",
            f"{CLIP_SECONDS:.2f}",
            "-vf",
            f"fps={fps},scale={VIEWPORT[0]}:{VIEWPORT[1]}",
            str(out_dir / "f%03d.png"),
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, creationflags=CREATE_NO_WINDOW)
        if r.returncode != 0:
            raise RuntimeError(f"ffmpeg 連番化 失敗: {r.stderr[-300:]}")
    log.info("stage clip recorded", step=step, frames=len(clip_frames(plan, step)))
