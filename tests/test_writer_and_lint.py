"""台本 lint、話速の正規化、Claude 生成工程 (runner はモック)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from poe2tube.audio.voicevox import VoicevoxClient, predicted_seconds
from poe2tube.contracts.craft_stage import CraftStageResult
from poe2tube.script.brief import Brief
from poe2tube.script.lint import lint_script
from poe2tube.script.model import Line, Scene, Section, VideoScript
from poe2tube.script.writer import build_prompt, extract_json, write_script

ROOT = Path(__file__).resolve().parents[1]


def _draft() -> VideoScript:
    p = ROOT / "data/scripts/test_1min_craft_intro.json"
    return VideoScript.model_validate(json.loads(p.read_text(encoding="utf-8")))


def _result() -> CraftStageResult:
    p = ROOT / "contracts/examples/result-transmute-augment-regal.json"
    return CraftStageResult.model_validate(json.loads(p.read_text(encoding="utf-8")))


def _brief() -> Brief:
    p = ROOT / "data/briefs/craft_intro_1min.json"
    return Brief.model_validate(json.loads(p.read_text(encoding="utf-8")))


def test_lint_passes_for_draft() -> None:
    assert lint_script(_draft()) == []


def test_lint_catches_style_and_scene_runs() -> None:
    sc = Scene(kind="stack", step=1, show_steps=[1])
    lines = [
        Line(speaker="metan", text="これは説明です。", scene=sc),
        Line(speaker="metan", text="あ" * 45 + "。", scene=sc),
        Line(speaker="zundamon", text="わかった。", scene=sc),
        Line(speaker="metan", text="次よ。", scene=sc),
    ]
    script = VideoScript(
        title="t",
        target_seconds=60,
        result_file="x",
        sections=[Section(name="s", target_seconds=60, lines=lines)],
    )
    problems = "\n".join(lint_script(script))
    assert (
        "敬語" in problems
        and "一文が" in problems
        and "のだ" in problems
        and "同じ画面" in problems
    )


def test_predicted_seconds_and_speed_normalization() -> None:
    query = {
        "prePhonemeLength": 0.1,
        "postPhonemeLength": 0.1,
        "accent_phrases": [
            {
                "moras": [{"consonant_length": 0.05, "vowel_length": 0.2}] * 10,
                "pause_mora": {"vowel_length": 0.3},
            }
        ],
    }
    assert predicted_seconds(query) == pytest.approx(0.2 + 2.5 + 0.3)
    client = VoicevoxClient(base_url="http://127.0.0.1:1", speed=1.2)
    client.target_rate, client.max_speed = 7.3, 1.7
    slow = client.speed_for(query, "あ" * 15)  # 15 字 / (3.0/1.2) = 6 字/秒 → 速める
    assert slow == pytest.approx(1.2 * 7.3 / 6.0)
    assert client.speed_for(query, "あ" * 30) == 1.2  # 速い方は触らない
    assert client.speed_for(query, "あ" * 2) == 1.7  # 上限


def test_extract_json_variants() -> None:
    assert extract_json('前置き ```json\n{"a": 1}\n``` 後置き') == '{"a": 1}'
    assert extract_json('x {"a": {"b": 2}} y') == '{"a": {"b": 2}}'
    with pytest.raises(ValueError):
        extract_json("JSON なし")


def test_write_script_retries_with_feedback() -> None:
    brief, result = _brief(), _result()
    good = json.dumps(_draft().model_dump(by_alias=True, exclude_none=True), ensure_ascii=False)
    bad = good.replace("のだ", "")  # ずんだもんの語尾を壊す
    prompts: list[str] = []
    answers = iter([bad, "```json\n" + good + "\n```"])

    def runner(prompt: str) -> str:
        prompts.append(prompt)
        return next(answers)

    wr = write_script(
        brief, result, "contracts/examples/result-transmute-augment-regal.json", runner
    )
    assert wr.attempts == 2
    assert "前回の台本の問題" in prompts[1] and "のだ" in prompts[1]
    assert "変成のオーブ" in prompts[0] and "target_seconds" in prompts[0]


def test_build_prompt_contains_rules_and_result() -> None:
    p = build_prompt(_brief(), _result(), "data/results/x.json", [])
    assert "台本ルール集" in p and "回避力 +151" in p and "data/results/x.json" in p


def test_lint_stage_coverage_requires_every_step() -> None:
    def line(kind: str, step: int | None, who: str = "metan") -> Line:
        text = "テストなのだ。" if who == "zundamon" else "テストよ。"
        return Line(speaker=who, text=text, scene=Scene(kind=kind, step=step))  # type: ignore[arg-type]

    lines = [
        line("talk", None),
        line("stage", 1),
        line("stage", 3),
        line("talk", None, "zundamon"),
    ]
    script = VideoScript(
        title="t",
        target_seconds=20,
        result_file="x",
        sections=[Section(name="s", target_seconds=20, lines=lines)],
    )
    problems = lint_script(script, n_steps=3)
    assert any("step [2]" in p for p in problems)
    script.sections[0].lines.insert(2, line("stage", 2))
    assert not any("飛ばした" in p for p in lint_script(script, n_steps=3))


def test_lint_bans_settou_setsubi() -> None:
    lines = [
        Line(speaker="metan", text="接頭が3つよ。", scene=Scene(kind="talk")),
        Line(speaker="zundamon", text="プレフィックスなのだ。", scene=Scene(kind="stage", step=1)),
    ]
    script = VideoScript(
        title="t",
        target_seconds=10,
        result_file="x",
        sections=[Section(name="s", target_seconds=10, lines=lines)],
    )
    problems = lint_script(script, n_steps=1)
    assert any("接頭" in p and "プレフィックス" in p for p in problems)
