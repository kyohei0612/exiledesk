"""構成表 (outline): 長い台本を章ごとに書く前に、8 分の骨組みを Claude に 1 回で決めさせる.

ニュース台本と違い、クラフト入門は 1 本の連続した話 (導入で見せた完成品を仕組みで説明し、
実践で作り、まとめで復唱する)。章は並列に書けないので、先に構成表を固めてから順番に書く。
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator

from poe2tube.contracts.craft_stage import CraftStageResult
from poe2tube.script.brief import Brief
from poe2tube.script.model import CHARS_PER_MINUTE, SceneKind

OUTLINE_TOLERANCE = 0.12


class OutlineSection(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Claude が余計なキーを足しても弾かない

    name: str = Field(description="章の名前 (画面左上のラベルになる。例: 導入 / 基礎知識 / 実践)")
    target_seconds: int = Field(ge=10)
    goal: str = Field(description="この章で視聴者ができるようになること (1 文)")
    points: list[str] = Field(min_length=1, description="話す要点 (箇条書き、3〜6 個)")
    steps: list[int] = Field(
        default_factory=list, description="この章で触れる工程 (結果 JSON の index)"
    )
    scenes: list[SceneKind] = Field(min_length=1, description="この章で使う画面の種類")
    bridge: str = Field(description="次の章へ渡す最後の一言の方向性 (例: 『じゃあ実際にやるわね』)")

    @property
    def target_chars(self) -> int:
        return int(self.target_seconds * CHARS_PER_MINUTE / 60)


class Outline(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str
    sections: list[OutlineSection] = Field(min_length=3)

    @model_validator(mode="after")
    def _unique_names(self) -> Outline:
        names = [s.name for s in self.sections]
        if len(set(names)) != len(names):
            raise ValueError(f"章の名前が重複: {names}")
        return self

    def check_against(self, brief: Brief, result: CraftStageResult) -> list[str]:
        """尺の合計・工程の範囲・実践の網羅を点検し、問題を文で返す."""
        problems: list[str] = []
        total = sum(s.target_seconds for s in self.sections)
        lo = brief.target_seconds * (1 - OUTLINE_TOLERANCE)
        hi = brief.target_seconds * (1 + OUTLINE_TOLERANCE)
        if not lo <= total <= hi:
            problems.append(f"章の秒数の合計 {total} が目標 {brief.target_seconds} 秒 ±12% の外")
        n = len(result.steps)
        stage_steps: set[int] = set()
        for s in self.sections:
            bad = [st for st in s.steps if not 0 <= st <= n]  # 0 = 白 (使う前、白の話の item 等)
            if bad:
                problems.append(f"「{s.name}」の steps に無い工程 {bad} (最大 {n})")
            if "stage" in s.scenes:
                stage_steps.update(st for st in s.steps if 1 <= st <= n)
        missing = [st for st in range(1, n + 1) if st not in stage_steps]
        if missing:
            problems.append(
                f"stage を使う章の steps に工程 {missing} が無い (実践は全部の手を 1 手 1 行で)"
            )
        first = self.sections[0]
        if first.target_seconds > 30:
            problems.append(f"最初の章 (導入) が {first.target_seconds} 秒 (30 秒以内)")
        return problems
