"""1 本の動画で使う結果 JSON の組 (メイン + 追加の実演、ADR 004).

場面 (Scene) の ``demo`` から、その場面が指す結果を引く。
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from poe2tube.config.settings import REPO_ROOT
from poe2tube.contracts.craft_stage import CraftStagePlan, CraftStageResult
from poe2tube.script.model import Scene, VideoScript


@dataclass(frozen=True)
class ResultSet:
    main: CraftStageResult
    demos: dict[str, CraftStageResult] = field(default_factory=dict)

    def of(self, scene: Scene) -> CraftStageResult:
        return self.demos[scene.demo] if scene.demo is not None else self.main

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
    )
