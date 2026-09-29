"""長い台本 (3 分以上) を「構成表 → 章ごと → 全体検査」で書かせる.

1. 構成表: Claude が章の名前・秒数・要点・使う工程と画面・橋渡しを JSON で決める (Outline)
2. 章ごと: ルール集 + brief + 結果 + 構成表 + ここまでの本文 を渡して、その章の lines を書かせる。
   章の検査 (文体・用語・画面の連続・尺 ±35%) を通るまで最大 N 回
3. 全体: 組み立てて check_against + lint_script。行番号付きの問題は該当章だけ書き直す
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

import structlog
from pydantic import ValidationError

from poe2tube.contracts.craft_stage import CraftStageResult
from poe2tube.script.brief import Brief
from poe2tube.script.lint import lint_section
from poe2tube.script.model import Section, VideoScript
from poe2tube.script.outline import Outline
from poe2tube.script.pob_digest import resists_block, resists_files
from poe2tube.script.writer import (
    Demos,
    Runner,
    demo_block,
    demo_files,
    demo_problems,
    extract_json,
    load_rules,
    result_digest,
)

log = structlog.get_logger()
LINE_REF = re.compile(r"line (\d+)")


@dataclass
class LongWriteResult:
    script: VideoScript
    outline: Outline
    attempts: dict[str, int] = field(default_factory=dict)


def _rules() -> str:
    return load_rules()


def outline_prompt(
    brief: Brief, result: CraftStageResult, feedback: list[str], demos: Demos | None = None
) -> str:
    parts = [
        "あなたは POE2Tube の台本作家です。"
        "まず 8 分級の台本の「構成表」だけを JSON で返してください。",
        "```markdown\n" + _rules() + "\n```",
        "## 題材 (brief)\n```json\n" + brief.model_dump_json(indent=2, by_alias=True) + "\n```",
        "## クラフトステージの結果\n```json\n" + result_digest(result) + "\n```",
        *demo_block(demos),
        *resists_block(brief),
        "## 構成表の形 (JSON だけを返す)\n```json\n"
        + json.dumps(
            {
                "title": "【PoE2 初心者】…",
                "sections": [
                    {
                        "name": "導入",
                        "target_seconds": 30,
                        "goal": "この章で視聴者ができるようになること",
                        "points": ["要点 1", "要点 2"],
                        "steps": [1, 2],
                        "scenes": ["item", "stage"],
                        "bridge": "次の章へ渡す最後の一言の方向性",
                    }
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n```",
        f"## 決まり\n- 章の秒数の合計は {brief.target_seconds} 秒 (±10%)\n"
        "- 最初の章は導入で 30 秒以内\n"
        "- stage を使う章の steps を全部合わせると、結果 JSON の全工程 (1〜"
        f"{len(result.steps)}) を漏れなく含む (実践は 1 手 1 行)\n"
        + (
            f"- 完成とみなす手は {brief.final_step} 手目。"
            "それ以降の手は『実際に打つとこうなる』の実験として扱う\n"
            if brief.final_step
            else ""
        )
        + "- brief の notes を全部どこかの章に割り当てる",
    ]
    if feedback:
        parts.append("## 前回の構成表の問題 (全部直すこと)\n- " + "\n- ".join(feedback))
    return "\n\n".join(parts)


def section_prompt(
    brief: Brief,
    result: CraftStageResult,
    outline: Outline,
    index: int,
    done: list[Section],
    feedback: list[str],
    demos: Demos | None = None,
) -> str:
    spec = outline.sections[index]
    so_far = [
        {"section": s.name, "lines": [f"{ln.speaker}: {ln.text}" for ln in s.lines]} for s in done
    ]
    parts = [
        f"あなたは POE2Tube の台本作家です。構成表の第 {index + 1} 章「{spec.name}」の本文だけを"
        " JSON で返してください。",
        "```markdown\n" + _rules() + "\n```",
        "## 題材 (brief)\n```json\n" + brief.model_dump_json(indent=2, by_alias=True) + "\n```",
        "## クラフトステージの結果 (この数字と名前だけを使う)\n```json\n"
        + result_digest(result)
        + "\n```",
        *demo_block(demos),
        *resists_block(brief),
        "## 構成表 (全体)\n```json\n" + outline.model_dump_json(indent=2) + "\n```",
        "## ここまでの本文 (続きとして自然につながるように。同じ説明を繰り返さない)\n```json\n"
        + json.dumps(so_far, ensure_ascii=False, indent=1)
        + "\n```",
        f"## この章の指定\n- name: {spec.name}\n- target_seconds: {spec.target_seconds}"
        f" (約 {spec.target_chars} 字、±35%)\n- goal: {spec.goal}\n- points: {spec.points}\n"
        f"- steps: {spec.steps}\n- scenes: {spec.scenes}\n- bridge: {spec.bridge}\n"
        "- 章の最後の行は bridge の方向性で締める (最終章はチャンネルの方針と、"
        "チャンネル登録・コメントのお願いで締める。次回予告はしない)",
        "## 出力の形 (JSON だけ)\n```json\n"
        + json.dumps(
            {
                "name": spec.name,
                "target_seconds": spec.target_seconds,
                "lines": [
                    {
                        "speaker": "zundamon",
                        "emotion": "troubled",
                        "text": "…なのだ。",
                        "speech": "(読みが素直なら省略)",
                        "scene": {"kind": "item", "step": 0},
                    }
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n```",
    ]
    if feedback:
        parts.append("## 前回のこの章の問題 (全部直すこと)\n- " + "\n- ".join(feedback))
    return "\n\n".join(parts)


def write_outline(
    brief: Brief,
    result: CraftStageResult,
    runner: Runner,
    max_attempts: int = 3,
    demos: Demos | None = None,
) -> tuple[Outline, int]:
    feedback: list[str] = []
    for attempt in range(1, max_attempts + 1):
        raw = runner(outline_prompt(brief, result, feedback, demos))
        try:
            outline = Outline.model_validate(json.loads(extract_json(raw)))
        except (ValueError, ValidationError) as e:
            feedback = [f"JSON が形式に合わない: {str(e)[:400]}"]
            continue
        problems = outline.check_against(brief, result)
        if not problems:
            log.info(
                "outline accepted", attempt=attempt, sections=[s.name for s in outline.sections]
            )
            return outline, attempt
        feedback = problems
        log.warning("outline rejected", attempt=attempt, problems=problems)
    raise RuntimeError(f"構成表が {max_attempts} 回で通らなかった: {feedback}")


def write_section(
    brief: Brief,
    result: CraftStageResult,
    outline: Outline,
    index: int,
    done: list[Section],
    runner: Runner,
    max_attempts: int = 3,
    extra_feedback: list[str] | None = None,
    demos: Demos | None = None,
) -> tuple[Section, int]:
    feedback = list(extra_feedback or [])
    offset = sum(len(s.lines) for s in done)
    for attempt in range(1, max_attempts + 1):
        raw = runner(section_prompt(brief, result, outline, index, done, feedback, demos))
        try:
            section = Section.model_validate(json.loads(extract_json(raw)))
        except (ValueError, ValidationError) as e:
            feedback = [f"JSON が形式に合わない: {str(e)[:400]}"]
            continue
        problems = lint_section(section, len(result.steps), offset)
        if not problems:
            log.info(
                "section accepted", name=section.name, attempt=attempt, lines=len(section.lines)
            )
            return section, attempt
        feedback = problems
        log.warning("section rejected", name=section.name, attempt=attempt, problems=problems)
    raise RuntimeError(
        f"章「{outline.sections[index].name}」が {max_attempts} 回で通らなかった: {feedback}"
    )


def write_script_long(
    brief: Brief,
    result: CraftStageResult,
    result_file: str,
    runner: Runner,
    max_attempts: int = 3,
    max_global_passes: int = 2,
    cache_dir: Path | None = None,
    demos: Demos | None = None,
) -> LongWriteResult:
    """``cache_dir`` を渡すと、通った構成表と章をその都度保存し、次回はそこから再開する
    (Claude 呼び出し 1 回 1〜3 分なので、途中で落ちた時に最初からやり直さない)。"""
    cache = _Cache(cache_dir)
    outline = cache.load_outline()
    attempts = {"outline": 0}
    if outline is None:
        outline, n = write_outline(brief, result, runner, max_attempts, demos)
        attempts["outline"] = n
        cache.save_outline(outline)
    sections: list[Section] = []
    for i in range(len(outline.sections)):
        cached = cache.load_section(i, outline.sections[i].name)
        if cached is not None:
            sections.append(cached)
            attempts[cached.name] = 0
            continue
        sec, n = write_section(
            brief, result, outline, i, sections, runner, max_attempts, demos=demos
        )
        sections.append(sec)
        attempts[sec.name] = n
        cache.save_section(i, sec)
    script = _assemble(brief, outline, sections, result_file, demos)
    for _ in range(max_global_passes):
        problems = demo_problems(script, result, demos)
        if not problems:
            break
        log.warning("script (long) rejected", problems=problems)
        targets = _sections_to_rewrite(script, problems)
        for i in targets:
            sec, n = write_section(
                brief, result, outline, i, sections[:i], runner, max_attempts, problems, demos
            )
            sections[i] = sec
            cache.save_section(i, sec)
            attempts[f"{sec.name}#rewrite"] = attempts.get(f"{sec.name}#rewrite", 0) + n
        script = _assemble(brief, outline, sections, result_file, demos)
    else:
        problems = demo_problems(script, result, demos)
        if problems:
            raise RuntimeError(f"全体検査が通らなかった: {problems}")
    return LongWriteResult(script, outline, attempts)


class _Cache:
    """構成表と章の途中保存 (cache_dir が None なら何もしない)."""

    def __init__(self, root: Path | None) -> None:
        self.root = root
        if root:
            root.mkdir(parents=True, exist_ok=True)

    def load_outline(self) -> Outline | None:
        if not self.root or not (self.root / "outline.json").exists():
            return None
        raw = (self.root / "outline.json").read_text(encoding="utf-8")
        log.info("outline loaded from cache", path=str(self.root))
        return Outline.model_validate_json(raw)

    def save_outline(self, outline: Outline) -> None:
        if self.root:
            (self.root / "outline.json").write_text(
                outline.model_dump_json(indent=2), encoding="utf-8"
            )

    def _section_path(self, i: int) -> Path:
        assert self.root is not None
        return self.root / f"section_{i:02d}.json"

    def load_section(self, i: int, name: str) -> Section | None:
        if not self.root or not self._section_path(i).exists():
            return None
        sec = Section.model_validate_json(self._section_path(i).read_text(encoding="utf-8"))
        if sec.name != name:
            return None
        log.info("section loaded from cache", name=name)
        return sec

    def save_section(self, i: int, sec: Section) -> None:
        if self.root:
            self._section_path(i).write_text(
                json.dumps(sec.model_dump(exclude_none=True), ensure_ascii=False, indent=2),
                encoding="utf-8",
            )


def _assemble(
    brief: Brief,
    outline: Outline,
    sections: list[Section],
    result_file: str,
    demos: Demos | None = None,
) -> VideoScript:
    return VideoScript(
        title=outline.title,
        target_seconds=brief.target_seconds,
        result_file=result_file,
        final_step=brief.final_step,
        demos=demo_files(brief.name, demos) if demos else {},
        resists=resists_files(brief),
        sections=sections,
    )


def _sections_to_rewrite(script: VideoScript, problems: list[str]) -> list[int]:
    """問題文の line N から章の番号へ。行の特定が無い問題 (尺・比率) は一番長い章."""
    bounds: list[tuple[int, int]] = []
    start = 1
    for s in script.sections:
        bounds.append((start, start + len(s.lines) - 1))
        start += len(s.lines)
    targets: set[int] = set()
    for p in problems:
        m = LINE_REF.search(p)
        if m:
            n = int(m.group(1))
            for i, (a, b) in enumerate(bounds):
                if a <= n <= b:
                    targets.add(i)
        elif "尺" in p or "比率" in p:
            longest = max(range(len(script.sections)), key=lambda i: len(script.sections[i].lines))
            targets.add(longest)
        elif "stage" in p or "実践" in p:
            stage_secs = [
                i
                for i, s in enumerate(script.sections)
                if any(ln.scene.kind == "stage" for ln in s.lines)
            ]
            targets.add(stage_secs[-1] if stage_secs else len(script.sections) - 1)
    return sorted(targets)
