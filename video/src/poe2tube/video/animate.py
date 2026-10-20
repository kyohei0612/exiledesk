"""コマの動きの部品 (スライド・ポップ・拡大) と効果音の時刻。コマを作る本体は video/frames.py.

飽き防止の動き:
- 画面が切り替わる行の頭 0.3 秒: パネルが下からスライドしながらフェードイン
- 小道具は行の頭 0.15 秒後にポップイン (少し行き過ぎて戻る)
"""

from __future__ import annotations

import structlog

from poe2tube.audio.mix import SoundEvent
from poe2tube.contracts.craft_stage import CraftStageResult, StageStep
from poe2tube.names import NameBook
from poe2tube.render.overlay_fx import (
    CHAPTER_SECONDS,
    HIT_START,
)
from poe2tube.video.clip_timing import plan_hits
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
