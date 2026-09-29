"""PoB (Path of Building) の計算の受け渡し (ExileDesk 要望 ⑰、v0.1.330〜).

- 手順 JSON の ``pob`` (``PobSpec``): どのキャラ・スキル・敵・アクトの設定で DPS を計算するか
- 結果 JSON の ``pob`` (``PobBlock``): 実際に使った設定 (書き戻し) と手ごとの DPS・防御
- 耐性の画面の ``--resists`` の入出力 (``ResistsSpec`` / ``ResistsBlock``)

PoB の既定は「エンドの強いボス + 耐性 -60%」。アクトの回は ``config`` を必ず渡す (kyohei)。
数字は PoB の出力をそのまま使い、POE2Tube 側で掛け算しない。
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

EnemyKind = Literal["None", "Boss", "Pinnacle", "Uber"]
PENALTIES = (0, -10, -20, -30, -40, -50, -60)  # PoB 0.23.1 の resistancePenalty (Act 1 … Endgame)


class PobConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resistancePenalty: int = Field(  # noqa: N815 — PoB の設定名そのまま
        default=-20, ge=-60, le=0, description="元素耐性のペナルティ (0 = アクト 1 … -60 = エンド)"
    )
    enemyIsBoss: EnemyKind = Field(default="None", description="普通の敵 / ボス")  # noqa: N815
    enemyLevel: int | None = Field(  # noqa: N815
        default=None, ge=1, le=85, description="無ければキャラのレベル"
    )
    enemyArmour: int | None = Field(  # noqa: N815
        default=None, ge=0, description="敵のアーマー。無ければ PoB の表 (敵のレベルの目安)"
    )


class PobSpec(BaseModel):
    """手順 JSON の pob。クラス・スキルは PoB の英語名 (Gems.lua の name)."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    class_: str = Field(alias="class", description="例 Monk / Ranger")
    level: int = Field(ge=1, le=100)
    skill: str = Field(description="例 Ice Strike")
    supports: list[str] = Field(default_factory=list)
    gem_level: int | None = Field(default=None, ge=1, le=40, description="無ければ使える一番高い物")
    skill_part: int | str | None = Field(
        default=None, description="スキルの段 (番号か名前、例 Third Strike)。無ければ PoB の既定"
    )
    quests_act: int | None = Field(
        default=None, ge=0, le=10, description="何アクトまでのクエスト報酬を入れるか。無ければ全部"
    )
    config: PobConfig = Field(default_factory=PobConfig)


class PobStats(BaseModel):
    """1 手ぶんの PoB の出力 (手 0 = 白)."""

    model_config = ConfigDict(extra="ignore")

    dps: float = Field(ge=0)
    hit: float = Field(ge=0, description="1 発のダメージ")
    aps: float = Field(ge=0)
    crit_chance: float = 0
    breakdown: dict[str, float] = Field(default_factory=dict, description="physical / fire / …")
    layers: dict[str, float] | None = Field(
        default=None, description="武器の手だけ: base (素) / mods (MOD まで) / full (ルーン込み)"
    )
    armour: float = 0
    evasion: float = 0
    es: float = 0
    life: float = 0
    resists: dict[str, dict[str, float]] = Field(default_factory=dict)


class PobEnemy(BaseModel):
    model_config = ConfigDict(extra="ignore")

    level: int
    life: float
    hit: float
    ja: str
    armour: float | None = Field(default=None, description="PoB が使った敵のアーマー (⑲)")


class PobCharacter(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    class_: str = Field(alias="class")
    level: int
    skill: str
    skill_ja: str
    gem_level: int
    supports: list[str] = Field(default_factory=list)
    skill_part: str | None = None


class PobBlock(BaseModel):
    """結果 JSON の pob。台本で前提を言う時は ``config_ja`` と ``character`` を使う."""

    model_config = ConfigDict(extra="allow")

    version: str
    character: PobCharacter
    config: dict[str, Any]
    config_ja: str = Field(description="例「普通の敵・アクト 3 (-20%) のペナルティ」")
    enemy: PobEnemy | None = None
    steps: list[PobStats] = Field(min_length=1, description="手 0 (白) … 最後")


class ResistItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    demo: str | None = Field(default=None, description="brief の実演キー (None = メイン)")
    step: int | None = Field(default=None, ge=0, description="何手目の装備か (無ければ最後)")


class ResistsSpec(BaseModel):
    """brief の耐性の画面 1 つぶん: 装備の組 + キャラ (アクトは画面の act で選ぶ)."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    class_: str = Field(default="Monk", alias="class")
    level: int = Field(default=20, ge=1, le=100)
    quests_act: int | None = Field(
        default=None, ge=0, le=10, description="何アクトまでのクエスト報酬 (無ければ全部、⑳)"
    )
    items: list[ResistItem] = Field(min_length=1)


class ResistsBlock(BaseModel):
    """``craft-stage-run.mjs --resists`` の出力。画面にはそのまま渡す."""

    model_config = ConfigDict(extra="allow")

    version: str
    rows: list[dict[str, Any]] = Field(min_length=1, description="ペナルティ 7 通り")
