from __future__ import annotations

import json

import pytest
from PIL import Image

from poe2tube.config.settings import REPO_ROOT
from poe2tube.contracts.craft_stage import CraftStageResult
from poe2tube.render.overlay_fx import hit_label
from poe2tube.render.short_frame import SH, SW, compose_short, wrap_text
from poe2tube.script.model import Line, Scene


def test_wrap_text_breaks_at_punct_or_particle() -> None:
    assert wrap_text("短い文。") == ["短い文。"]
    rows = wrap_text("価値が高いから、アクト中は取っておくのがおすすめよ。")
    assert rows[0].endswith("、") and len(rows) == 2
    assert wrap_text("問題。アクト中に使っていいオーブはどれ？")[0] == "問題。アクト中に"
    for r in wrap_text("カオスと神は、使っちゃダメなのだ？"):
        assert r[0] not in "、。！？"


def test_quiz_scene_rules() -> None:
    Scene(kind="quiz", choices=["alchemy", "chaos"], answer=1, badges=["a", "b"])
    with pytest.raises(ValueError):
        Scene(kind="quiz", choices=["alchemy"])
    with pytest.raises(ValueError):
        Scene(kind="quiz", choices=["alchemy", "chaos"], answer=2)
    with pytest.raises(ValueError):
        Scene(kind="talk", choices=["alchemy", "chaos"])
    a = Scene(kind="quiz", choices=["alchemy", "chaos"])
    b = Scene(kind="quiz", choices=["alchemy", "chaos"], answer=0)
    assert a.key() != b.key()


def test_compose_short_size() -> None:
    static = Image.new("RGBA", (1920, 1080), (200, 200, 200, 255))
    line = Line(speaker="metan", text="正解は、錬金術のオーブ。", scene=Scene(kind="stage", step=0))
    out = compose_short(static, line, 0, "アクト中に使っていいのはどれ？")
    assert out.size == (SW, SH)


def _res(name: str) -> CraftStageResult:
    p = REPO_ROOT / "data" / "results" / f"act_currency_8min{name}.json"
    return CraftStageResult.model_validate(json.loads(p.read_text(encoding="utf-8")))


@pytest.mark.parametrize(
    ("name", "want"),
    [
        ("__weapon", ["品質アップ!", "ソケット +1"]),
        ("__chance_ok", ["ユニークに!"]),
        ("__chance_ng", ["壊れた!"]),
        ("__ring_fail", ["使えない!"]),
        ("__gem", ["品質アップ!", "サポート枠が増えた!"]),
    ],
)
def test_hit_label_non_mod_changes(name: str, want: list[str]) -> None:
    assert [hit_label(s)[0] for s in _res(name).steps] == want


def test_countdown_number_and_ticks() -> None:
    from poe2tube.render.overlay_fx import countdown_number

    assert countdown_number(5.0, 3, 1.9) is None
    assert [countdown_number(5.0, 3, t) for t in (2.0, 3.2, 4.9)] == [3, 2, 1]
    assert countdown_number(5.0, 3, 5.0) is None
    with pytest.raises(ValueError):
        Scene(kind="talk", countdown=3)
