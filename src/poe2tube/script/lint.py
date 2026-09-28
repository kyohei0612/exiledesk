"""台本の機械チェック (docs/script_rules/_all.md の「自己チェック」をコードにした物).

Claude が書いた台本を受け入れる前に通す。結果 JSON との噛み合いは
``VideoScript.check_against`` が担当し、ここは文体・テンポ・画面の切り替えを見る。
セクション単位 (``lint_section``) と全体 (``lint_script``) の 2 段。
"""

from __future__ import annotations

import re

from poe2tube.script.model import CHARS_PER_MINUTE, Line, Section, VideoScript

MAX_SENTENCE = 40
MAX_SAME_SCENE_RUN = 3
INTRO_MAX_RATIO = 0.2
SECTION_TOLERANCE = 0.35  # 章ごとの尺のずれ許容 (全体は ±25%)
POLITE = re.compile(r"(です|ます|ました|でしょう)[。！？]")
# ゲーム内表記に合わせる (kyohei 2026-09-27)。左は使わない、右に言い換える
BANNED_TERMS = {"接頭": "プレフィックス", "接尾": "サフィックス"}
# 次回予告・次回の内容には触れない (kyohei 2026-09-28 確定)
NEXT_TIME = re.compile(r"次回|次の動画|次は.{0,20}(回|動画)|お楽しみに")


def lint_lines(lines: list[Line], offset: int = 0, n_steps: int | None = None) -> list[str]:
    """行ごとの規則 (文体・用語・画面の連続・工程の参照)。``offset`` は通し番号の起点."""
    problems: list[str] = []
    for k, ln in enumerate(lines, start=1):
        i = offset + k
        for s in re.split(r"[。！？]", ln.text):
            if len(s) > MAX_SENTENCE:
                problems.append(f"line {i}: 一文が {len(s)} 字 (40 字以内): {s[:20]}…")
        if ln.speaker == "zundamon" and "のだ" not in ln.text:
            problems.append(f"line {i}: ずんだもんの語尾に「のだ」が無い: {ln.text}")
        if POLITE.search(ln.text):
            problems.append(f"line {i}: 敬語 (です/ます) は使わない: {ln.text}")
        if NEXT_TIME.search(ln.text):
            problems.append(f"line {i}: 次回予告・次回の内容には触れない: {ln.text}")
        for ng, ok in BANNED_TERMS.items():
            if ng in ln.text:
                problems.append(f"line {i}: 「{ng}」は使わない → 「{ok}」: {ln.text}")
        main = ln.scene.demo is None  # 追加の実演の手数は stage_coverage で見る
        if main and n_steps is not None and ln.scene.step is not None and ln.scene.step > n_steps:
            problems.append(f"line {i}: step {ln.scene.step} は結果 JSON に無い (最大 {n_steps})")
    run = 1
    for k, (prev, cur) in enumerate(zip(lines, lines[1:], strict=False), start=2):
        same = (prev.scene.kind, prev.scene.step, prev.scene.show_steps) == (
            cur.scene.kind,
            cur.scene.step,
            cur.scene.show_steps,
        )
        run = run + 1 if same else 1
        if run > MAX_SAME_SCENE_RUN:
            problems.append(
                f"line {offset + k}: 同じ画面が {run} 行続く (前の章の終わりも含む): "
                f"{cur.scene.kind} step={cur.scene.step} → この行の画面を変える"
            )
            run = 1
    return problems


def lint_section(section: Section, n_steps: int | None = None, offset: int = 0) -> list[str]:
    """章 1 つの検査: 行の規則 + その章の尺 (±35%)."""
    problems = lint_lines(section.lines, offset, n_steps)
    chars = sum(len(ln.spoken) for ln in section.lines)
    est = chars / CHARS_PER_MINUTE * 60
    lo, hi = section.target_seconds * (1 - SECTION_TOLERANCE), section.target_seconds * (
        1 + SECTION_TOLERANCE
    )
    if not lo <= est <= hi:
        problems.append(
            f"「{section.name}」の尺の見込み {est:.0f} 秒が"
            f"目標 {section.target_seconds} 秒 ±35% の外"
            f" (今 {chars} 字、目標 {int(section.target_seconds * CHARS_PER_MINUTE / 60)} 字)"
        )
    return problems


def lint_script(
    script: VideoScript, n_steps: int | None = None, demo_steps: dict[str, int] | None = None
) -> list[str]:
    """全体の検査。``n_steps`` はメインの結果 JSON の手数、``demo_steps`` は追加の実演ごとの手数."""
    lines = script.lines
    problems = lint_lines(lines, 0, n_steps)
    if script.layout == "short":
        # ショートは導入・聞き役の比率・実践の手の抜けを見ない (ADR 005)。尺だけ見る
        est = script.estimated_seconds()
        if not script.target_seconds * 0.75 <= est <= script.target_seconds * 1.25:
            problems.append(f"尺の見込み {est:.0f} 秒が目標 {script.target_seconds} 秒 ±25% の外")
        return problems
    zunda = sum(1 for ln in lines if ln.speaker == "zundamon")
    ratio = zunda / len(lines) if lines else 0
    if not 0.25 <= ratio <= 0.5:
        problems.append(f"聞き役 (ずんだもん) の比率 {ratio:.0%} が 25〜50% の外")
    if script.sections:
        intro = script.sections[0]
        intro_chars = sum(len(ln.spoken) for ln in intro.lines)
        if (
            intro_chars > script.char_count() * INTRO_MAX_RATIO
            and intro_chars > 30 * CHARS_PER_MINUTE / 60
        ):
            problems.append(f"導入が長い ({intro_chars} 字、30 秒以内 = 約 160 字)")
    lo, hi = script.target_seconds * 0.75, script.target_seconds * 1.25
    est = script.estimated_seconds()
    if not lo <= est <= hi:
        problems.append(f"尺の見込み {est:.0f} 秒が目標 {script.target_seconds} 秒 ±25% の外")
    problems += stage_coverage(script, n_steps, demo_steps)
    return problems


def stage_coverage(
    script: VideoScript, n_steps: int | None, demo_steps: dict[str, int] | None = None
) -> list[str]:
    """実践は 1 手 1 行以上: 実演ごとに stage の step が 1..n を飛ばさず出る (2026-09-27)."""
    by_demo: dict[str | None, set[int]] = {}
    for ln in script.lines:
        if ln.scene.kind == "stage" and ln.scene.step:
            by_demo.setdefault(ln.scene.demo, set()).add(ln.scene.step)
    if not by_demo:
        return ["実践 (stage) の行が無い"]
    wanted: dict[str | None, int | None] = {None: n_steps}
    wanted.update((k, v) for k, v in (demo_steps or {}).items())
    problems: list[str] = []
    for key, n in wanted.items():
        steps = by_demo.get(key)
        if not steps:
            if key is not None:
                problems.append(f"実演 {key!r} の stage 行が無い")
            continue
        last = n or max(steps)
        missing = [s for s in range(1, last + 1) if s not in steps]
        if missing:
            name = "" if key is None else f"実演 {key!r} の"
            problems.append(
                f"実践で飛ばした手がある (1 手 1 行以上): {name}step {missing} の stage 行が無い"
            )
    return problems
