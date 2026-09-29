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
from poe2tube.contracts.pob import ResistsBlock, ResistsSpec  # noqa: E402
from poe2tube.script.brief import Brief  # noqa: E402

log = structlog.get_logger()
CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


def run_stage(brief_path: Path) -> list[Path]:
    """メインと追加の実演・耐性の組を全部回す → data/results/<name>.json、<name>__<キー>.json、
    <name>__resists_<キー>.json."""
    brief = Brief.model_validate(json.loads(brief_path.read_text(encoding="utf-8")))
    if bad := brief.problems():
        raise ValueError("brief の食い違い: " + " / ".join(bad))
    outs = [run_plan(brief.plan, brief.name, brief.name)]
    for key, plan in brief.demos.items():
        outs.append(run_plan(plan, brief.name, f"{brief.name}__{key}"))
    for key, spec in brief.resists.items():
        outs.append(run_resists(brief, key, spec))
    return outs


def _node(args: list[str]) -> str:
    """ExileDesk の craft-stage-run.mjs を回す (PoB があると初回は cargo のビルドで数分)."""
    s = get_settings()
    node = shutil.which("node")
    if not node:
        raise FileNotFoundError("node が PATH に無い")
    cli = s.exiledesk_root / "scripts" / "craft-stage-run.mjs"
    # 新しい worktree の mlua-sys (LuaJIT) のビルドはカレントディレクトリの exe を探せないと落ちる
    env = {k: v for k, v in os.environ.items() if k != "NoDefaultCurrentDirectoryInExePath"}
    r = subprocess.run(
        [node, str(cli), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        cwd=s.exiledesk_root,
        env=env,
        creationflags=CREATE_NO_WINDOW,
        timeout=900,
    )
    if r.returncode != 0:
        raise RuntimeError(f"craft-stage-run 失敗 rc={r.returncode}: {r.stderr[-600:]}")
    return r.stdout.strip()


def _plan_json(plan: CraftStagePlan) -> str:
    return plan.model_dump_json(by_alias=True, exclude_none=True, indent=2)


def run_plan(plan: CraftStagePlan, name: str, out_name: str) -> Path:
    work = ROOT / "output" / "work" / name
    work.mkdir(parents=True, exist_ok=True)
    plan_path = work / f"plan_{out_name}.json"
    plan_path.write_text(_plan_json(plan), encoding="utf-8")
    out = ROOT / "data" / "results" / f"{out_name}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    stdout = _node([str(plan_path), str(out)])
    result = CraftStageResult.model_validate(json.loads(out.read_text(encoding="utf-8")))
    log.info(
        "stage result",
        path=str(out.relative_to(ROOT)),
        steps=len(result.steps),
        stdout=stdout[-200:],
    )
    return out


def run_resists(brief: Brief, key: str, spec: ResistsSpec) -> Path:
    """耐性の画面の組 (装備 + キャラ) を PoB に回す → ペナルティ 7 通りの耐性 (ExileDesk ⑰)."""

    def plan_of(demo: str | None) -> CraftStagePlan:
        return brief.plan if demo is None else brief.demos[demo]

    items = [
        {"plan": json.loads(_plan_json(plan_of(it.demo).model_copy(update={"pob": None})))}
        | ({"step": it.step} if it.step is not None else {})
        for it in spec.items
    ]
    work = ROOT / "output" / "work" / brief.name
    work.mkdir(parents=True, exist_ok=True)
    spec_path = work / f"resists_{key}.json"
    pob: dict[str, object] = {"class": spec.class_, "level": spec.level}
    if spec.quests_act is not None:
        pob["quests_act"] = spec.quests_act
    body = {"pob": pob, "items": items}
    spec_path.write_text(json.dumps(body, ensure_ascii=False, indent=2), encoding="utf-8")
    out = ROOT / "data" / "results" / f"{brief.name}__resists_{key}.json"
    stdout = _node(["--resists", str(spec_path), str(out)])
    ResistsBlock.model_validate(json.loads(out.read_text(encoding="utf-8")))
    log.info("resists result", path=str(out.relative_to(ROOT)), stdout=stdout[-200:])
    return out


if __name__ == "__main__":
    run_stage(Path(sys.argv[1]))
