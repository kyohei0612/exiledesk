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


def write_provenance(script_path: Path, model: str | None) -> None:
    """何で作ったかを隣の .meta.json に残す (後で「どのルール・どの CLI で書いたか」を辿れる)."""
    import hashlib
    import shutil
    import subprocess
    from datetime import datetime

    from poe2tube.script.writer import FACTS_PATH, RULES_PATH

    def sha(p: Path) -> str:
        return hashlib.sha256(p.read_bytes()).hexdigest()[:12] if p.exists() else ""

    exe = shutil.which("claude")
    ver = ""
    if exe:
        r = subprocess.run([exe, "--version"], capture_output=True, text=True, timeout=30)
        ver = r.stdout.strip()
    meta = {
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "claude_cli": ver,
        "model_flag": model or "(CLI 既定)",
        "rules_sha": sha(RULES_PATH),
        "facts_sha": sha(FACTS_PATH),
    }
    script_path.with_suffix(".meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


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
    # 追加の実演 (武器・防具など別のアイテム) の結果。run_stage.py が <name>__<キー>.json に出す
    demos = {
        k: CraftStageResult.model_validate(
            json.loads((ROOT / f"data/results/{brief.name}__{k}.json").read_text(encoding="utf-8"))
        )
        for k in brief.demos
    }
    runner = claude_cli_runner(a.model)
    if a.sections or brief.target_seconds >= LONG_THRESHOLD_SECONDS:
        cache_dir = ROOT / "output" / "work" / brief.name / "script_cache"
        lw = write_script_long(
            brief, result, result_file, runner, a.attempts, cache_dir=cache_dir, demos=demos
        )
        script, attempts = lw.script, lw.attempts
        outline_path = ROOT / "data" / "outlines" / f"{brief.name}.json"
        outline_path.parent.mkdir(parents=True, exist_ok=True)
        outline_path.write_text(lw.outline.model_dump_json(indent=2), encoding="utf-8")
    else:
        wr = write_script(brief, result, result_file, runner, a.attempts, demos=demos)
        script, attempts = wr.script, {"all": wr.attempts}
    out = save_script(script, a.out or ROOT / "data" / "scripts" / f"{brief.name}.json")
    write_provenance(out, a.model)
    log.info(
        "script written",
        path=str(out.relative_to(ROOT)),
        attempts=attempts,
        chars=script.char_count(),
        est_sec=round(script.estimated_seconds()),
    )


if __name__ == "__main__":
    main()
