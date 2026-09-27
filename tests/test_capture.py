"""クラフトステージ撮影: URL・キャッシュキー (ブラウザ不要)、実撮影は Vite が動いている時だけ."""

from __future__ import annotations

import json
import urllib.parse
from pathlib import Path

import pytest

from poe2tube.capture import stage
from poe2tube.contracts.craft_stage import CraftStagePlan

ROOT = Path(__file__).resolve().parents[1]


def _plan() -> CraftStagePlan:
    p = ROOT / "contracts/examples/plan-transmute-augment-regal.json"
    return CraftStagePlan.model_validate(json.loads(p.read_text(encoding="utf-8")))


def test_replay_url_and_cache_key_are_stable() -> None:
    plan = _plan()
    url = stage.replay_url(plan, 2, "http://localhost:1420")
    q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    assert q["step"] == ["2"]
    assert json.loads(q["stage-plan"][0])["base"] == "Mnemonic Ring"
    assert stage.plan_key(plan) == stage.plan_key(_plan())
    other = plan.model_copy(update={"seed": plan.seed + 1})
    assert stage.plan_key(other) != stage.plan_key(plan)
    assert stage.cached_path(plan, 3).name == "step_3.png"


def test_capture_plan_uses_cache_without_browser(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(stage, "CACHE_DIR", tmp_path)
    plan = _plan()
    for st in (0, 1):
        p = stage.cached_path(plan, st)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(b"png")
    paths = stage.capture_plan(plan, [0, 1])  # 全部キャッシュ済 → ブラウザを起動しない
    assert paths[1].read_bytes() == b"png"


def test_real_capture_when_vite_is_running(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    if not stage.port_open("localhost", 1420):
        pytest.skip("ExileDesk の Vite dev が動いていない")
    monkeypatch.setattr(stage, "CACHE_DIR", tmp_path)
    paths = stage.capture_plan(_plan(), [1])
    from PIL import Image

    im = Image.open(paths[1])
    assert im.width >= 2000 and im.height >= 1000  # 2 倍密度
