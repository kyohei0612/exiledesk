"""録画 (footage) の行のうち、寄る (zoom) か印 (mark) がある行のコマを書き出して確かめる.

kyohei 2026-10-12「スナップで確認してこのざまか」: 縮めた一覧だけで確かめて印のずれを見落とした。
行ごとに「始まって 0.6 秒」と「終わる 0.2 秒前」のコマを並べ、台詞と寄り・印を札で付ける。

    python scripts/check_footage_marks.py data/scripts/<name>.json
    → output/work/<name>/check_marks/NN_<章>_<行>.jpg (章の動画 section_NN.mp4 から)
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import structlog  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

from poe2tube.render.palette import font  # noqa: E402

log = structlog.get_logger()
CREATE_NO_WINDOW = 0x08000000


def frame_at(video: Path, t: float, dest: Path) -> Image.Image:
    ff = shutil.which("ffmpeg") or "ffmpeg"
    cmd = [ff, "-v", "error", "-y", "-ss", f"{max(0.0, t):.3f}", "-i", str(video)]
    cmd += ["-frames:v", "1", "-vf", "scale=960:-1", str(dest)]
    subprocess.run(cmd, check=True, creationflags=CREATE_NO_WINDOW)
    return Image.open(dest).convert("RGB")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("script", type=Path)
    a = ap.parse_args()
    data = json.loads(a.script.read_text(encoding="utf-8"))
    work = ROOT / "output" / "work" / a.script.stem
    lines = json.loads((work / "lines.json").read_text(encoding="utf-8"))
    out = work / "check_marks"
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    tmp = out / "_f.png"
    n = 0
    for k, sec in enumerate(data["sections"]):
        rows = [r for r in lines if r["section"] == sec["name"]]
        video = work / "chapters" / f"section_{k:02d}.mp4"
        if not rows or not video.exists():
            continue
        t0 = rows[0]["start"]
        for i, (ln, row) in enumerate(zip(sec["lines"], rows, strict=True)):
            sc = ln["scene"]
            if sc.get("kind") != "footage" or not (sc.get("zoom") or sc.get("mark")):
                continue
            start = row["start"] - t0
            a_img = frame_at(video, start + 0.6, tmp)
            b_img = frame_at(video, start + row["duration"] - 0.2, tmp)
            sheet = Image.new("RGB", (1920, 600), (20, 20, 20))
            sheet.paste(a_img, (0, 60))
            sheet.paste(b_img, (960, 60))
            label = f"{k + 1}章 {i + 1}行 zoom={sc.get('zoom')} mark={sc.get('mark')}  {ln['text']}"
            ImageDraw.Draw(sheet).text((10, 14), label[:90], font=font(28), fill=(255, 220, 90))
            sheet.save(out / f"{k:02d}_{i:02d}.jpg", quality=88)
            n += 1
    tmp.unlink(missing_ok=True)
    log.info("check marks", sheets=n, out=str(out))


if __name__ == "__main__":
    main()
