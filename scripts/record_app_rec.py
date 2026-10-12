"""録画の部品: 全画面の窓を前面に出す・ddagrab で録る・押した時刻を録画の秒で残す."""

from __future__ import annotations

import base64
import json
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

import structlog

log = structlog.get_logger()
CREATE_NO_WINDOW = 0x08000000


def focus_app() -> None:
    """全画面の ExileDesk の窓を前面に出す (前面でないとタスクバーが上に写る).

    開発版など窓モードの ExileDesk が同時に開いていることがある → 0,0 から画面いっぱいの窓を選ぶ。
    """
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    found: list[int] = []

    def visit(hwnd: int, _: int) -> bool:
        buf = ctypes.create_unicode_buffer(64)
        user32.GetWindowTextW(hwnd, buf, 64)
        rect = wintypes.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(rect))
        full = (rect.left, rect.top, rect.right, rect.bottom) == (0, 0, 1920, 1080)
        if buf.value.startswith("ExileDesk") and user32.IsWindowVisible(hwnd) and full:
            found.append(hwnd)
        return True

    proc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    user32.EnumWindows(proc(visit), 0)
    if not found:
        log.warning("fullscreen ExileDesk window not found")
        return
    user32.keybd_event(0x12, 0, 0, 0)  # Alt を押して離す (前面に出す制限を外す定番の手)
    user32.keybd_event(0x12, 0, 2, 0)
    user32.ShowWindow(found[0], 9)
    user32.SetForegroundWindow(found[0])
    time.sleep(0.5)


# 押した時刻 (録画の何秒目か)。台本の footage の at / hold を決める用 (<name>.events.json)
EVENTS: list[dict[str, Any]] = []


def mark(what: str) -> None:
    """今の時刻に印を付ける (押した・付いた・出た など)."""
    EVENTS.append({"clock": time.perf_counter(), "epoch": time.time(), "what": what})


class Recorder:
    """ddagrab で 1 枚目のモニターを録る (GPU のコマを下ろしてから NVENC)."""

    def __init__(self, path: Path) -> None:
        focus_app()
        EVENTS.clear()
        ff = shutil.which("ffmpeg") or "ffmpeg"
        cmd = [ff, "-y", "-loglevel", "error", "-f", "lavfi"]
        cmd += ["-i", "ddagrab=output_idx=0:framerate=30:draw_mouse=0"]
        cmd += ["-vf", "hwdownload,format=bgra", "-c:v", "h264_nvenc", "-preset", "p4"]
        cmd += ["-cq", "21", "-pix_fmt", "yuv420p", str(path)]
        self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, creationflags=CREATE_NO_WINDOW)
        self.path = path
        time.sleep(1.2)

    def stop(self) -> None:
        time.sleep(1.0)
        assert self.proc.stdin is not None
        end = time.perf_counter()
        self.proc.stdin.write(b"q")
        self.proc.stdin.flush()
        self.proc.wait(timeout=30)
        # 録画の 0 秒 = 止めた時刻 - 録画の長さ (ffmpeg が録り始めるまでの遅れを消す)
        start = end - clip_seconds(self.path)
        events = [{"t": round(e["clock"] - start, 2), "what": e["what"]} for e in EVENTS]
        dest = self.path.with_suffix(".events.json")
        dest.write_text(json.dumps(events, ensure_ascii=False, indent=1), encoding="utf-8")
        log.info("recorded", file=str(self.path), events=len(events))


def clip_seconds(path: Path) -> float:
    probe = shutil.which("ffprobe") or "ffprobe"
    cmd = [probe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]
    out = subprocess.run(cmd, capture_output=True, text=True, creationflags=CREATE_NO_WINDOW)
    return float(out.stdout.strip() or 0)


class Screencast:
    """ページの中身だけを録る (CDP の screencast)。窓の前に何が来ても写らない、URL も写らない.

    kyohei 2026-10-12「画面録画じゃなくアプリ録画で、前に何か移っても大丈夫なように」。
    Chromium は絵が変わった時だけコマを送るので、受け取った時刻どおりに並べて 30fps にそろえる。
    待つ間も Playwright の出来事を回す必要がある (record_app.PAGE に page を入れておく)。
    """

    def __init__(self, page: Any, path: Path) -> None:
        self.page, self.path = page, path
        self.frames: list[tuple[float, bytes]] = []
        EVENTS.clear()
        self.cdp = page.context.new_cdp_session(page)
        self.cdp.on("Page.screencastFrame", self._frame)
        opts = {"format": "jpeg", "quality": 92, "maxWidth": 1920, "maxHeight": 1080}
        self.cdp.send("Page.startScreencast", {**opts, "everyNthFrame": 1})
        page.wait_for_timeout(600)

    def _frame(self, ev: dict[str, Any]) -> None:
        self.frames.append((float(ev["metadata"]["timestamp"]), base64.b64decode(ev["data"])))
        self.cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]})

    def stop(self) -> None:
        self.page.wait_for_timeout(1000)
        self.cdp.send("Page.stopScreencast")
        if not self.frames:
            raise RuntimeError("コマが 1 枚も来なかった")
        tmp = self.path.with_suffix(".frames")
        shutil.rmtree(tmp, ignore_errors=True)
        tmp.mkdir(parents=True)
        lines = []
        for i, (ts, data) in enumerate(self.frames):
            (tmp / f"f{i:05d}.jpg").write_bytes(data)
            nxt = self.frames[i + 1][0] if i + 1 < len(self.frames) else ts + 1.0
            lines += [f"file 'f{i:05d}.jpg'", f"duration {max(0.001, nxt - ts):.4f}"]
        lines.append(f"file 'f{len(self.frames) - 1:05d}.jpg'")
        (tmp / "list.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
        ff = shutil.which("ffmpeg") or "ffmpeg"
        cmd = [ff, "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(tmp / "list.txt")]
        cmd += ["-vf", "fps=30,scale=1920:1080:force_original_aspect_ratio=decrease,"]
        cmd[-1] += "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p"
        cmd += ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "21", str(self.path)]
        subprocess.run(cmd, check=True, creationflags=CREATE_NO_WINDOW)
        shutil.rmtree(tmp, ignore_errors=True)
        start = self.frames[0][0]
        events = [{"t": round(e["epoch"] - start, 2), "what": e["what"]} for e in EVENTS]
        dest = self.path.with_suffix(".events.json")
        dest.write_text(json.dumps(events, ensure_ascii=False, indent=1), encoding="utf-8")
        log.info("recorded (screencast)", file=str(self.path), frames=len(self.frames))
