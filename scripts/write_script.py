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

log = structlog.get_logger()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("brief", type=Path)
    ap.add_argument("--model", default=None)
    ap.add_argument("--attempts", type=int, default=3)
    ap.add_argument("--out", type=Path, default=None)
    a = ap.parse_args()
    brief = Brief.model_validate(json.loads(a.brief.read_text(encoding="utf-8")))
    result_file = f"data/results/{brief.name}.json"
    result = CraftStageResult.model_validate(
        json.loads((ROOT / result_file).read_text(encoding="utf-8"))
    )
    wr = write_script(brief, result, result_file, claude_cli_runner(a.model), a.attempts)
    out = save_script(wr.script, a.out or ROOT / "data" / "scripts" / f"{brief.name}.json")
    log.info(
        "script written",
        path=str(out.relative_to(ROOT)),
        attempts=wr.attempts,
        chars=wr.script.char_count(),
        est_sec=round(wr.script.estimated_seconds()),
    )


if __name__ == "__main__":
    main()
