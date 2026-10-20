"""1 本の動画で使う結果 JSON の組 (メイン + 追加の実演、ADR 004).

場面 (Scene) の ``demo`` から、その場面が指す結果を引く。
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from poe2tube.config.settings import REPO_ROOT
from poe2tube.contracts.craft_stage import CraftStagePlan, CraftStageResult
from poe2tube.contracts.pob import ResistsBlock
from poe2tube.script.model import MAIN, Scene, VideoScript


@dataclass(frozen=True)
class ResultSet:
    main: CraftStageResult
    demos: dict[str, CraftStageResult] = field(default_factory=dict)
    resists: dict[str, ResistsBlock] = field(default_factory=dict)

    def of(self, scene: Scene) -> CraftStageResult:
        return self.demos[scene.demo] if scene.demo is not None else self.main

    def by_key(self, key: str) -> CraftStageResult:
        """実演キーから結果 ("main" = メイン)。比べる相手 (compare_with) 用."""
        return self.main if key == MAIN else self.demos[key]

    def plan_of(self, scene: Scene) -> CraftStagePlan:
        return self.of(scene).plan

    def items(self) -> list[tuple[str | None, CraftStageResult]]:
        return [(None, self.main), *self.demos.items()]


def as_set(result: CraftStageResult | ResultSet) -> ResultSet:
    return result if isinstance(result, ResultSet) else ResultSet(result)


def _load(path: Path) -> CraftStageResult:
    return CraftStageResult.model_validate(json.loads(path.read_text(encoding="utf-8")))


def load_results(script: VideoScript, root: Path = REPO_ROOT) -> ResultSet:
    return ResultSet(
        _load(root / script.result_file),
        {k: _load(root / p) for k, p in script.demos.items()},
        {
            k: ResistsBlock.model_validate(json.loads((root / p).read_text(encoding="utf-8")))
            for k, p in script.resists.items()
        },
    )
