"""台本の形: セリフ 1 行 = 話者 + 文 + 感情 + **画面 (scene)**.

台本と映像を必ず一緒に持つのが目的。画面の無いセリフは作れない (``scene`` 必須)。
音声は 1 行 = 1 wav。画面はその wav の長さだけ表示される (声先行・絵追従、ADR-001)。
数字は LLM に書かせず、クラフトステージの結果 JSON (``CraftStageResult``) から差し込む。
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from poe2tube.contracts.craft_stage import CraftStageResult
from poe2tube.script.panel import Panel
from poe2tube.script.reading import normalize_speech

SCRIPT_SCHEMA = "poe2tube-script/1"

Speaker = Literal["zundamon", "metan"]
Emotion = Literal["normal", "troubled", "surprised", "happy", "proud", "sad"]
SceneKind = Literal[
    "talk",
    "stack",
    "item",
    "stage",
    "cost",
    "quiz",
    "tiers",
    "compare",
    "dps",
    "ttk",
    "hit",
    "resists",
    "layers",
    "armour",
    "evasion",
    "es",
    "bases",
    "icons",
    "table",
    "footage",
]
# 防御の仕組みの画面 (ExileDesk 要望 ㉒)。中身は def_params をそのまま URL に渡す
DEFENCE_KINDS = ("layers", "armour", "evasion", "es", "bases")
POB_KINDS = ("dps", "ttk", "hit")  # 結果 JSON の pob (PoB の計算) が要る画面
PANEL_KINDS = ("icons", "table")  # POE2Tube 側で描く図 (script/panel.py)
MAIN = "main"  # compare_with でメインの実演を指す (demo の省略 = メインと同じ)
Element = Literal["fire", "cold", "lightning", "chaos"]
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
    mod: str | None = Field(
        default=None, description="tiers: 段の表を出す MOD (id か系統、例 ColdResistance)"
    )
    reveal: bool = Field(
        default=True, description="tiers: False = 答えの金の段を出さない (質問の行、ネタバレ防止)"
    )
    focus: str | None = Field(
        default=None, description="stage: 光らせる MOD (id か系統)。スポットライト (ExileDesk ⑪)"
    )
    compare_with: str | None = Field(
        default=None, description="compare / ttk: 右 (入れ替える物) の実演キー (main = メイン)"
    )
    b_step: int | None = Field(default=None, ge=0, description="compare / ttk: 右の手")
    countdown: int | None = Field(
        default=None, ge=1, le=10, description="quiz: 行の後に数える秒 (3→2→1 と音、ADR 005)"
    )
    # --- ExileDesk ⑰ (PoB・耐性)。reveal=False は ttk の秒数・resists のペナルティ後を隠す
    show_dps: bool = Field(
        default=True, description="stage / compare: False = DPS の札を隠す (質問の行)"
    )
    labels: list[str] | None = Field(default=None, description='ttk: 左右の札 (例 ["白", "レア"])')
    elem: Element | None = Field(default=None, description="hit: 受ける一撃の元素")
    res: list[int] | None = Field(
        default=None, description="hit: 並べる耐性 (例 [50, 75])。無ければ 50 と 75"
    )
    dmg: int | None = Field(
        default=None,
        ge=1,
        description="hit: 一撃の大きさ (画面に「仮の一撃」と出る)。無ければ PoB の敵",
    )
    resists: str | None = Field(
        default=None, description="resists: 装備の組のキー (VideoScript.resists)"
    )
    act: int | None = Field(
        default=None, ge=-60, le=0, description="resists: ペナルティ (0 = アクト 1 … -60 = エンド)"
    )
    def_params: dict[str, str | int | float] | None = Field(
        default=None,
        description="防御の画面 (layers / armour / evasion / es / bases) に渡す値 "
        "(例 life / es / armour / evasion / deflect / block / lvl / dmg / kind / outcome / red)",
    )

    floor: int | None = Field(
        default=None,
        ge=1,
        le=100,
        description="tiers: この MOD レベル未満のティアを「付かない」に (㉔)",
    )
    tags: bool = Field(default=False, description="stage: MOD の横にタグの札を出す (㉔)")
    offers: bool = Field(
        default=False,
        description="stage: 発現の手で、3 つの候補を並べた絵 (発現の前、ExileDesk ㉕)",
    )
    still: bool = Field(
        default=False,
        description="stage: 打つ演出を流さず、その手の後の姿だけ見せる (別の実演の見せ始め)",
    )
    panel: Panel | None = Field(
        default=None, description="icons / table: POE2Tube 側で描く図 (script/panel.py)"
    )
    # --- footage: アプリを操作した録画 (scripts/record_app*.py、output/app_rec/<clip>.mp4)
    clip: str | None = Field(default=None, description="footage: 録画の名前 (例 orbs)")
    at: float | None = Field(default=None, ge=0, description="footage: 録画の何秒目から流すか")
    hold: float | None = Field(
        default=None, ge=0, description="footage: 何秒目で止めて出したままにするか (省略 = 最後)"
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
            self.mod,
            self.reveal,
            self.focus,
            self.compare_with,
            self.b_step,
            self.show_dps,
            tuple(self.labels or ()),
            self.elem,
            tuple(self.res or ()),
            self.dmg,
            self.resists,
            self.act,
            tuple(sorted((self.def_params or {}).items())),
            self.panel.key() if self.panel else None,
            self.floor,
            self.tags,
            self.still,
            self.offers,
            self.clip,
            self.at,
            self.hold,
        )

    @model_validator(mode="before")
    @classmethod
    def _answer_by_name(cls, data: Any) -> Any:
        """クイズの正解を選択肢の名前で書かれても番号に直す (Claude が "augment" と書いた)."""
        if isinstance(data, dict) and isinstance(data.get("answer"), str):
            choices = data.get("choices") or []
            if data["answer"] in choices:
                data = {**data, "answer": choices.index(data["answer"])}
        return data

    @model_validator(mode="after")
    def _needs_step(self) -> Scene:
        if self.kind in ("stack", "item", "stage", "compare", *POB_KINDS) and self.step is None:
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
        elif self.choices or self.answer is not None or self.badges or self.countdown:
            raise ValueError("choices / answer / badges / countdown は quiz 専用")
        if (self.kind == "footage") != (self.clip is not None and self.at is not None):
            raise ValueError("footage には clip と at が必要 (clip / at / hold は footage 専用)")
        if self.hold is not None and (self.at is None or self.hold < self.at):
            raise ValueError("footage の hold は at より後")
        if (self.kind == "tiers") != (self.mod is not None):
            raise ValueError("tiers には mod が必要 (mod は tiers 専用)")
        if self.kind == "compare" and self.compare_with is None:
            raise ValueError("compare には compare_with が必要")
        if self.compare_with is not None and self.kind not in ("compare", "ttk"):
            raise ValueError("compare_with は compare / ttk 専用")
        if (self.kind == "resists") != (self.resists is not None and self.act is not None):
            raise ValueError("resists には resists (装備の組) と act が必要 (resists 専用)")
        if (self.kind == "hit") != (self.elem is not None):
            raise ValueError("hit には elem が必要 (elem・res・dmg は hit 専用)")
        if (self.res is not None or self.dmg is not None) and self.kind != "hit":
            raise ValueError("res・dmg は hit 専用")
        if self.def_params is not None and self.kind not in DEFENCE_KINDS:
            raise ValueError(
                "def_params は防御の画面 (layers / armour / evasion / es / bases) 専用"
            )
        if self.labels is not None and self.kind != "ttk":
            raise ValueError("labels は ttk 専用")
        if self.focus is not None and self.kind != "stage":
            raise ValueError("focus は stage 専用")
        if self.floor is not None and self.kind != "tiers":
            raise ValueError("floor は tiers 専用")
        if (self.tags or self.still or self.offers) and self.kind != "stage":
            raise ValueError("tags・still・offers は stage 専用")
        if (self.kind in PANEL_KINDS) != (self.panel is not None):
            raise ValueError("icons / table には panel が必要 (panel は icons / table 専用)")
        if self.panel is not None and (self.panel.icons is None) == (self.kind == "icons"):
            raise ValueError("icons は panel.icons、table は panel.rows")
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
    resists: dict[str, str] = Field(
        default_factory=dict, description="耐性の画面の組 {キー: --resists の出力パス} (⑰)"
    )
    practice: bool = Field(
        default=True,
        description="False = クラフトの実演 (stage) の無い回 (防御の解説など)。手の検査をしない",
    )
    planned_sections: int | None = Field(
        default=None,
        ge=1,
        description="構成表で決めた章の数 (章ごとに先に作る時の進み具合のバー用)",
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
            if sc.compare_with not in (None, MAIN, *demos):
                problems.append(f"line {i}: 比べる相手 {sc.compare_with!r} が demos に無い")
            if sc.kind in POB_KINDS and res.pob is None:
                problems.append(f"line {i}: {sc.kind} は PoB の計算 (手順の pob) が要る")
            if sc.resists is not None and sc.resists not in self.resists:
                problems.append(f"line {i}: 耐性の組 {sc.resists!r} が resists に無い")
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
        # 1 章ずつ書いている途中 (予定の章がまだそろっていない) は全体の尺を見ない
        writing = (self.planned_sections or 0) > len(self.sections)
        if not writing and abs(est - self.target_seconds) > self.target_seconds * 0.25:
            problems.append(
                f"尺の見込み {est:.0f} 秒が目標 {self.target_seconds} 秒から 25% 以上ずれている"
            )
        return problems
