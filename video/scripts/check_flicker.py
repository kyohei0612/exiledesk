"""出来上がった動画の「ちらつき」を探す (絵がパッと変わって、すぐ元に戻る所).

    python scripts/check_flicker.py data/scripts/<name>.json [--video output/<name>.mp4]

kyohei 2026-10-04「7 分 10 秒あたりごちゃる」「ほかの所もありそう、冒涜まわり特に」。
パネル (画面の真ん中) を小さくして 1 コマずつ比べ、コマ k で大きく変わったのに k+1〜k+12 (0.5 秒)
のどこかで k-1 の絵に戻っていたら「ちらつき」として、時刻とその行の台詞を出す。
手を打つ瞬間のように、変わったまま戻らない変化は拾わない。
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poe2tube.video.encode import CREATE_NO_WINDOW, ffmpeg_path  # noqa: E402

W, H = 192, 108  # 1920x1080 を 1/10 に
PANEL = (34, 12, 158, 86)  # パネルのあたり (立ち絵と字幕を外す)
JUMP = 6.0  # これより大きい変化を「パッと変わった」とみなす (0〜255 の平均の差)
BACK = 2.0  # これより小さければ「元に戻った」
WINDOW = 12  # 戻るかを見るコマ数 (24fps で 0.5 秒)


def frames(video: Path) -> np.ndarray:
    cmd = [ffmpeg_path(), "-v", "error", "-i", str(video), "-vf", f"scale={W}:{H},format=gray"]
    cmd += ["-f", "rawvideo", "-"]
    raw = subprocess.run(
        cmd, capture_output=True, check=True, creationflags=CREATE_NO_WINDOW
    ).stdout
    arr = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)
    x0, y0, x1, y1 = PANEL
    return arr[:, y0:y1, x0:x1]


def flickers(arr: np.ndarray) -> list[int]:
    out: list[int] = []
    k = 1
    while k < len(arr) - 1:
        if float(np.abs(arr[k] - arr[k - 1]).mean()) > JUMP:
            for m in range(1, WINDOW + 1):
                if k + m >= len(arr):
                    break
                if float(np.abs(arr[k + m] - arr[k - 1]).mean()) < BACK:
                    out.append(k)
                    k += m
                    break
        k += 1
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("script", type=Path)
    ap.add_argument("--video", type=Path, default=None)
    a = ap.parse_args()
    video = a.video or ROOT / "output" / f"{a.script.stem}.mp4"
    work = ROOT / "output" / "work" / a.script.stem
    lines = json.loads((work / "lines.json").read_text(encoding="utf-8"))
    arr = frames(video)
    found = flickers(arr)
    fps = 24
    print(f"コマ数 {len(arr)} / ちらつき {len(found)} か所")
    for k in found:
        t = k / fps
        ln = max((x for x in lines if x["start"] <= t), key=lambda x: x["start"])
        print(f"{int(t // 60)}:{t % 60:05.2f}  [{ln['section']}]  {ln['text'][:40]}")


if __name__ == "__main__":
    main()
