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
        for ng, ok in BANNED_TERMS.items():
            if ng in ln.text:
                problems.append(f"line {i}: 「{ng}」は使わない → 「{ok}」: {ln.text}")
        if n_steps is not None and ln.scene.step is not None and ln.scene.step > n_steps:
            problems.append(f"line {i}: step {ln.scene.step} は結果 JSON に無い (最大 {n_steps})")
    run = 1
    for prev, cur in zip(lines, lines[1:], strict=False):
        same = (prev.scene.kind, prev.scene.step, prev.scene.show_steps) == (
            cur.scene.kind,
            cur.scene.step,
            cur.scene.show_steps,
        )
        run = run + 1 if same else 1
        if run > MAX_SAME_SCENE_RUN:
            problems.append(f"同じ画面が {run} 行続く: {cur.scene.kind} step={cur.scene.step}")
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


def lint_script(script: VideoScript, n_steps: int | None = None) -> list[str]:
    """全体の検査。``n_steps`` は結果 JSON の手数 (実践の抜け検出用)."""
    lines = script.lines
    problems = lint_lines(lines, 0, n_steps)
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
    problems += stage_coverage(script, n_steps)
    return problems


def stage_coverage(script: VideoScript, n_steps: int | None) -> list[str]:
    """実践は 1 手 1 行以上: stage の step が 1..n を 1 つも飛ばさず出てくる (kyohei 2026-09-27)."""
    stage_steps = sorted(
        {ln.scene.step for ln in script.lines if ln.scene.kind == "stage" and ln.scene.step}
    )
    if not stage_steps:
        return ["実践 (stage) の行が無い"]
    last = n_steps or max(stage_steps)
    missing = [s for s in range(1, last + 1) if s not in stage_steps]
    if missing:
        return [f"実践で飛ばした手がある (1 手 1 行以上): step {missing} の stage 行が無い"]
    return []
