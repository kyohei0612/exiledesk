"""付く MOD の指名と、始めの状態 (ExileDesk 要望 ⑱、v0.1.335〜).

乱数 (seed) を何百通り回して台本に合う実演を探すのをやめるため、手順 JSON で結果を指名する。
付けられない指名は ExileDesk の craft-stage-run.mjs が理由付きで止まる (ここでは形だけ見る)。
結果 JSON の手には ``picked`` と ``pick_chance`` (指名しなかったら付く確率) が入る。動画では
「本当は○% の当たり」と正直に言う。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Pick(BaseModel):
    """付ける MOD 1 つ。``mod`` は系統 (ColdResistance) か id (Rings/ColdResistance)."""

    model_config = ConfigDict(extra="forbid")

    mod: str = Field(min_length=1)
    tier: str | None = Field(default=None, pattern=r"^T\d+$", description="例 T6。無ければ乱数")
    values: list[float] | None = Field(default=None, description="数値。無ければ段の中の乱数")


class StartState(BaseModel):
    """手を見せずに最初から持っているアイテム (拾ったレア・作ったレア)."""

    model_config = ConfigDict(extra="forbid")

    rarity: Literal["normal", "magic", "rare"] | None = Field(
        default=None, description="無ければ MOD 3 つ以上でレア"
    )
    mods: list[Pick] = Field(default_factory=list, max_length=6)
    quality: float | None = Field(default=None, ge=0, le=30)
    sockets: int | None = Field(default=None, ge=0, le=6)
