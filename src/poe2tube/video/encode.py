"""動画の書き出し: コマを ffmpeg に直接流し込み、GPU (NVENC) があれば GPU で H.264 にする.

kyohei 2026-10-04「GPU で早くできるところはもちろん GPU 使って早くしてくれ」。
- 連番 PNG を書いて読み直す手間をやめ、RGB のままパイプで渡す (``--keep-frames`` の時だけ PNG)
- NVENC が使えるか 1 回だけ試し、使えなければ libx264 (CPU) に戻す
  (設定 ``POE2TUBE_NVENC=0`` で止める)
"""

from __future__ import annotations

import os
import shutil
import subprocess
from collections.abc import Iterable
from functools import lru_cache
from pathlib import Path

import structlog
from PIL import Image

log = structlog.get_logger()
CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0
# NVENC の画質は libx264 の crf 20 と見た目がそろうくらい (p5 = 画質寄りの速さ)
NVENC_ARGS = ["-c:v", "h264_nvenc", "-preset", "p5", "-tune", "hq", "-rc", "vbr", "-cq", "21"]
NVENC_ARGS += ["-b:v", "0"]
X264_ARGS = ["-c:v", "libx264", "-crf", "20"]


def ffmpeg_path() -> str:
    exe = shutil.which("ffmpeg")
    if not exe:
        raise FileNotFoundError("ffmpeg が PATH に無い")
    return exe


@lru_cache(maxsize=1)
def nvenc_available() -> bool:
    """NVENC で 1 コマだけ書いてみる (GPU・ドライバ・ffmpeg のどれが欠けても False)."""
    cmd = [ffmpeg_path(), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i"]
    cmd += ["color=c=black:s=256x256:d=0.1", "-frames:v", "1", *NVENC_ARGS, "-f", "null", "-"]
    try:
        r = subprocess.run(
            cmd, capture_output=True, text=True, timeout=30, creationflags=CREATE_NO_WINDOW
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return r.returncode == 0


def video_args(use_gpu: bool) -> list[str]:
    """使う側の希望 (設定) と GPU の有無から、映像の書き出しの引数を決める."""
    gpu = use_gpu and nvenc_available()
    log.info("video encoder", encoder="h264_nvenc (GPU)" if gpu else "libx264 (CPU)")
    return NVENC_ARGS if gpu else X264_ARGS


def _tail(audio: Path, out: Path, vargs: list[str]) -> list[str]:
    return ["-i", str(audio), *vargs, "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k"] + [
        "-shortest",
        str(out),
    ]


Frame = Image.Image | tuple[int, int, bytes | memoryview]  # 絵か、(幅, 高さ, RGB) (並べて作った時)


def _rgb(frame: Frame) -> tuple[tuple[int, int], bytes | memoryview]:
    if isinstance(frame, tuple):
        return (frame[0], frame[1]), frame[2]
    rgb = frame.convert("RGB")
    return rgb.size, rgb.tobytes()


def encode_stream(
    frames: Iterable[tuple[int, Frame]], audio: Path, fps: int, out: Path, use_gpu: bool
) -> int:
    """コマ (番号, 絵) を ffmpeg の標準入力に RGB で流して mp4 にする。書いたコマ数を返す."""
    it = iter(frames)
    first = next(it, None)
    if first is None:
        raise ValueError("コマが 1 枚も無い")
    (w, h), data = _rgb(first[1])
    cmd = [ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo"]
    cmd += ["-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-framerate", str(fps), "-i", "-"]
    cmd += _tail(audio, out, video_args(use_gpu))
    proc = subprocess.Popen(
        cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=CREATE_NO_WINDOW
    )
    assert proc.stdin is not None
    count = 0
    try:
        proc.stdin.write(data)
        count = first[0] + 1
        for n, frame in it:
            proc.stdin.write(_rgb(frame)[1])
            count = n + 1
    finally:
        proc.stdin.close()
        err = proc.stderr.read().decode(errors="replace") if proc.stderr else ""
        rc = proc.wait()
    if rc != 0:
        raise RuntimeError(f"ffmpeg 失敗 rc={rc}: {err[-800:]}")
    return count


def encode_files(frames_dir: Path, audio: Path, fps: int, out: Path, use_gpu: bool) -> None:
    """連番 PNG (``--keep-frames`` の時) から mp4 にする."""
    cmd = [ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error", "-framerate", str(fps)]
    cmd += ["-i", str(frames_dir / "f%05d.png"), *_tail(audio, out, video_args(use_gpu))]
    r = subprocess.run(cmd, capture_output=True, text=True, creationflags=CREATE_NO_WINDOW)
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg 失敗 rc={r.returncode}: {r.stderr[-800:]}")
