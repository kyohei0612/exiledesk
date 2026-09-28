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
from poe2tube.contracts.craft_stage import CraftStageResult, StageStep
from poe2tube.names import NameBook
from poe2tube.render.frame import compose_frame, render_base, render_panel_layer
from poe2tube.render.overlay_fx import CHAPTER_SECONDS, HIT_START, draw_chapter, draw_hit
from poe2tube.script.model import Line
from poe2tube.video.timeline import Cue, scene_changed

log = structlog.get_logger()
POP_SECONDS = 0.35
POP_DELAY = 0.15
SLIDE_SECONDS = 0.3
SLIDE_PX = 60
ZOOM_SECONDS = 0.35  # アイテムへ寄っていく時間


def hit_zoom(t: float) -> float:
    """打つ行の拡大: 手つきの間は棚とアイテム (1)、付く直前から 0.35 秒でアイテムへ寄る (2)."""
    start = HIT_START - 0.35
    if t <= start:
        return 1.0
    return 1.0 + min(1.0, (t - start) / 0.35)


def chapter_lead(new_chapter: bool) -> float:
    """章が変わった行は、章カードを出す間だけパネルと打った瞬間を後ろへずらす."""
    return CHAPTER_SECONDS if new_chapter else 0.0


CLIP_SLOWMO = 1  # ExileDesk 側で手つきが見やすくなったので等速 (v0.1.311)


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


def sound_events(
    cues: list[Cue],
    book: NameBook,
    n_steps: int = 0,
    result: CraftStageResult | None = None,
) -> list[SoundEvent]:
    """SE を鳴らす時刻: 冒頭 / 画面切替 (完成工程なら成功音) / 小道具ポップ / 驚きの台詞."""
    events = [SoundEvent(0.0, "start")]
    prev = None
    prev_section: str | None = None
    for c in cues:
        sc = c.line.scene
        new_chapter = prev is not None and c.section != prev_section
        lead = chapter_lead(new_chapter)
        if new_chapter:
            events.append(SoundEvent(c.start, "chapter"))
        if result is not None and stage_hit(prev, c.line) and sc.step:
            at = c.start + lead + HIT_START
            events.append(SoundEvent(at, hit_sound(result.steps[sc.step - 1])))
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
        prev_section = c.section
    return events


def hit_sound(step: StageStep) -> str:
    """結果ポップに合わせた SE: 色が変わった / MOD が付いた / 消えただけ."""
    ch = step.changed
    if ch.rarity_from != ch.rarity_to:
        return "hit_rarity"
    return "hit_added" if ch.added else "hit_removed"


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
    prev_zoom = False
    for i, c in enumerate(cues):
        props = [f.key for f in book.find_in_text(c.line.text)]
        base = render_base(c.section, c.index / len(cues))
        nxt = cues[i + 1].line if i + 1 < len(cues) else None
        is_hit = stage_hit(prev, c.line)
        # 拡大: 手を打つ直前の行 (「○○を使うわね」) から、打った行まで
        zoom_on = c.line.scene.kind == "stage" and (
            is_hit or (nxt is not None and stage_hit(c.line, nxt))
        )
        panel = render_panel_layer(
            c.line, result, final_step=final_step, zoom=1.0 if zoom_on else 0.0
        )
        # 打った瞬間の連番 (ExileDesk の演出そのもの) があれば、行の頭はそれを 1 コマずつ貼る
        clip = clip_frames(result.plan, c.line.scene.step or 0) if is_hit else []
        animate = panel is not None and scene_changed(prev, c.line) and not clip
        static = _with_panel(base, panel, 0, 1.0)
        hit_step = result.steps[c.line.scene.step - 1] if is_hit and c.line.scene.step else None
        new_chapter = prev_section is not None and prev_section != c.section
        lead = chapter_lead(new_chapter)
        for k, mouth in enumerate(c.mouth_levels):
            t = k / fps
            tl = t - lead  # 章カードの後の時間
            kl = int(round(tl * fps))
            if tl < 0:
                frame_static = base  # 章カードの間はパネルを出さない (被せない)
            elif 0 <= kl < len(clip) * CLIP_SLOWMO:
                shot = clip[kl // CLIP_SLOWMO]
                layer = render_panel_layer(
                    c.line, result, stage_shot=shot, final_step=final_step, zoom=hit_zoom(tl)
                )
                frame_static = _with_panel(base, layer, 0, 1.0)
            elif is_hit and clip:
                layer = render_panel_layer(c.line, result, final_step=final_step, zoom=2.0)
                frame_static = _with_panel(base, layer, 0, 1.0)
            elif zoom_on and not prev_zoom and tl < ZOOM_SECONDS:
                layer = render_panel_layer(
                    c.line, result, final_step=final_step, zoom=tl / ZOOM_SECONDS
                )
                frame_static = _with_panel(base, layer, 0, 1.0)
            elif (animate or lead > 0) and tl < SLIDE_SECONDS and panel is not None:
                dy, alpha = slide_in(tl)
                frame_static = _with_panel(base, panel, dy, alpha)
            else:
                frame_static = static
            scale = pop_scale(t) if props else 1.0
            frame = compose_frame(frame_static, c.line, mouth, props, scale)
            if hit_step is not None:
                draw_hit(frame, hit_step, tl)
            if new_chapter:
                draw_chapter(frame, c.section, t)
            yield n, frame
            n += 1
        prev_zoom = zoom_on
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
