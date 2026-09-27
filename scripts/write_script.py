"""brief + 結果 JSON から Claude に台本を書かせて data/scripts/<name>.json に保存する.

    python scripts/write_script.py data/briefs/craft_intro_1min.json [--model X] [--attempts 3]

結果 JSON は data/results/<name>.json (無ければ先に scripts/run_stage.py)。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import structlog

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poe2tube.contracts.craft_stage import CraftStageResult  # noqa: E402
from poe2tube.script.brief import Brief  # noqa: E402
from poe2tube.script.writer import claude_cli_runner, save_script, write_script  # noqa: E402
from poe2tube.script.writer_long import write_script_long  # noqa: E402

LONG_THRESHOLD_SECONDS = 180  # これ以上は「構成表 → 章ごと」で書く

log = structlog.get_logger()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("brief", type=Path)
    ap.add_argument("--model", default=None)
    ap.add_argument("--attempts", type=int, default=3)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--sections", action="store_true", help="短くても章ごとに書く")
    a = ap.parse_args()
    brief = Brief.model_validate(json.loads(a.brief.read_text(encoding="utf-8")))
    result_file = f"data/results/{brief.name}.json"
    result = CraftStageResult.model_validate(
        json.loads((ROOT / result_file).read_text(encoding="utf-8"))
    )
    runner = claude_cli_runner(a.model)
    if a.sections or brief.target_seconds >= LONG_THRESHOLD_SECONDS:
        lw = write_script_long(brief, result, result_file, runner, a.attempts)
        script, attempts = lw.script, lw.attempts
        outline_path = ROOT / "data" / "outlines" / f"{brief.name}.json"
        outline_path.parent.mkdir(parents=True, exist_ok=True)
        outline_path.write_text(lw.outline.model_dump_json(indent=2), encoding="utf-8")
    else:
        wr = write_script(brief, result, result_file, runner, a.attempts)
        script, attempts = wr.script, {"all": wr.attempts}
    out = save_script(script, a.out or ROOT / "data" / "scripts" / f"{brief.name}.json")
    log.info(
        "script written",
        path=str(out.relative_to(ROOT)),
        attempts=attempts,
        chars=script.char_count(),
        est_sec=round(script.estimated_seconds()),
    )


if __name__ == "__main__":
    main()
