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


Box = tuple[float, float, float, float]
FULL: Box = (0, 0, 1920, 1080)
# 寄る時に見せたい物 (録画 1920x1080 の中の位置)。枠はここから box_for で決める
CONTENT: dict[str, Box] = {
    "card": (15, 440, 580, 835),  # 左のアイテムのカード (付いた MOD・確率)
    "history": (18, 300, 575, 600),  # 工程 (戻すの録画: ページを送り、手を戻して短くなった後の位置)
    "modlist": (250, 140, 1670, 930),  # MOD 一覧の窓
    "tiers": (960, 360, 1640, 720),  # MOD 一覧の窓の右 (ティアの表)
    "aim": (590, 60, 1900, 420),  # 次の手で狙うのパネル
    "reveal": (15, 440, 580, 900),  # カードと発現の候補
    "header": (1500, 0, 1910, 45),  # 右上の帯 (要望・バグを送る)
    # カオススパム確率機 (record_web の spam、ページを送らない)。
    # 縦のショートでも数字が読めるよう狭く
    "spam_open": (15, 440, 1300, 800),  # カードと棚と「カオススパム確率機へ」
    "spam_stats": (600, 400, 1480, 620),  # 狙いの札・100 人の結果・押すボタン
    "spam_luck": (1240, 520, 1660, 800),  # 運の欄 (TOP 10%・X でシェア)
    # ここから下は印 (mark) だけで使う (寄らない。kyohei「3 分以降は拡大しなくてもいい、マークで」)
    "offers": (85, 600, 505, 725),  # 発現の候補 3 つ (骨の録画はページを送っている)
    "card_rune": (18, 417, 574, 833),  # 胴のカード
}
# 下はテロップ (y 926〜) と左下の顔 (y 842〜) が重なる → 見せたい物は画面の上から SAFE までに収める
# (kyohei 2026-10-12「下のテロップとキャラを把握しながら画面合成」)
SAFE = 0.76
MARGIN = 0.03
MAX_ZOOM = 2.5  # これより寄らない (小さい物に寄り過ぎると何の画面か分からない)


def box_for(rect: Box, safe: float = SAFE) -> Box:
    """見せたい物が、画面の上から safe 割の中に収まる 16:9 の枠 (録画の外にははみ出さない)."""
    x0, y0, x1, y1 = rect
    h = max((y1 - y0) / (safe - 2 * MARGIN), (x1 - x0) * 9 / 16 / (1 - 2 * MARGIN))
    h = min(max(h, 1080 / MAX_ZOOM), 1080.0)
    w = h * 16 / 9
    bx = min(max((x0 + x1) / 2 - w / 2, 0.0), 1920 - w)
    by = min(max(y0 - MARGIN * h, 0.0), 1080 - h)
    return (bx, by, bx + w, by + h)


ZOOM_BOX: dict[str, Box] = {k: box_for(v) for k, v in CONTENT.items()}
ZOOM_SECONDS = 0.5


def zoom_box(prev: Box, cur: Box, t: float) -> Box:
    """前の行の枠から今の行の枠へ ZOOM_SECONDS 秒でなめらかに (smoothstep)."""
    if t >= ZOOM_SECONDS or prev == cur:
        return cur
    e = max(0.0, t) / ZOOM_SECONDS
    e = e * e * (3 - 2 * e)
    a, b, c, d = (p + (q - p) * e for p, q in zip(prev, cur, strict=True))
    return (a, b, c, d)
