"""Claude に台本を書かせる工程 (Claude Code CLI の -p モード、MAX プランのトークンを使う).

brief + 結果 JSON + ルール集 → プロンプト → `claude -p --output-format json` → JSON を取り出し →
pydantic + check_against + lint で点検 → NG なら指摘を添えて書き直し (最大 N 回)。
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import structlog
from pydantic import ValidationError

from poe2tube.config.settings import REPO_ROOT
from poe2tube.contracts.craft_stage import CraftStageResult, StageItem
from poe2tube.script.brief import Brief
from poe2tube.script.lint import lint_script
from poe2tube.script.model import VideoScript

log = structlog.get_logger()
RULES_PATH = REPO_ROOT / "docs" / "script_rules" / "_all.md"
FACTS_PATH = REPO_ROOT / "docs" / "script_rules" / "_facts.md"


def load_rules() -> str:
    """ルール集 + 仕様の事実。台本を書かせる全プロンプトに同じ物を渡す (セッションに依らない)."""
    rules = RULES_PATH.read_text(encoding="utf-8")
    facts = FACTS_PATH.read_text(encoding="utf-8") if FACTS_PATH.exists() else ""
    return rules + "\n\n" + facts


EXAMPLE_PATH = REPO_ROOT / "data" / "scripts" / "test_1min_craft_intro.json"
CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0
Runner = Callable[[str], str]


@dataclass(frozen=True)
class WriteResult:
    script: VideoScript
    attempts: int
    raw: str


def result_digest(result: CraftStageResult) -> str:
    """結果 JSON のうち台本に要る部分だけを JSON 文字列に (プロンプト用)."""
    steps = [
        {
            "index": s.index,
            "currency_ja": s.currency_ja,
            "applied": s.applied,
            "reason": s.reason,
            "rarity": f"{s.changed.rarity_from}→{s.changed.rarity_to}",
            "added": [f"{m.side} {m.tier_name} {m.text_ja}" for m in s.changed.added],
            "removed": [m.text_ja for m in s.changed.removed],
            "after": _state(s.after),
        }
        for s in result.steps
    ]
    return json.dumps(
        {
            "base_ja": result.final.base_ja,
            "item_level": result.final.item_level,
            "final_rarity": result.final.rarity,
            "final_mods": [m.text_ja for m in result.final.prefixes + result.final.suffixes],
            "steps": steps,
        },
        ensure_ascii=False,
        indent=2,
    )


Demos = dict[str, CraftStageResult]


def demo_block(demos: Demos | None) -> list[str]:
    """追加の実演 (別のアイテム) の結果と、画面での指し方 (ADR 004)。無ければ空."""
    if not demos:
        return []
    body = "\n\n".join(f"### {k}\n```json\n{result_digest(r)}\n```" for k, r in demos.items())
    return [
        "## 追加の実演 (別のアイテム。この数字と名前だけを使う)\n"
        "- この実演の画面 (stage / item / stack) は `scene.demo` にキーを入れる。"
        "キーが無い場面は上のメインの結果を指す\n"
        "- 追加の実演も、実践は 1 手 1 行以上 (手を飛ばさない)\n\n" + body
    ]


def demo_files(name: str, demos: Demos) -> dict[str, str]:
    """追加の実演の結果 JSON のパス (scripts/run_stage.py の出力先と同じ)."""
    return {k: f"data/results/{name}__{k}.json" for k in demos}


def demo_problems(script: VideoScript, result: CraftStageResult, demos: Demos | None) -> list[str]:
    """画面と結果の噛み合わせ + 台本の規則 (追加の実演の手数も見る)."""
    demos = demos or {}
    return script.check_against(result, demos) + lint_script(
        script, len(result.steps), {k: len(r.steps) for k, r in demos.items()}
    )


def _state(item: StageItem) -> dict[str, object]:
    """MOD 以外の状態 (品質・ソケット・ユニーク名・壊れた等)。変わった物だけ台本で触れる."""
    st: dict[str, object] = {"quality": item.quality, "sockets": item.sockets}
    if item.gem_sockets is not None:
        st["gem_support_sockets"] = item.gem_sockets
    if item.unique is not None:
        st["unique_name"] = item.unique.ja
    for flag in ("destroyed", "corrupted"):
        if getattr(item, flag):
            st[flag] = True
    if not item.identified:
        st["unidentified"] = True
    return st


def build_prompt(
    brief: Brief,
    result: CraftStageResult,
    result_file: str,
    feedback: list[str],
    demos: Demos | None = None,
) -> str:
    rules = load_rules()
    example = EXAMPLE_PATH.read_text(encoding="utf-8") if EXAMPLE_PATH.exists() else "(無し)"
    parts = [
        "あなたは POE2Tube の台本作家です。以下のルール集に従い、台本 JSON だけを返してください。",
        "```markdown\n" + rules + "\n```",
        "## 題材 (brief)\n```json\n" + brief.model_dump_json(indent=2, by_alias=True) + "\n```",
        "## クラフトステージの結果 (この数字と名前だけを使う)\n```json\n"
        + result_digest(result)
        + "\n```",
        *demo_block(demos),
        f"## 出力\n- `result_file` は `{result_file}`\n"
        f"- `target_seconds` は {brief.target_seconds}\n"
        "- JSON 以外の文字 (前置き・コードフェンス・注釈) を出力しない",
        "## 正解例 (密度と画面の切り替え方の手本)\n```json\n" + example + "\n```",
    ]
    if feedback:
        parts.append("## 前回の台本の問題 (全部直すこと)\n- " + "\n- ".join(feedback))
    return "\n\n".join(parts)


def extract_json(text: str) -> str:
    """CLI の返答から台本 JSON の部分だけ取り出す (コードフェンスや前置きを許容)."""
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S)
    if m:
        return m.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("返答に JSON が無い")
    return text[start : end + 1]


def claude_cli_runner(model: str | None = None, timeout: int = 900) -> Runner:
    """`claude -p` を叩く関数を返す。stdout の JSON (result 欄) を返す."""
    exe = shutil.which("claude")
    if not exe:
        raise FileNotFoundError("claude CLI が PATH に無い")

    def run(prompt: str) -> str:
        cmd = [exe, "-p", "--output-format", "json", "--max-turns", "1"]
        if model:
            cmd += ["--model", model]
        last = ""
        for attempt in range(1, 4):  # API の一時エラー (rc=1、stderr 空) は少し待って撃ち直す
            try:
                r = subprocess.run(
                    cmd,
                    input=prompt,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    timeout=timeout,
                    creationflags=CREATE_NO_WINDOW,
                    cwd=REPO_ROOT,
                )
            except subprocess.TimeoutExpired:
                last = f"timeout {timeout}s"
                log.warning("claude cli timed out, retrying", attempt=attempt, timeout=timeout)
                continue
            if r.returncode == 0:
                try:
                    data = json.loads(r.stdout.strip().splitlines()[-1])
                    return str(data.get("result") or "")
                except (json.JSONDecodeError, IndexError):
                    return r.stdout
            last = f"rc={r.returncode} stderr={r.stderr[-300:]!r} stdout={r.stdout[-300:]!r}"
            log.warning("claude cli failed, retrying", attempt=attempt, detail=last[:300])
            time.sleep(15 * attempt)
        raise RuntimeError(f"claude CLI が 3 回とも失敗: {last}")

    return run


def write_script(
    brief: Brief,
    result: CraftStageResult,
    result_file: str,
    runner: Runner,
    max_attempts: int = 3,
    demos: Demos | None = None,
) -> WriteResult:
    feedback: list[str] = []
    raw = ""
    for attempt in range(1, max_attempts + 1):
        raw = runner(build_prompt(brief, result, result_file, feedback, demos))
        try:
            script = VideoScript.model_validate(json.loads(extract_json(raw)))
        except (ValueError, ValidationError) as e:
            feedback = [f"JSON が形式に合わない: {str(e)[:400]}"]
            log.warning("script invalid", attempt=attempt, error=str(e)[:200])
            continue
        if demos:
            script = script.model_copy(update={"demos": demo_files(brief.name, demos)})
        problems = demo_problems(script, result, demos)
        if not problems:
            log.info("script accepted", attempt=attempt, lines=len(script.lines))
            return WriteResult(script, attempt, raw)
        feedback = problems
        log.warning("script rejected", attempt=attempt, problems=problems)
    raise RuntimeError(f"{max_attempts} 回書いても通らなかった: {feedback}")


def save_script(script: VideoScript, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            script.model_dump(by_alias=True, exclude_none=True), ensure_ascii=False, indent=2
        )
        + "\n",
        encoding="utf-8",
    )
    return path
