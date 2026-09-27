"""フレーム生成: Cue ごとに静的な層を 1 回描き、fps ごとに口パク + 小道具のポップインを重ねる."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import structlog
from PIL import Image

from poe2tube.contracts.craft_stage import CraftStageResult
from poe2tube.names import NameBook
from poe2tube.render.frame import compose_frame, render_static
from poe2tube.video.timeline import Cue

log = structlog.get_logger()
POP_SECONDS = 0.35  # 小道具が出てくる時間
POP_DELAY = 0.15  # 行の頭から少し遅らせて出す


def pop_scale(t: float) -> float:
    """0 → 1 に少し行き過ぎて戻る (バウンド)。t は行の頭からの秒."""
    u = (t - POP_DELAY) / POP_SECONDS
    if u <= 0:
        return 0.0
    if u >= 1:
        return 1.0
    # easeOutBack: 1.1 倍くらいまで行き過ぎてから 1 に戻る
    s = 1.3
    return 1.0 + (s + 1) * (u - 1) ** 3 + s * (u - 1) ** 2


def iter_frames(
    cues: list[Cue], result: CraftStageResult, book: NameBook
) -> Iterator[tuple[int, Image.Image]]:
    """(通し番号, フレーム) を順に返す。番号は 0 始まり."""
    total = sum(c.frames for c in cues)
    n = 0
    fps = cues[0].frames / cues[0].duration if cues else 12
    for c in cues:
        props = [f.key for f in book.find_in_text(c.line.text)]
        static = render_static(c.line, result, c.section, c.index / len(cues))
        for k, mouth in enumerate(c.mouth_levels):
            scale = pop_scale(k / fps) if props else 1.0
            yield n, compose_frame(static, c.line, mouth, props, scale)
            n += 1
        log.info("frames", line=c.index, scene=c.line.scene.kind, done=n, total=total)


def write_frames(cues: list[Cue], result: CraftStageResult, book: NameBook, out_dir: Path) -> int:
    """連番 PNG を書き出して枚数を返す (ffmpeg の image2 入力用)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("f*.png"):
        old.unlink()
    count = 0
    for n, frame in iter_frames(cues, result, book):
        frame.convert("RGB").save(out_dir / f"f{n:05d}.png", compress_level=1)
        count = n + 1
    return count
