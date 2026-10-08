"""アプリを操作した録画 (scripts/record_app*.py) を、動画の fps のコマに切り出す.

footage の画面は「録画の at 秒目から流し、hold 秒目で止めて出したまま」(kyohei 2026-10-08
「画面の説明絶対ほしい、垂れ流す訳やない」)。切り出したコマは録画の横に取っておき、
録画を撮り直したら (mtime が新しい) 切り出し直す。
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import structlog

from poe2tube.config.settings import REPO_ROOT

log = structlog.get_logger()

FOOTAGE_DIR = REPO_ROOT / "output" / "app_rec"
CREATE_NO_WINDOW = 0x08000000


def footage_path(clip: str, root: Path = FOOTAGE_DIR) -> Path:
    return root / f"{clip}.mp4"


def footage_frames(clip: str, fps: int, root: Path = FOOTAGE_DIR) -> list[Path]:
    """録画を fps のコマ (PNG) にして並びを返す。録画が無ければ空."""
    src = footage_path(clip, root)
    if not src.exists():
        return []
    out = root / f"_{clip}_{fps}fps"
    done = out / "done"
    if done.exists() and done.stat().st_mtime >= src.stat().st_mtime:
        return sorted(out.glob("f*.png"))
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    ff = shutil.which("ffmpeg") or "ffmpeg"
    cmd = [ff, "-v", "error", "-y", "-i", str(src), "-vf", f"fps={fps}", str(out / "f%05d.png")]
    subprocess.run(cmd, check=True, creationflags=CREATE_NO_WINDOW)
    done.write_text(src.name, encoding="utf-8")
    frames = sorted(out.glob("f*.png"))
    log.info("footage frames", clip=clip, fps=fps, frames=len(frames))
    return frames


def shot_at(
    frames: list[Path], fps: float, at: float, hold: float | None, t: float, rate: float = 1.0
) -> Path | None:
    """行の頭から t 秒の時のコマ: at 秒目から rate 倍で流し、hold 秒目 (無ければ最後) で止める."""
    if not frames:
        return None
    last = len(frames) - 1 if hold is None else min(len(frames) - 1, round(hold * fps))
    return frames[max(0, min(last, round((at + max(0.0, t) * rate) * fps)))]
