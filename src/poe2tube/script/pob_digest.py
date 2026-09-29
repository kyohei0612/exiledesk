"""PoB の計算と耐性の組を、台本を書く Claude に渡す形にまとめる (ExileDesk ⑰).

数字は PoB の出力を丸めるだけで、こちらで計算し直さない。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from poe2tube.config.settings import REPO_ROOT
from poe2tube.contracts.craft_stage import CraftStageResult, StageItem
from poe2tube.contracts.pob import ResistsBlock
from poe2tube.script.brief import Brief


def pob_digest(result: CraftStageResult) -> dict[str, Any] | None:
    """前提 (キャラ・スキル・敵・ペナルティ) と手ごとの DPS。pob が無ければ None."""
    pob = result.pob
    if pob is None:
        return None
    ch = pob.character
    enemy = pob.enemy
    return {
        "前提": f"{ch.class_} Lv{ch.level}・{ch.skill_ja} (Lv{ch.gem_level})・{pob.config_ja}",
        "敵": None if enemy is None else {"level": enemy.level, "life": enemy.life, "ja": enemy.ja},
        "PoB": pob.version,
        "steps": [
            {
                "step": i,
                "dps": round(s.dps, 1),
                "hit": round(s.hit, 1),
                "aps": round(s.aps, 2),
                "breakdown": {k: round(v, 1) for k, v in s.breakdown.items() if v},
                "life": s.life,
            }
            for i, s in enumerate(pob.steps)
        ],
    }


def item_extras(item: StageItem) -> dict[str, Any]:
    """上の数値 (青 = MOD で変わった)・ルーン・解呪。台本で数字を言う時の出どころ."""
    out: dict[str, Any] = {}
    if item.properties:
        out["properties"] = [
            f"{p.get('label')}: {p.get('value')}{' (青)' if p.get('up') else ''}"
            for p in item.properties
        ]
    if item.augments:
        out["runes"] = [f"{a.get('ja')}: {a.get('text_ja')}" for a in item.augments]
    if item.disposed:
        out["disposed"] = item.disposed
    return out


def resists_files(brief: Brief) -> dict[str, str]:
    """耐性の組の出力パス (scripts/run_stage.py の出力先と同じ)."""
    return {k: f"data/results/{brief.name}__resists_{k}.json" for k in brief.resists}


def resists_block(brief: Brief, root: Path = REPO_ROOT) -> list[str]:
    """耐性の組の中身をプロンプトの 1 節に。組が無ければ空."""
    if not brief.resists:
        return []
    body: dict[str, Any] = {}
    for key, rel in resists_files(brief).items():
        path = root / rel
        if not path.exists():
            continue
        rb = ResistsBlock.model_validate(json.loads(path.read_text(encoding="utf-8")))
        body[key] = {
            "items": [i.get("name") for i in (rb.model_extra or {}).get("items", [])],
            "equip": (rb.model_extra or {}).get("equip"),
            "rows": [
                {
                    "act": r.get("penalty"),
                    "label": r.get("label"),
                    "total": {k: v.get("total") for k, v in r.get("resists", {}).items()},
                }
                for r in rb.rows
            ],
        }
    return [
        "## 耐性の画面の組 (PoB。この数字だけを使う)\n"
        "- `scene.kind: resists` に `resists` (組のキー) と `act` (0 / -10 … -60) を入れる。"
        "質問の行は `reveal: false` (ペナルティ後を隠す)\n\n```json\n"
        + json.dumps(body, ensure_ascii=False, indent=2)
        + "\n```"
    ]
