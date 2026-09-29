"""題材の指示 (brief): kyohei が「これで 1 本」と渡す最小の入力.

brief → (ExileDesk でクラフトステージを回す) → 結果 JSON → Claude が台本 → OK → 動画。
書く前に `docs/script_rules/_intake.md` の既定の質問に答えてもらい、``problems()`` で
設定 (視聴者の段階) と手順 (ilvl・カレンシー) の食い違いを弾く (2026-09-28 kyohei)。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from poe2tube.contracts.craft_stage import CraftStagePlan
from poe2tube.contracts.pob import ResistsSpec
from poe2tube.publish.models import Source

PlayerStage = Literal["act", "early_endgame", "endgame"]

# 段階ごとの ilvl の範囲と、その段階で手に入る (動画で使ってよい) カレンシー
STAGE_ILVL: dict[PlayerStage, tuple[int, int]] = {
    "act": (30, 55),
    "early_endgame": (65, 75),
    "endgame": (78, 84),
}
STAGE_CURRENCIES: dict[PlayerStage, frozenset[str] | None] = {
    # カオスはアクトでもたまに拾える (kyohei 2026-09-28)。品質系・熟練工・可能性・鑑定・シャード・
    # ヴァールもアクト中の解説回で使う (2026-09-28)。神のオーブは「取っておく」前提なので入れない
    "act": frozenset(
        {
            "transmute",
            "augment",
            "regal",
            "alchemy",
            "exalt",
            "annul",
            "chaos",
            "vaal",
            "whetstone",
            "scrap",
            "bauble",
            "gemcutter",
            "etcher",
            "artificer",
            "chance",
            "wisdom",
            "scroll_fragment",
            "transmute_shard",
            "alchemy_shard",
            "regal_shard",
            "artificer_shard",
            "chance_shard",
            "jeweller_lesser",
            "jeweller_greater",
        }
    ),
    "early_endgame": frozenset(
        {"transmute", "augment", "regal", "alchemy", "exalt", "annul", "chaos", "artificer"}
    ),
    "endgame": None,  # 制限なし
}
STAGE_JA = {"act": "アクト中", "early_endgame": "エンド序盤", "endgame": "エンド"}
# ベースの入手段階 (docs/script_rules/_facts.md と揃える)。表に無いベースは検査しない
BASE_STAGE: dict[str, PlayerStage] = {
    "Mnemonic Ring": "endgame",  # 創生の木限定
    "Sapphire Ring": "act",  # 通常ドロップ、ドロップレベル 12
}
STAGE_ORDER = {"act": 0, "early_endgame": 1, "endgame": 2}


class Brief(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(description="ファイル名に使う識別子 (例 craft_intro_1min)")
    title_hint: str = Field(description="動画タイトルの方向性 (Claude が整える)")
    audience: str = Field(default="ストーリーをクリアしたばかりの初心者")
    player_stage: PlayerStage = Field(
        default="act",
        description="視聴者の段階 (_intake.md 質問 1)。ベースの ilvl と使えるカレンシーを縛る",
    )
    goal: str = Field(description="この動画を見た人ができるようになること (1 文)")
    target_seconds: int = Field(ge=30, le=900)
    plan: CraftStagePlan = Field(description="クラフトステージに回す手順 (メインの実演)")
    demos: dict[str, CraftStagePlan] = Field(
        default_factory=dict,
        description="追加の実演 {キー: 手順}。武器・防具など別のアイテムでも見せる回 (ADR 004)",
    )
    resists: dict[str, ResistsSpec] = Field(
        default_factory=dict,
        description="耐性の画面の装備の組 {キー: 組}。scene.resists で指す (ExileDesk ⑰)",
    )
    notes: list[str] = Field(default_factory=list, description="台本に入れたい要点・避けたい事")
    sources: list[Source] = Field(
        default_factory=list,
        description="解説で参考にした記事・サイト。投稿の説明欄の「▼参考」に出す",
    )
    final_step: int | None = Field(
        default=None,
        ge=1,
        description="完成とみなす手 (それ以降はカオス/消去などの実験)。無ければ最後の手",
    )

    def problems(self) -> list[str]:
        """設定と手順の食い違い (段階に合わない ilvl・カレンシー・ベース、final_step) を文で返す."""
        out = self._plan_problems(self.plan, "")
        for key, plan in self.demos.items():
            out += self._plan_problems(plan, f"[{key}] ")
        for key, spec in self.resists.items():
            for it in spec.items:
                if it.demo is not None and it.demo not in self.demos:
                    out.append(f"耐性の組 {key}: 実演 {it.demo!r} が demos に無い")
        n = len(self.plan.expanded_steps())
        if self.final_step is not None and self.final_step > n:
            out.append(f"final_step {self.final_step} が手数 {n} を超えている")
        return out

    def _plan_problems(self, plan: CraftStagePlan, label: str) -> list[str]:
        out: list[str] = []
        stage = STAGE_JA[self.player_stage]
        lo, hi = STAGE_ILVL[self.player_stage]
        if not lo <= plan.item_level <= hi:
            out.append(
                f"{label}視聴者が「{stage}」なのに ilvl {plan.item_level} ({lo}〜{hi} にする)"
            )
        allowed = STAGE_CURRENCIES[self.player_stage]
        if allowed is not None:
            bad = sorted({s.currency for s in plan.steps if s.currency not in allowed})
            if bad:
                out.append(
                    f"{label}「{stage}」では手に入りにくいカレンシー: {bad}"
                    " (設定を変えるか手順から外す)"
                )
        need = BASE_STAGE.get(plan.base)
        if need and STAGE_ORDER[need] > STAGE_ORDER[self.player_stage]:
            out.append(
                f"{label}{plan.base} は「{STAGE_JA[need]}」で手に入るベース"
                f" (視聴者は「{stage}」)。段階に合うベースにする"
            )
        return out
