"""コマ作り: 行 (Cue) ごとに静的な層を 1 回描き、fps ごとに口パク + 小道具を重ねる.

行 i のコマは「行 i と 1 つ前の行」だけで決まる (前の画面・前の章・前の拡大)。なので
``cue_frames(ctx, i, k0, k1)`` で行の途中からでも作れ、別々のプロセスで並べて作れる
(video/parallel.py、kyohei 2026-10-04「並列だな 10 分の 1 になるなら使わない手はない」)。
描き方そのものは animate.py の部品 (スライド・ポップ・拡大) を使う。
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import structlog
from PIL import Image

from poe2tube.capture.anim import anim_frames, anim_query, holds_first
from poe2tube.capture.views import shot_for
from poe2tube.config.settings import get_settings
from poe2tube.contracts.craft_stage import CraftStageResult
from poe2tube.names import NameBook
from poe2tube.render.frame import compose_frame, render_base, render_panel_layer
from poe2tube.render.overlay_fx import (
    CHAPTER_SECONDS,
    blur_bg,
    countdown_number,
    draw_chapter,
    draw_countdown,
    draw_hit,
)
from poe2tube.render.short_frame import compose_short
from poe2tube.video.animate import (
    CLIP_SLOWMO,
    COUNTDOWN_AT,
    SLIDE_SECONDS,
    ZOOM_SECONDS,
    chapter_lead,
    hit_zoom,
    pop_scale,
    slide_in,
)
from poe2tube.video.clip_timing import HitPlan, plan_hits
from poe2tube.video.results import ResultSet, as_set
from poe2tube.video.timeline import Cue, scene_changed

log = structlog.get_logger()


@dataclass(frozen=True)
class FrameContext:
    """コマ作りに要る物一式 (別のプロセスにも pickle で渡す)."""

    cues: list[Cue]
    rs: ResultSet
    book: NameBook
    final_step: int | None
    short: bool
    short_title: str | None
    fps: float
    hits: dict[int, HitPlan]
    progress: tuple[float, ...]  # 行ごとの進み具合のバー (章の何番目の何割、0〜1)
    zoom: bool = False  # 付ける瞬間の拡大 (設定 hit_zoom、既定は無し)

    @property
    def total(self) -> int:
        return sum(c.frames for c in self.cues)


def make_context(
    cues: list[Cue],
    result: CraftStageResult | ResultSet,
    book: NameBook,
    final_step: int | None = None,
    short: bool = False,
    short_title: str | None = None,
    n_sections: int | None = None,
) -> FrameContext:
    fps = cues[0].frames / cues[0].duration if cues else 24
    rs = as_set(result)
    hits = plan_hits([(c.section, c.line) for c in cues], rs.plan_of, round(fps))
    progress = chapter_progress([c.section for c in cues], n_sections)
    zoom = get_settings().hit_zoom
    return FrameContext(cues, rs, book, final_step, short, short_title, fps, hits, progress, zoom)


def chapter_progress(sections: list[str], n_sections: int | None = None) -> tuple[float, ...]:
    """進み具合のバー: (章の番号 + 章の中の何行目 / 章の行数) / 章の数.

    後の章が決まらなくても、前の章のバーが変わらない (章ごとに先に映像を作れる、2026-10-04)。
    """
    order: list[str] = []
    for name in sections:
        if not order or order[-1] != name:
            order.append(name)
    total = max(n_sections or 0, len(order), 1)
    counts = {k: sum(1 for s in sections if s == name) for k, name in enumerate(order)}
    out: list[float] = []
    k, pos = 0, 0
    for i, name in enumerate(sections):
        if i and sections[i - 1] != name:
            k, pos = k + 1, 0
        out.append((k + pos / counts[k]) / total)
        pos += 1
    return tuple(out)


def zoom_on(ctx: FrameContext, i: int) -> bool:
    """行 i が打つ行か、次の行で打つ (手つきを流す) stage の行か."""
    c = ctx.cues[i]
    if not ctx.zoom:
        return False
    # 次の行で打つ時も寄る。ただし章はまたがない (章ごとに作れるように)
    same = i + 1 < len(ctx.cues) and ctx.cues[i + 1].section == c.section
    return c.line.scene.kind == "stage" and (i in ctx.hits or (same and (i + 1) in ctx.hits))


def cue_frames(
    ctx: FrameContext, i: int, k0: int = 0, k1: int | None = None
) -> Iterator[Image.Image]:
    """行 i の k0〜k1 コマ目 (k1 は含まない) を順に返す."""
    cues, rs, fps = ctx.cues, ctx.rs, ctx.fps
    c = cues[i]
    k1 = len(c.mouth_levels) if k1 is None else k1
    prev = cues[i - 1].line if i > 0 else None
    prev_section = cues[i - 1].section if i > 0 else None
    prev_zoom = zoom_on(ctx, i - 1) if i > 0 else False
    res = rs.of(c.line.scene)  # この行の画面が指す実演の結果
    fin = ctx.final_step if c.line.scene.demo is None else None
    props = [f.key for f in ctx.book.find_in_text(c.line.text)]
    base = render_base(c.section, ctx.progress[i])
    hp: HitPlan | None = ctx.hits.get(i)
    is_hit = hp is not None
    nxt_hp = ctx.hits.get(i + 1)
    # 次の行で付くなら、この行 (「○○を使うわね」) の終わりで手つきを流す
    pre: list[Path] = list(nxt_hp.clip[: nxt_hp.attach]) if nxt_hp and nxt_hp.preroll else []
    pre = pre[-len(c.mouth_levels) :] if pre else []
    pre_from = len(c.mouth_levels) - len(pre)
    zoom = zoom_on(ctx, i)
    extra = shot_for(c.line.scene, rs)  # 段の表・比べる・スポットライト (ExileDesk ⑪)
    # ⑰ の画面の登場の動き (録画済みなら、スライドの代わりに行の頭で流す)
    intro = anim_frames(anim_query(c.line.scene, prev.scene if prev else None, rs))
    if intro and holds_first(c.line.scene):  # 質問の行: 動きの前の絵で止める (答えを見せない)
        extra, intro = intro[0], []
    panel = render_panel_layer(
        c.line, res, stage_shot=extra, final_step=fin, zoom=1.0 if zoom else 0.0
    )
    # 反応の行は付いた瞬間 (preroll 無しなら少し手前) から連番を貼る
    clip = list(hp.clip[hp.start :]) if hp else []
    animate = panel is not None and scene_changed(prev, c.line) and not clip and not intro
    static = with_panel(base, panel, 0, 1.0)
    hit_step = res.steps[hp.step - 1] if hp else None
    land = hp.land_at if hp else 0.0  # 結果の文字は付いた瞬間から数える
    new_chapter = prev_section is not None and prev_section != c.section
    lead = chapter_lead(new_chapter)
    # 同じ絵のコマは描き直さない (止まった画面 + 同じ口の形 + 同じ小道具の大きさ)。時間で変わる物
    # (付いた瞬間の文字・秒読み・章名のカード・手つきのコマ) がある時は使い回さない (2026-10-04)
    memo: dict[tuple[bool, int, float], Image.Image] = {}
    for k in range(k0, k1):
        mouth = c.mouth_levels[k]
        t = k / fps
        tl = t - lead  # 章カードの後の時間
        kl = int(round(tl * fps))
        if tl < 0:
            frame_static = base  # 章カードの間はパネルを出さない (被せない)
        elif pre and k >= pre_from:
            layer = render_panel_layer(c.line, res, stage_shot=pre[k - pre_from], final_step=fin)
            frame_static = with_panel(base, layer, 0, 1.0)
        elif 0 <= kl < len(intro):
            layer = render_panel_layer(c.line, res, stage_shot=intro[kl], final_step=fin)
            frame_static = with_panel(base, layer, 0, 1.0)
        elif 0 <= kl < len(clip) * CLIP_SLOWMO:
            shot = clip[kl // CLIP_SLOWMO]
            layer = render_panel_layer(
                c.line, res, stage_shot=shot, final_step=fin, zoom=hit_zoom(tl) if ctx.zoom else 0.0
            )
            frame_static = with_panel(base, layer, 0, 1.0)
        elif is_hit and clip:
            # 付いた後は録画の最後のコマで止める (別に撮った静止画だと大きさ・位置が違って絵が飛ぶ)
            layer = render_panel_layer(
                c.line, res, stage_shot=clip[-1], final_step=fin, zoom=2.0 if ctx.zoom else 0.0
            )
            frame_static = with_panel(base, layer, 0, 1.0)
        elif zoom and not prev_zoom and tl < ZOOM_SECONDS:
            layer = render_panel_layer(c.line, res, final_step=fin, zoom=tl / ZOOM_SECONDS)
            frame_static = with_panel(base, layer, 0, 1.0)
        elif (animate or lead > 0) and tl < SLIDE_SECONDS and panel is not None:
            dy, alpha = slide_in(tl)
            frame_static = with_panel(base, panel, dy, alpha)
        else:
            frame_static = static
        cd = c.line.scene.countdown
        num = countdown_number(c.duration, cd, t) if cd else None
        steady = frame_static is static or frame_static is base
        reuse = steady and hit_step is None and num is None
        scale = pop_scale(t) if props else 1.0
        key = (frame_static is static, mouth, round(scale, 4))
        if ctx.short:
            if reuse and key in memo:
                yield memo[key]
                continue
            # 縦: 結果の文字・数字はパネルの中に描いてから切り出す。章カードは出さない (ADR 005)
            tmp = frame_static.copy() if hit_step is not None else frame_static
            if hit_step is not None:
                draw_hit(tmp, hit_step, tl - land)
            out = compose_short(tmp, c.line, mouth, ctx.short_title, num)
            if reuse:
                memo[key] = out
            yield out
            continue
        card = new_chapter and t < CHAPTER_SECONDS  # 章名カードの間: テロップなし・背景はぼかし
        if reuse and not card and key in memo:
            yield memo[key]
            continue
        frame = compose_frame(frame_static, c.line, mouth, props, scale, telop=not card)
        if hit_step is not None:
            draw_hit(frame, hit_step, tl - land)
        if num is not None:
            draw_countdown(frame, num, COUNTDOWN_AT)
        if card:
            frame = blur_bg(frame)
            draw_chapter(frame, c.section, t)
        elif reuse:
            memo[key] = frame
        yield frame


def iter_frames(
    cues: list[Cue],
    result: CraftStageResult | ResultSet,
    book: NameBook,
    final_step: int | None = None,
    short: bool = False,
    short_title: str | None = None,
) -> Iterator[tuple[int, Image.Image]]:
    """(通し番号, フレーム) を 1 本の流れで順に返す。番号は 0 始まり."""
    ctx = make_context(cues, result, book, final_step, short, short_title)
    n = 0
    for i, c in enumerate(ctx.cues):
        for frame in cue_frames(ctx, i):
            yield n, frame
            n += 1
        log.info("frames", line=c.index, scene=c.line.scene.kind, done=n, total=ctx.total)


def with_panel(base: Image.Image, panel: Image.Image | None, dy: int, alpha: float) -> Image.Image:
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
    """連番 PNG を書き出して枚数を返す (``--keep-frames`` の確かめ用)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("f*.png"):
        old.unlink()
    count = 0
    for n, frame in iter_frames(cues, result, book, final_step, short, short_title):
        frame.convert("RGB").save(out_dir / f"f{n:05d}.png", compress_level=1)
        count = n + 1
    return count
