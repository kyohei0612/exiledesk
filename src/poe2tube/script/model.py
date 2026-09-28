"""台本の形: セリフ 1 行 = 話者 + 文 + 感情 + **画面 (scene)**.

台本と映像を必ず一緒に持つのが目的。画面の無いセリフは作れない (``scene`` 必須)。
音声は 1 行 = 1 wav。画面はその wav の長さだけ表示される (声先行・絵追従、ADR-001)。
数字は LLM に書かせず、クラフトステージの結果 JSON (``CraftStageResult``) から差し込む。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from poe2tube.contracts.craft_stage import CraftStageResult
from poe2tube.script.reading import normalize_speech

SCRIPT_SCHEMA = "poe2tube-script/1"

Speaker = Literal["zundamon", "metan"]
Emotion = Literal["normal", "troubled", "surprised", "happy", "proud", "sad"]
SceneKind = Literal["talk", "stack", "item", "stage", "cost", "quiz"]
Highlight = Literal["added", "rarity", "name", "cost", "step"]

CHARS_PER_MINUTE = 400  # 実測 (2026-09-28): 1.2 倍速 + 話速正規化で 2,502 字 → 370 秒 ≈ 405 字/分


class Scene(BaseModel):
    """1 行の間に映す画面.

    - talk : 立ち絵 2 体 + 背景 + テロップだけ (図解なし)
    - stack: 積み上げ図解。``show_steps`` の工程が並び、``step`` を強調
    - item : 工程 ``step`` 後のアイテムカード 1 枚を大きく
    - stage: ExileDesk クラフトステージの撮影画面 (``step`` 手目まで進めた状態)
    - cost : 費用まとめ (工程ごとの費用と合計)
    """

    model_config = ConfigDict(extra="forbid")

    kind: SceneKind
    step: int | None = Field(
        default=None, ge=0, description="結果 JSON の steps.index (0 = 開始前)"
    )
    show_steps: list[int] | None = Field(
        default=None, description="stack で並べる工程 (省略時は 1..step)"
    )
    highlight: Highlight | None = None
    demo: str | None = Field(
        default=None,
        description="どの実演の画面か (VideoScript.demos のキー)。省略 = メイン (result_file)",
    )
    choices: list[str] | None = Field(
        default=None, description="quiz: 並べるカレンシーキー (2〜4 個、ADR 005)"
    )
    answer: int | None = Field(default=None, ge=0, description="quiz: 正解の番号 (緑にする)")
    badges: list[str] | None = Field(
        default=None, description="quiz: カードごとの札 (例「使う」「取っておく」)"
    )

    def key(self) -> tuple[object, ...]:
        """見た目が同じ場面かを比べる鍵 (実演・クイズの答えと札の違いも別の画面とみなす)."""
        return (
            self.kind,
            self.step,
            tuple(self.show_steps or ()),
            self.demo,
            tuple(self.choices or ()),
            self.answer,
            tuple(self.badges or ()),
        )

    @model_validator(mode="after")
    def _needs_step(self) -> Scene:
        if self.kind in ("stack", "item", "stage") and self.step is None:
            raise ValueError(f"scene.kind={self.kind} には step が必要")
        if self.show_steps is not None and self.kind != "stack":
            raise ValueError("show_steps は stack 専用")
        if self.kind == "quiz":
            if not self.choices or not 2 <= len(self.choices) <= 4:
                raise ValueError("quiz には choices が 2〜4 個必要")
            if self.answer is not None and self.answer >= len(self.choices):
                raise ValueError("quiz の answer が choices の外")
            if self.badges is not None and len(self.badges) != len(self.choices):
                raise ValueError("quiz の badges は choices と同じ数")
        elif self.choices or self.answer is not None or self.badges:
            raise ValueError("choices / answer / badges は quiz 専用")
        return self


class Line(BaseModel):
    model_config = ConfigDict(extra="forbid")

    speaker: Speaker
    text: str = Field(
        min_length=1, max_length=60, description="テロップ兼セリフ。一文 40 字以内が目安"
    )
    speech: str | None = Field(
        default=None, description="読み上げ用 (MOD→モッド 等)。無ければ text"
    )
    emotion: Emotion = "normal"
    scene: Scene

    @property
    def spoken(self) -> str:
        return normalize_speech(self.speech or self.text)


class Section(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    target_seconds: int = Field(ge=1)
    lines: list[Line] = Field(min_length=1)


class VideoScript(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_id: str = Field(default=SCRIPT_SCHEMA, alias="schema")
    title: str
    target_seconds: int = Field(ge=10)
    result_file: str = Field(
        description="数字の出どころ (CraftStageResult の JSON パス、リポジトリ相対)"
    )
    final_step: int | None = Field(
        default=None, ge=1, description="完成とみなす手 (積み上げ図解の「完成！」と成功音)"
    )
    layout: Literal["wide", "short"] = Field(
        default="wide", description="short = 縦 1080x1920 のショート (ADR 005)"
    )
    short_title: str | None = Field(default=None, description="ショートの上に出す題")
    demos: dict[str, str] = Field(
        default_factory=dict,
        description="追加の実演 {キー: 結果 JSON パス}。1 本で複数のアイテムを見せる回 (ADR 004)",
    )
    sections: list[Section] = Field(min_length=1)

    @property
    def lines(self) -> list[Line]:
        return [ln for s in self.sections for ln in s.lines]

    def char_count(self) -> int:
        return sum(len(ln.spoken) for ln in self.lines)

    def estimated_seconds(self) -> float:
        return self.char_count() / CHARS_PER_MINUTE * 60

    def check_against(
        self, result: CraftStageResult, demos: dict[str, CraftStageResult] | None = None
    ) -> list[str]:
        """画面指示が結果 JSON と噛み合っているかを点検し、問題を文で返す (空なら OK)."""
        problems: list[str] = []
        demos = demos or {}
        for i, ln in enumerate(self.lines, start=1):
            sc = ln.scene
            if sc.demo is not None and sc.demo not in demos:
                problems.append(f"line {i}: 実演 {sc.demo!r} が demos に無い")
                continue
            res = demos[sc.demo] if sc.demo is not None else result
            n = len(res.steps)
            if sc.step is not None and sc.step > n:
                problems.append(f"line {i}: step {sc.step} は結果 JSON に無い (最大 {n})")
            for s in sc.show_steps or []:
                if not 1 <= s <= n:
                    problems.append(f"line {i}: show_steps に無効な工程 {s}")
            if sc.highlight == "added" and sc.step:
                if not res.steps[sc.step - 1].changed.added:
                    problems.append(
                        f"line {i}: step {sc.step} は MOD が増えていないのに highlight=added"
                    )
        est = self.estimated_seconds()
        if abs(est - self.target_seconds) > self.target_seconds * 0.25:
            problems.append(
                f"尺の見込み {est:.0f} 秒が目標 {self.target_seconds} 秒から 25% 以上ずれている"
            )
        return problems
