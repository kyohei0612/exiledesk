"""撮影クリップの「付いた瞬間」を画像の変化から見つける.

ExileDesk の手つきの速さはバージョンで変わる (v0.1.311 は約 2.5 秒、v0.1.314 は約 1.8 秒)。
決め打ちの秒数だと、ずんだもんが付く前に驚いたり、付いた瞬間に画面が切り替わったりする
(kyohei 2026-09-28)。そこでクリップごとにアイテム枠が一番大きく変わったコマを探す。
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
import numpy.typing as npt
from PIL import Image

from poe2tube.capture.stage import clip_frames
from poe2tube.contracts.craft_stage import CraftStagePlan
from poe2tube.render.overlay_fx import CHAPTER_SECONDS
from poe2tube.script.model import Line, Scene

# アイテム枠 + 棚のあたり (1920x1080 の撮影画面を 1/4 にした座標)。下 15% の空きは見ない
_REGION = (40, 0, 380, 230)
HOLD_AFTER_ATTACH = 0.5  # 付いた後の演出が終わってから、次の画面に行くまでの余白 (秒)
LAND_WITHOUT_PREROLL = 0.4  # 前の行で手つきを流せない時、反応の行の頭から付くまでの秒


@lru_cache(maxsize=64)
def _attach_index(frames: tuple[str, ...]) -> int:
    """変化量が最大値の半分を初めて超えたコマ。最大そのものは光る演出の山で、付いた瞬間より遅い."""
    prev: npt.NDArray[np.float32] | None = None
    diffs = [0.0]
    x0, y0, x1, y1 = _REGION
    for f in frames:
        a = np.asarray(Image.open(f).convert("L").resize((480, 270))).astype(np.float32)
        cur = a[y0:y1, x0:x1]
        if prev is not None:
            diffs.append(float(np.abs(cur - prev).mean()))
        prev = cur
    peak = max(diffs)
    return next(i for i, d in enumerate(diffs) if d >= peak * 0.5) if peak > 0 else 0


def attach_index(clip: list[Path]) -> int:
    """クリップの中で付いた瞬間のコマ番号 (クリップが空なら 0)."""
    if len(clip) < 2:
        return 0
    return _attach_index(tuple(str(p) for p in clip))


HitKey = tuple[str | None, int]  # (実演, 手)


def stage_hit(prev: Line | None, cur: Line, shown: set[HitKey] | None = None) -> bool:
    """この行で「手を打つ」瞬間か: stage の step が初めて出てくる (0 = 開始前は除く).

    ``shown`` (もう打った step) を渡すと、雑談を挟んで同じ step に戻った行では打ち直さない
    (kyohei 2026-09-28: 「王者を使うわね」で前の手の撮影と結果の文字がもう一度出ていた)。
    """
    sc = cur.scene
    if sc.kind != "stage" or not sc.step or (shown is not None and (sc.demo, sc.step) in shown):
        return False
    if sc.focus is not None or sc.tags or sc.still or sc.offers:
        # スポットライト・タグの札・姿だけは「見る」行。打つ演出は流さない (2026-09-29 / 10-02)
        return False
    if prev is None or prev.scene.kind != "stage":
        return True
    if prev.scene.offers:
        return True  # 発現の 3 択 (打つ前の姿) の次の行が、発現した瞬間 (2026-10-03)
    return prev.scene.step != sc.step or prev.scene.demo != sc.demo


@dataclass(frozen=True)
class HitPlan:
    """打つ行 1 つぶんの段取り.

    preroll=True: 1 つ前の行 (「○○を使うわね」) の終わりで手つき (clip[:attach]) を流し、
    反応の行の頭ちょうどで付く。反応の行は clip[attach:] から始める。
    """

    step: int
    clip: tuple[Path, ...]
    attach: int
    preroll: bool
    fps: int = 24
    demo: str | None = None

    @property
    def start(self) -> int:
        """反応の行で最初に出すコマ."""
        return (
            self.attach
            if self.preroll
            else max(0, self.attach - int(LAND_WITHOUT_PREROLL * self.fps))
        )

    @property
    def min_seconds(self) -> float:
        """反応の行の最短の長さ: 付いた後の演出を見せ切って、少し余白を置く."""
        return (len(self.clip) - self.start) / self.fps + HOLD_AFTER_ATTACH

    @property
    def land_at(self) -> float:
        """反応の行の頭から付くまでの秒 (SE を鳴らす所)."""
        return 0.0 if self.preroll else (self.attach - self.start) / self.fps


def plan_hits(
    lines: list[tuple[str, Line]],
    plan: CraftStagePlan | Callable[[Scene], CraftStagePlan],
    fps: int = 24,
) -> dict[int, HitPlan]:
    """{行の位置 (0 始まり): HitPlan}。(章名, 行) の並びだけで決まる (尺を作る前に使える).

    ``plan`` は 1 つの手順か、場面から手順を引く関数 (複数の実演がある回、ResultSet.plan_of)。
    """
    plan_of = plan if callable(plan) else (lambda _sc: plan)
    out: dict[int, HitPlan] = {}
    shown: set[HitKey] = set()
    prev: Line | None = None
    prev_section: str | None = None
    for i, (section, line) in enumerate(lines):
        new_chapter = prev_section is not None and prev_section != section
        if stage_hit(prev, line, shown) and line.scene.step:
            step, demo = line.scene.step, line.scene.demo
            shown.add((demo, step))
            clip = clip_frames(plan_of(line.scene), step)
            if clip:
                # 手つきは同じ実演の「使うわね」の行でだけ流す (別のアイテムの画面には流さない)
                preroll = (
                    prev is not None
                    and prev.scene.kind == "stage"
                    and prev.scene.demo == demo
                    and not new_chapter
                    # 発現の 3 択の絵は発現の前の姿そのもの。手つきを重ねるとちらつく
                    and not prev.scene.offers
                )
                out[i] = HitPlan(step, tuple(clip), attach_index(clip), preroll, fps, demo)
        prev, prev_section = line, section
    return out


REVEAL_LEAD = 0.6  # 画面の変化 (付く・正解が緑になる) を見せてから声を出すまでの秒
REVEAL_AT = 0.5  # ExileDesk の答えを出す動き (use-anim.ts の revealAt の既定) の割合


def plan_cue_timing(
    lines: list[tuple[str, Line]],
    wav_seconds: list[float],
    hits: dict[int, HitPlan],
    intros: dict[int, tuple[float, bool]] | None = None,
) -> tuple[dict[int, float], dict[int, float]]:
    """(行の最短の長さ, 声を遅らせる秒) を行の位置で。動画づくりと check_sync が同じ物を使う.

    ネタバレ防止 (kyohei 2026-09-29「音声が先で画面より先に言ってしまう」):
    - 付く行: 付いて結果の文字が出てから REVEAL_LEAD 秒後にずんだもんが反応する
    - クイズの答えの行 (前の行がカウントダウン): カードが緑になって正解の音が鳴ってから「正解は…」
    """
    hold: dict[int, float] = {}
    delay: dict[int, float] = {}
    for i, (_sec, ln) in enumerate(lines):
        prev = lines[i - 1][1] if i else None
        if i in hits or (prev is not None and prev.scene.countdown and ln.scene.kind == "quiz"):
            delay[i] = REVEAL_LEAD
        if i in hits:
            hold[i] = hits[i].min_seconds + delay.get(i, 0.0)
        if intros and i in intros:  # ⑰ の画面の登場の動きは最後まで見せる
            secs, reveal = intros[i]
            if reveal:  # 隠した所から答えが出る動き: 答えが出てから (動きの半ば) 声を出す
                delay[i] = max(delay.get(i, 0.0), min(secs * REVEAL_AT + REVEAL_LEAD, 3.0))
            hold[i] = max(hold.get(i, 0.0), secs + 0.2)
        if ln.scene.countdown:  # クイズ: 読み上げの後に数える秒ぶん延ばす (ADR 005)
            hold[i] = max(hold.get(i, 0.0), wav_seconds[i] + 0.3 + ln.scene.countdown)
        if i and lines[i - 1][0] != lines[i][0]:  # 章が変わった行: 章名カードの間は喋らない
            delay[i] = CHAPTER_SECONDS + delay.get(i, 0.0)
            if i in hold:
                hold[i] += CHAPTER_SECONDS
    return hold, delay
