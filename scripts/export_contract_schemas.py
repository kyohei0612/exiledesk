"""contracts/*.schema.json を pydantic モデルから書き出す (ExileDesk の TS 側が型生成に使う).

python scripts/export_contract_schemas.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import structlog

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poe2tube.contracts.craft_stage import CraftStagePlan, CraftStageResult  # noqa: E402

log = structlog.get_logger()


def main() -> None:
    out = ROOT / "contracts"
    out.mkdir(exist_ok=True)
    for name, model in (
        ("craft-stage-plan", CraftStagePlan),
        ("craft-stage-result", CraftStageResult),
    ):
        path = out / f"{name}.schema.json"
        schema = model.model_json_schema(by_alias=True)
        schema["$id"] = f"https://github.com/kyohei0612/POE2Tube/contracts/{name}.schema.json"
        path.write_text(json.dumps(schema, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        log.info("schema written", path=str(path.relative_to(ROOT)))


if __name__ == "__main__":
    main()
