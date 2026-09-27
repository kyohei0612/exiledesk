"""題材の指示 (brief): kyohei が「これで 1 本」と渡す最小の入力.

brief → (ExileDesk でクラフトステージを回す) → 結果 JSON → Claude が台本 → OK → 動画。
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from poe2tube.contracts.craft_stage import CraftStagePlan


class Brief(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(description="ファイル名に使う識別子 (例 craft_intro_1min)")
    title_hint: str = Field(description="動画タイトルの方向性 (Claude が整える)")
    audience: str = Field(default="ストーリーをクリアしたばかりの初心者")
    goal: str = Field(description="この動画を見た人ができるようになること (1 文)")
    target_seconds: int = Field(ge=30, le=900)
    plan: CraftStagePlan = Field(description="クラフトステージに回す手順")
    notes: list[str] = Field(default_factory=list, description="台本に入れたい要点・避けたい事")
