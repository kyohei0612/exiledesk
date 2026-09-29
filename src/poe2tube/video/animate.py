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
from poe2tube.capture.anim import anim_frames, anim_query, holds_first
from poe2tube.capture.views import shot_for
from poe2tube.contracts.craft_stage import CraftStageResult, StageStep
from poe2tube.names import NameBook
from poe2tube.render.frame import compose_frame, render_base, render_panel_layer
from poe2tube.render.overlay_fx import (
    CHAPTER_SECONDS,
    HIT_START,
    blur_bg,
    countdown_number,
    draw_chapter,
    draw_countdown,
    draw_hit,
)
from poe2tube.render.short_frame import compose_short
from poe2tube.video.clip_timing import HitPlan, plan_hits
from poe2tube.video.results import ResultSet, as_set
from poe2tube.video.timeline import Cue, scene_changed

log = structlog.get_logger()
POP_SECONDS = 0.35
COUNTDOWN_AT = (1740, 250)  # 横長: パネルの右上の外 (カードに被せない)。ショートは別の位置
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
    result: CraftStageResult | ResultSet | None = None,
) -> list[SoundEvent]:
    """SE を鳴らす時刻: 冒頭 / 画面切替 (完成工程なら成功音) / 小道具ポップ / 驚きの台詞."""
    events = [SoundEvent(0.0, "start")]
    prev = None
    prev_section: str | None = None
    rs = as_set(result) if result is not None else None
    hits = plan_hits([(c.section, c.line) for c in cues], rs.plan_of) if rs else {}
    for i, c in enumerate(cues):
        sc = c.line.scene
        hp = hits.get(i)
        new_chapter = prev is not None and c.section != prev_section
        lead = chapter_lead(new_chapter)
        if new_chapter:
            events.append(SoundEvent(c.start, "chapter"))
        if rs is not None and hp is not None:
            # 付いた瞬間に鳴らす (手つきは前の行で流し終わっている)
            step = rs.of(sc).steps[hp.step - 1]
            events.append(SoundEvent(c.start + lead + hp.land_at, hit_sound(step)))
        if prev is not None and scene_changed(prev, c.line) and hp is None:
            is_final = (
                sc.kind in ("stack", "item")
                and sc.demo is None
                and sc.step == n_steps
                and sc.highlight
                in (
                    "rarity",
                    "name",
                )
            )
            kind = "complete" if is_final else "slide"
            events.append(SoundEvent(c.start, kind))
        if sc.countdown:  # クイズ: 行の最後の秒で 1 秒ごとにピッ
            first = c.start + c.duration - sc.countdown
            events += [SoundEvent(first + k, "tick") for k in range(sc.countdown)]
        if prev is not None and prev.scene.countdown:
            events.append(SoundEvent(c.start, "correct"))
        if book.find_in_text(c.line.text):
            events.append(SoundEvent(c.start + POP_DELAY, "pop"))
        if c.line.emotion == "surprised":
            events.append(SoundEvent(c.start, "shock"))
        prev = c.line
        prev_section = c.section
    return events


def hit_sound(step: StageStep) -> str:
    """結果ポップに合わせた SE: 色が変わった / MOD が付いた / 消えただけ."""
    ch, a, b = step.changed, step.after, step.before
    if not step.applied or a.destroyed or (ch.removed and not ch.added):
        return "hit_removed"
    if ch.rarity_from != ch.rarity_to or (a.unique is not None and b.unique is None):
        return "hit_rarity"
    improved = (
        ch.added
        or a.quality > b.quality
        or a.sockets > b.sockets
        or (a.gem_sockets or 0) > (b.gem_sockets or 0)
        or len(a.augments) > len(b.augments)
        or (a.disposed and not b.disposed)
    )
    return "hit_added" if improved else "hit_removed"


