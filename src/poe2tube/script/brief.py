"""題材の指示 (brief): kyohei が「これで 1 本」と渡す最小の入力.

brief → (ExileDesk でクラフトステージを回す) → 結果 JSON → Claude が台本 → OK → 動画。
書く前に `docs/script_rules/_intake.md` の既定の質問に答えてもらい、``problems()`` で
設定 (視聴者の段階) と手順 (ilvl・カレンシー) の食い違いを弾く (2026-09-28 kyohei)。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from poe2tube.contracts.craft_stage import CraftStagePlan

PlayerStage = Literal["act", "early_endgame", "endgame"]

# 段階ごとの ilvl の範囲と、その段階で手に入る (動画で使ってよい) カレンシー
STAGE_ILVL: dict[PlayerStage, tuple[int, int]] = {
    "act": (30, 55),
    "early_endgame": (65, 75),
    "endgame": (78, 84),
}
STAGE_CURRENCIES: dict[PlayerStage, frozenset[str] | None] = {
    "act": frozenset({"transmute", "augment", "regal", "alchemy", "exalt", "annul"}),
    "early_endgame": frozenset(
        {"transmute", "augment", "regal", "alchemy", "exalt", "annul", "chaos", "artificer"}
    ),
    "endgame": None,  # 制限なし
}
STAGE_JA = {"act": "アクト中", "early_endgame": "エンド序盤", "endgame": "エンド"}
# ベースの入手段階 (docs/script_rules/_facts.md と揃える)。表に無いベースは検査しない
BASE_STAGE: dict[str, PlayerStage] = {"Mnemonic Ring": "endgame"}  # 創生の木限定
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
    plan: CraftStagePlan = Field(description="クラフトステージに回す手順")
    notes: list[str] = Field(default_factory=list, description="台本に入れたい要点・避けたい事")
    final_step: int | None = Field(
        default=None,
        ge=1,
        description="完成とみなす手 (それ以降はカオス/消去などの実験)。無ければ最後の手",
    )

    def problems(self) -> list[str]:
        """設定と手順の食い違い (段階に合わない ilvl・カレンシー、final_step の範囲) を文で返す."""
        out: list[str] = []
        lo, hi = STAGE_ILVL[self.player_stage]
        if not lo <= self.plan.item_level <= hi:
            out.append(
                f"視聴者が「{STAGE_JA[self.player_stage]}」なのに ilvl {self.plan.item_level}"
                f" ({lo}〜{hi} にする)"
            )
        allowed = STAGE_CURRENCIES[self.player_stage]
        if allowed is not None:
            bad = sorted({s.currency for s in self.plan.steps if s.currency not in allowed})
            if bad:
                out.append(
                    f"「{STAGE_JA[self.player_stage]}」では手に入りにくいカレンシー: {bad}"
                    " (設定を変えるか手順から外す)"
                )
        need = BASE_STAGE.get(self.plan.base)
        if need and STAGE_ORDER[need] > STAGE_ORDER[self.player_stage]:
            out.append(
                f"{self.plan.base} は「{STAGE_JA[need]}」で手に入るベース"
                f" (視聴者は「{STAGE_JA[self.player_stage]}」)。段階に合うベースにする"
            )
        n = len(self.plan.expanded_steps())
        if self.final_step is not None and self.final_step > n:
            out.append(f"final_step {self.final_step} が手数 {n} を超えている")
        return out
