"""brief の手順を ExileDesk のクラフトステージで回して結果 JSON を作る.

python scripts/run_stage.py data/briefs/craft_intro_1min.json
→ data/results/craft_intro_1min.json
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import structlog

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poe2tube.config.settings import get_settings  # noqa: E402
from poe2tube.contracts.craft_stage import CraftStagePlan, CraftStageResult  # noqa: E402
from poe2tube.script.brief import Brief  # noqa: E402

log = structlog.get_logger()
CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


def run_stage(brief_path: Path) -> list[Path]:
    """メインと追加の実演を全部回す → data/results/<name>.json と <name>__<キー>.json."""
    brief = Brief.model_validate(json.loads(brief_path.read_text(encoding="utf-8")))
    outs = [run_plan(brief.plan, brief.name, brief.name)]
    for key, plan in brief.demos.items():
        outs.append(run_plan(plan, brief.name, f"{brief.name}__{key}"))
    return outs


def run_plan(plan: CraftStagePlan, name: str, out_name: str) -> Path:
    s = get_settings()
    work = ROOT / "output" / "work" / name
    work.mkdir(parents=True, exist_ok=True)
    plan_path = work / f"plan_{out_name}.json"
    plan_path.write_text(plan.model_dump_json(by_alias=True, indent=2), encoding="utf-8")
    out = ROOT / "data" / "results" / f"{out_name}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    node = shutil.which("node")
    if not node:
        raise FileNotFoundError("node が PATH に無い")
    cli = s.exiledesk_root / "scripts" / "craft-stage-run.mjs"
    r = subprocess.run(
        [node, str(cli), str(plan_path), str(out)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        cwd=s.exiledesk_root,
        creationflags=CREATE_NO_WINDOW,
        timeout=300,
    )
    if r.returncode != 0:
        raise RuntimeError(f"craft-stage-run 失敗 rc={r.returncode}: {r.stderr[-600:]}")
    result = CraftStageResult.model_validate(json.loads(out.read_text(encoding="utf-8")))
    log.info(
        "stage result",
        path=str(out.relative_to(ROOT)),
        steps=len(result.steps),
        stdout=r.stdout.strip()[-200:],
    )
    return out


if __name__ == "__main__":
    run_stage(Path(sys.argv[1]))