def iter_frames(
    cues: list[Cue],
    result: CraftStageResult | ResultSet,
    book: NameBook,
    final_step: int | None = None,
    short: bool = False,
    short_title: str | None = None,
) -> Iterator[tuple[int, Image.Image]]:
    """(通し番号, フレーム) を順に返す。番号は 0 始まり."""
    total = sum(c.frames for c in cues)
    n = 0
    fps = cues[0].frames / cues[0].duration if cues else 24
    prev = None
    prev_section: str | None = None
    prev_zoom = False
    rs = as_set(result)
    hits = plan_hits([(c.section, c.line) for c in cues], rs.plan_of, round(fps))
    for i, c in enumerate(cues):
        res = rs.of(c.line.scene)  # この行の画面が指す実演の結果
        fin = final_step if c.line.scene.demo is None else None
        props = [f.key for f in book.find_in_text(c.line.text)]
        base = render_base(c.section, c.index / len(cues))
        hp: HitPlan | None = hits.get(i)
        is_hit = hp is not None
        nxt_hp = hits.get(i + 1)
        # 次の行で付くなら、この行 (「○○を使うわね」) の終わりで手つきを流す
        pre = list(nxt_hp.clip[: nxt_hp.attach]) if nxt_hp and nxt_hp.preroll else []
        pre = pre[-len(c.mouth_levels) :] if pre else []
        pre_from = len(c.mouth_levels) - len(pre)
        zoom_on = c.line.scene.kind == "stage" and (is_hit or nxt_hp is not None)
        extra = shot_for(c.line.scene, rs)  # 段の表・比べる・スポットライト (ExileDesk ⑪)
        # ⑰ の画面の登場の動き (録画済みなら、スライドの代わりに行の頭で流す)
        intro = anim_frames(anim_query(c.line.scene, prev.scene if prev else None, rs))
        if intro and holds_first(c.line.scene):  # 質問の行: 動きの前の絵で止める (答えを見せない)
            extra, intro = intro[0], []
        panel = render_panel_layer(
            c.line, res, stage_shot=extra, final_step=fin, zoom=1.0 if zoom_on else 0.0
        )
        # 反応の行は付いた瞬間 (preroll 無しなら少し手前) から連番を貼る
        clip = list(hp.clip[hp.start :]) if hp else []
        animate = panel is not None and scene_changed(prev, c.line) and not clip and not intro
        static = _with_panel(base, panel, 0, 1.0)
        hit_step = res.steps[hp.step - 1] if hp else None
        land = hp.land_at if hp else 0.0  # 結果の文字は付いた瞬間から数える
        new_chapter = prev_section is not None and prev_section != c.section
        lead = chapter_lead(new_chapter)
        for k, mouth in enumerate(c.mouth_levels):
            t = k / fps
            tl = t - lead  # 章カードの後の時間
            kl = int(round(tl * fps))
            if tl < 0:
                frame_static = base  # 章カードの間はパネルを出さない (被せない)
            elif pre and k >= pre_from:
                layer = render_panel_layer(
                    c.line, res, stage_shot=pre[k - pre_from], final_step=fin
                )
                frame_static = _with_panel(base, layer, 0, 1.0)
            elif 0 <= kl < len(intro):
                layer = render_panel_layer(c.line, res, stage_shot=intro[kl], final_step=fin)
                frame_static = _with_panel(base, layer, 0, 1.0)
            elif 0 <= kl < len(clip) * CLIP_SLOWMO:
                shot = clip[kl // CLIP_SLOWMO]
                layer = render_panel_layer(
                    c.line, res, stage_shot=shot, final_step=fin, zoom=hit_zoom(tl)
                )
                frame_static = _with_panel(base, layer, 0, 1.0)
            elif is_hit and clip:
                layer = render_panel_layer(c.line, res, stage_shot=extra, final_step=fin, zoom=2.0)
                frame_static = _with_panel(base, layer, 0, 1.0)
            elif zoom_on and not prev_zoom and tl < ZOOM_SECONDS:
                layer = render_panel_layer(c.line, res, final_step=fin, zoom=tl / ZOOM_SECONDS)
                frame_static = _with_panel(base, layer, 0, 1.0)
            elif (animate or lead > 0) and tl < SLIDE_SECONDS and panel is not None:
                dy, alpha = slide_in(tl)
                frame_static = _with_panel(base, panel, dy, alpha)
            else:
                frame_static = static
            cd = c.line.scene.countdown
            num = countdown_number(c.duration, cd, t) if cd else None
            if short:
                # 縦: 結果の文字・数字はパネルの中に描いてから切り出す。章カードは出さない (ADR 005)
                tmp = frame_static.copy() if hit_step is not None else frame_static
                if hit_step is not None:
                    draw_hit(tmp, hit_step, tl - land)
                yield n, compose_short(tmp, c.line, mouth, short_title, num)
                n += 1
                continue
            scale = pop_scale(t) if props else 1.0
            card = new_chapter and t < CHAPTER_SECONDS  # 章名カードの間: テロップなし・背景はぼかし
            frame = compose_frame(frame_static, c.line, mouth, props, scale, telop=not card)
            if hit_step is not None:
                draw_hit(frame, hit_step, tl - land)
            if num is not None:
                draw_countdown(frame, num, COUNTDOWN_AT)
            if card:
                frame = blur_bg(frame)
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
    result: CraftStageResult | ResultSet,
    book: NameBook,
    out_dir: Path,
    final_step: int | None = None,
    short: bool = False,
    short_title: str | None = None,
) -> int:
    """連番 PNG を書き出して枚数を返す (ffmpeg の image2 入力用)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("f*.png"):
        old.unlink()
    count = 0
    for n, frame in iter_frames(cues, result, book, final_step, short, short_title):
        frame.convert("RGB").save(out_dir / f"f{n:05d}.png", compress_level=1)
        count = n + 1
    return count
