"""クラフトステージ (ExileDesk) との受け渡し JSON.

- 手順 JSON (``CraftStagePlan``): POE2Tube → ExileDesk。「このベースにこの順でカレンシーを使って」
- 結果 JSON (``CraftStageResult``): ExileDesk → POE2Tube。1 手ごとの before / after と費用

キーは両リポジトリとも snake_case。カレンシーのキー名は ExileDesk の
``src/services/htc/price-keys.json`` (currency / bones / omens) をそのまま使い、
こちらで独自の名前を作らない。
ADR: ``docs/decisions/002-craft-stage-contract.md``
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

PLAN_SCHEMA = "craft-stage-plan/1"
RESULT_SCHEMA = "craft-stage-result/1"

Rarity = Literal["normal", "magic", "rare", "unique"]
Side = Literal["prefix", "suffix"]
PriceUnit = Literal["exalted", "divine", "chaos"]

# ExileDesk price-keys.json の currency キー (2026-09-27 時点)。骨は装備種別で決まるので
# labels.ts と同じ抽象キー desecrate / desecrate_ancient / desecrate_altered を使う。
KNOWN_CURRENCIES: frozenset[str] = frozenset(
    {
        *(
            f"{c}{s}"
            for c in ("transmute", "augment", "regal", "exalt", "chaos")
            for s in ("", "_greater", "_perfect")
        ),
        "alchemy",
        "annul",
        "vaal",
        "divine",
        "fracture",
        "artificer",
        "desecrate",
        "desecrate_ancient",
        "desecrate_altered",
        # アクト中に落ちるカレンシー解説用 (2026-09-28 追加、ExileDesk 要望 ⑧)
        "whetstone",  # 鍛冶屋の砥石 (武器の品質)
        "scrap",  # 鎧鍛冶の端材 (防具の品質)
        "bauble",  # ガラス吹きの飾り玉 (フラスコの品質)
        "gemcutter",  # 宝石細工師のプリズム (ジェムの品質)
        "chance",  # 可能性のオーブ
        "wisdom",  # 鑑定の巻物
        "transmute_shard",  # 変成のシャード
        "regal_shard",  # 王者のシャード
        "artificer_shard",  # 熟練工のシャード
        "chance_shard",  # 可能性のシャード
        "alchemy_shard",  # 錬金術のシャード
        "scroll_fragment",  # 巻物の断片 (5 個で鑑定の巻物)
        "etcher",  # 秘術師の彫刻針 (ワンド・スタッフ・セプターの品質)
        "jeweller_lesser",  # 宝飾職人のオーブ (見習い)
        "jeweller_greater",  # 宝飾職人のオーブ (上級)
    }
)
# エッセンスの実キーは "essence:lesser:Bows/Essence_PhysicalDamage" のように ":" と "/" を含む
_CURRENCY_PREFIX = re.compile(r"^(essence:\S+|catalyst_[a-z]+)$")


def _check_currency(value: str) -> str:
    if value in KNOWN_CURRENCIES or _CURRENCY_PREFIX.match(value):
        return value
    raise ValueError(f"未知のカレンシーキー: {value!r} (ExileDesk price-keys.json に合わせる)")


class PlanStep(BaseModel):
    """手順 1 つ。``times`` で同じカレンシーの連打を表す (Chaos ×5 など)."""

    model_config = ConfigDict(extra="forbid")

    currency: str
    omen: str | None = Field(
        default=None,
        description="お告げ id (price-keys.json の omens キー、例 OmenofDextralExaltation)",
    )
    times: int = Field(default=1, ge=1, le=200)
    outcome: Literal["unique", "destroyed"] | None = Field(
        default=None,
        description="可能性のオーブの結果を決め打ちする (動画で見せたい方)。無ければ乱数",
    )
    note: str | None = Field(
        default=None, description="台本用の覚え書き (ExileDesk は無視してよい)"
    )

    _v = field_validator("currency")(_check_currency)


class CraftStagePlan(BaseModel):
    """手順 JSON (POE2Tube → ExileDesk)."""

    model_config = ConfigDict(extra="forbid")

    schema_id: str = Field(default=PLAN_SCHEMA, alias="schema")
    title: str | None = Field(default=None, description="動画の題材名 (表示用)")
    base: str = Field(
        description="HTC の英語ベース名。ExileDesk 側は itemBaseFor(data, base) で引く"
    )
    item_level: int = Field(default=80, ge=1, le=100)
    start_rarity: Rarity = "normal"
    start_paste: str | None = Field(
        default=None,
        description="途中から始める時のゲーム内アイテムテキスト (Ctrl+C 貼り付け)。無ければ白",
    )
    seed: int = Field(
        ge=0,
        description="mulberry32 の起点。1 手ごとの seed は ExileDesk が seed+index で派生させる",
    )
    start_unidentified: bool = Field(
        default=False, description="未鑑定から始める (鑑定の巻物の実演、マジック / レアの時)"
    )
    tray: list[str] | None = Field(
        default=None,
        description="動画の棚に並べる物 (カレンシーキー / お告げ id の順)。無ければ手順から自動",
    )
    steps: list[PlanStep] = Field(min_length=1)

    @field_validator("schema_id")
    @classmethod
    def _schema(cls, v: str) -> str:
        if v != PLAN_SCHEMA:
            raise ValueError(f"schema は {PLAN_SCHEMA} 固定 (got {v!r})")
        return v

    def expanded_steps(self) -> list[PlanStep]:
        """``times`` を展開して 1 手 1 要素にする (結果 JSON の steps と 1:1 に対応)."""
        return [s.model_copy(update={"times": 1}) for s in self.steps for _ in range(s.times)]


class StageMod(BaseModel):
    """アイテムに付いている MOD 1 行 (数値まで確定した本物)."""

    model_config = ConfigDict(extra="ignore")

    mod_id: str
    family: str
    side: Side
    tier_name: str = Field(description="HTC の Tier.name (例 'T3')")
    mod_level: int = Field(ge=0, description="その段の要求アイテムレベル (Tier.ilvl)")
    text_ja: str = Field(description="公式日本語 1 行、数値埋め込み済 (jaOfMod + fillHashes)")
    text_en: str
    values: list[float] = Field(default_factory=list)
    ranges: list[list[float]] = Field(default_factory=list, description="[[min,max], ...] 段の幅")
    fractured: bool = False
    desecrated: bool = False
    crafted: bool = False


class UniqueRef(BaseModel):
    """可能性のオーブ等でなったユニークの名前."""

    model_config = ConfigDict(extra="ignore")

    en: str
    ja: str


class StageItem(BaseModel):
    """ある時点のアイテム全体."""

    model_config = ConfigDict(extra="ignore")

    name: str = Field(description="表示名 (レアなら生成名、それ以外はベース名)")
    base: str
    base_ja: str | None = None
    item_level: int = Field(ge=1, le=100)
    rarity: Rarity
    quality: float = Field(default=0, ge=0, le=30, description="カタリストで 1.5 刻みの小数もある")
    corrupted: bool = False
    identified: bool = Field(
        default=True, description="False = 未鑑定 (MOD を隠す)。鑑定の巻物で True"
    )
    sockets: int = Field(default=0, ge=0, le=6, description="熟練工のオーブで増える")
    destroyed: bool = Field(default=False, description="可能性のオーブ等でアイテムが壊れた")
    unique: UniqueRef | None = Field(default=None, description="ユニークになった時の名前")
    gem_sockets: int | None = Field(
        default=None, ge=0, le=6, description="スキルジェムのサポート枠 (宝飾職人のオーブ)"
    )
    prefixes: list[StageMod] = Field(default_factory=list, max_length=3)
    suffixes: list[StageMod] = Field(default_factory=list, max_length=3)

    @model_validator(mode="after")
    def _sides(self) -> StageItem:
        bad = [m.mod_id for m in self.prefixes if m.side != "prefix"] + [
            m.mod_id for m in self.suffixes if m.side != "suffix"
        ]
        if bad:
            raise ValueError(f"side と格納先が食い違う MOD: {bad}")
        return self


class StageChange(BaseModel):
    model_config = ConfigDict(extra="ignore")

    added: list[StageMod] = Field(default_factory=list)
    removed: list[StageMod] = Field(default_factory=list)
    rarity_from: Rarity
    rarity_to: Rarity


class StageCost(BaseModel):
    model_config = ConfigDict(extra="ignore")

    each: float = Field(ge=0, description="カレンシー 1 個の相場 (price_unit 建て)")
    amount: int = Field(ge=0, description="この手で使った個数 (お告げ込みなら 2)")
    subtotal: float = Field(ge=0)
    cumulative: float = Field(ge=0, description="ここまでの累計")


class StageStep(BaseModel):
    """1 手の記録。``applied=False`` はその状態では使えなかった手 (理由は ``reason``)."""

    model_config = ConfigDict(extra="ignore")

    index: int = Field(ge=1)
    currency: str
    currency_ja: str
    omen: str | None = None
    omen_ja: str | None = None
    seed: int = Field(ge=0)
    applied: bool = True
    reason: str | None = None
    before: StageItem
    after: StageItem
    changed: StageChange
    cost: StageCost

    _v = field_validator("currency")(_check_currency)


class CraftStageResult(BaseModel):
    """結果 JSON (ExileDesk → POE2Tube)。ExileDesk が将来足すキーは無視する (extra=ignore)."""

    model_config = ConfigDict(extra="ignore")

    schema_id: str = Field(alias="schema")
    generated_at: datetime
    exiledesk_version: str
    patch: str = Field(description="HTC データのパッチ (例 '0.5.0')")
    league: str | None = None
    price_unit: PriceUnit
    plan: CraftStagePlan
    steps: list[StageStep] = Field(min_length=1)
    final: StageItem
    total_cost: float = Field(ge=0)

    @field_validator("schema_id")
    @classmethod
    def _schema(cls, v: str) -> str:
        if v != RESULT_SCHEMA:
            raise ValueError(f"schema は {RESULT_SCHEMA} 固定 (got {v!r})")
        return v

    @model_validator(mode="after")
    def _consistency(self) -> CraftStageResult:
        expected = len(self.plan.expanded_steps())
        if len(self.steps) != expected:
            raise ValueError(
                f"steps は plan の展開数 {expected} と一致させる (got {len(self.steps)})"
            )
        for i, s in enumerate(self.steps, start=1):
            if s.index != i:
                raise ValueError(f"steps[{i - 1}].index は {i} (got {s.index})")
        for prev, cur in zip(self.steps, self.steps[1:], strict=False):
            if cur.before != prev.after:
                raise ValueError(f"step {cur.index} の before が step {prev.index} の after と違う")
        if self.final != self.steps[-1].after:
            raise ValueError("final は最後の step の after と一致させる")
        return self
