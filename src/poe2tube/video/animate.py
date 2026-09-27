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
from poe2tube.capture.stage import clip_frames
from poe2tube.contracts.craft_stage import CraftStageResult
from poe2tube.names import NameBook
from poe2tube.render.frame import compose_frame, render_base, render_panel_layer
from poe2tube.render.overlay_fx import draw_chapter, draw_hit
from poe2tube.script.model import Line
from poe2tube.video.timeline import Cue, scene_changed

log = structlog.get_logger()
POP_SECONDS = 0.35
POP_DELAY = 0.15
SLIDE_SECONDS = 0.3
SLIDE_PX = 60
CLIP_SLOWMO = 2  # 打った瞬間の録画を 1/2 速で (kyohei 2026-09-28「速くて何が変わったか分からない」)


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


def sound_events(cues: list[Cue], book: NameBook, n_steps: int = 0) -> list[SoundEvent]:
    """SE を鳴らす時刻: 冒頭 / 画面切替 (完成工程なら成功音) / 小道具ポップ / 驚きの台詞."""
    events = [SoundEvent(0.0, "start")]
    prev = None
    for c in cues:
        sc = c.line.scene
        if prev is not None and scene_changed(prev, c.line):
            is_final = (
                sc.kind in ("stack", "item")
                and sc.step == n_steps
                and sc.highlight
                in (
                    "rarity",
                    "name",
                )
            )
            kind = "hit" if stage_hit(prev, c.line) else ("complete" if is_final else "slide")
            events.append(SoundEvent(c.start, kind))
        if book.find_in_text(c.line.text):
            events.append(SoundEvent(c.start + POP_DELAY, "pop"))
        if c.line.emotion == "surprised":
            events.append(SoundEvent(c.start, "shock"))
        prev = c.line
    return events


def stage_hit(prev: Line | None, cur: Line) -> bool:
    """この行で「手を打つ」瞬間か: stage の step が初めて出てくる (0 = 開始前は除く)."""
    sc = cur.scene
    if sc.kind != "stage" or not sc.step:
        return False
    return prev is None or prev.scene.kind != "stage" or prev.scene.step != sc.step


def iter_frames(
    cues: list[Cue], result: CraftStageResult, book: NameBook, final_step: int | None = None
) -> Iterator[tuple[int, Image.Image]]:
    """(通し番号, フレーム) を順に返す。番号は 0 始まり."""
    total = sum(c.frames for c in cues)
    n = 0
    fps = cues[0].frames / cues[0].duration if cues else 24
    prev = None
    prev_section: str | None = None
    for c in cues:
        props = [f.key for f in book.find_in_text(c.line.text)]
        base = render_base(c.section, c.index / len(cues))
        panel = render_panel_layer(c.line, result, final_step=final_step)
        # 打った瞬間の連番 (ExileDesk の演出そのもの) があれば、行の頭はそれを 1 コマずつ貼る
        clip = clip_frames(result.plan, c.line.scene.step or 0) if stage_hit(prev, c.line) else []
        animate = panel is not None and scene_changed(prev, c.line) and not clip
        static = _with_panel(base, panel, 0, 1.0)
        hit_step = (
            result.steps[c.line.scene.step - 1]
            if stage_hit(prev, c.line) and c.line.scene.step
            else None
        )
        new_chapter = prev_section is not None and prev_section != c.section
        for k, mouth in enumerate(c.mouth_levels):
            t = k / fps
            if k < len(clip) * CLIP_SLOWMO:
                shot = clip[k // CLIP_SLOWMO]
                frame_static = _with_panel(
                    base,
                    render_panel_layer(c.line, result, stage_shot=shot, final_step=final_step),
                    0,
                    1.0,
                )
            elif animate and t < SLIDE_SECONDS and panel is not None:
                dy, alpha = slide_in(t)
                frame_static = _with_panel(base, panel, dy, alpha)
            else:
                frame_static = static
            scale = pop_scale(t) if props else 1.0
            frame = compose_frame(frame_static, c.line, mouth, props, scale)
            if hit_step is not None:
                draw_hit(frame, hit_step, t)
            if new_chapter:
                draw_chapter(frame, c.section, t)
            yield n, frame
            n += 1
        prev = c.line
        prev_section = c.section
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


def write_frames(
    cues: list[Cue],
    result: CraftStageResult,
    book: NameBook,
    out_dir: Path,
    final_step: int | None = None,
) -> int:
    """連番 PNG を書き出して枚数を返す (ffmpeg の image2 入力用)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("f*.png"):
        old.unlink()
    count = 0
    for n, frame in iter_frames(cues, result, book, final_step):
        frame.convert("RGB").save(out_dir / f"f{n:05d}.png", compress_level=1)
        count = n + 1
    return count
