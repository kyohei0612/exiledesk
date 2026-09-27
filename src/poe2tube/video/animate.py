"""フレーム生成: Cue ごとに静的な層 (下地 + パネル) を 1 回描き、fps ごとに口パク + 小道具を重ねる.

飽き防止の動き:
- 画面が切り替わる行の頭 0.3 秒: パネルが下からスライドしながらフェードイン
- 小道具は行の頭 0.15 秒後にポップイン (少し行き過ぎて戻る)
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import structlog
from PIL import Image

from poe2tube.audio.mix import SoundEvent
from poe2tube.contracts.craft_stage import CraftStageResult
from poe2tube.names import NameBook
from poe2tube.render.frame import compose_frame, render_base, render_panel_layer
from poe2tube.video.timeline import Cue, scene_changed

log = structlog.get_logger()
POP_SECONDS = 0.35
POP_DELAY = 0.15
SLIDE_SECONDS = 0.3
SLIDE_PX = 60


def pop_scale(t: float) -> float:
    """0 → 1 に少し行き過ぎて戻る (easeOutBack)。t は行の頭からの秒."""
    u = (t - POP_DELAY) / POP_SECONDS
    if u <= 0:
        return 0.0
    if u >= 1:
        return 1.0
    s = 1.3
    return 1.0 + (s + 1) * (u - 1) ** 3 + s * (u - 1) ** 2


def slide_in(t: float) -> tuple[int, float]:
    """(下方向のずれ px, 不透明度)。t 秒で 0.3 秒かけて所定位置へ (easeOutCubic)."""
    u = min(1.0, max(0.0, t / SLIDE_SECONDS))
    e = 1 - (1 - u) ** 3
    return int(SLIDE_PX * (1 - e)), e


def sound_events(cues: list[Cue], book: NameBook) -> list[SoundEvent]:
    """SE を鳴らす時刻: 冒頭 / 画面切替 / 小道具ポップ / 驚きの台詞."""
    events = [SoundEvent(0.0, "start")]
    prev = None
    for c in cues:
        if prev is not None and scene_changed(prev, c.line):
            events.append(SoundEvent(c.start, "emphasis"))
        if book.find_in_text(c.line.text):
            events.append(SoundEvent(c.start + POP_DELAY, "pop"))
        if c.line.emotion == "surprised":
            events.append(SoundEvent(c.start, "shock"))
        prev = c.line
    return events


def iter_frames(
    cues: list[Cue], result: CraftStageResult, book: NameBook
) -> Iterator[tuple[int, Image.Image]]:
    """(通し番号, フレーム) を順に返す。番号は 0 始まり."""
    total = sum(c.frames for c in cues)
    n = 0
    fps = cues[0].frames / cues[0].duration if cues else 24
    prev = None
    for c in cues:
        props = [f.key for f in book.find_in_text(c.line.text)]
        base = render_base(c.section, c.index / len(cues))
        panel = render_panel_layer(c.line, result)
        animate = panel is not None and scene_changed(prev, c.line)
        static = _with_panel(base, panel, 0, 1.0)
        for k, mouth in enumerate(c.mouth_levels):
            t = k / fps
            if animate and t < SLIDE_SECONDS and panel is not None:
                dy, alpha = slide_in(t)
                frame_static = _with_panel(base, panel, dy, alpha)
            else:
                frame_static = static
            scale = pop_scale(t) if props else 1.0
            yield n, compose_frame(frame_static, c.line, mouth, props, scale)
            n += 1
        prev = c.line
        log.info("frames", line=c.index, scene=c.line.scene.kind, done=n, total=total)


def _with_panel(base: Image.Image, panel: Image.Image | None, dy: int, alpha: float) -> Image.Image:
    img = base.copy()
    if panel is None:
        return img
    layer = panel
    if alpha < 1.0:
        layer = panel.copy()
        layer.putalpha(layer.getchannel("A").point(lambda a: int(a * alpha)))
    img.alpha_composite(layer, (0, dy))
    return img


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
