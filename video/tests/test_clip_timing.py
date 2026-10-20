from __future__ import annotations

from pathlib import Path

import pytest
from PIL import Image

from poe2tube.script.model import Line, Scene
from poe2tube.video import clip_timing as ct


def _clip(tmp_path: Path, n: int, change_at: int) -> list[Path]:
    """change_at 番目のコマでアイテム枠のあたりが白くなるクリップ."""
    out = []
    for i in range(n):
        im = Image.new("RGB", (1920, 1080), (10, 10, 10))
        if i >= change_at:
            im.paste((240, 240, 240), (300, 100, 1300, 800))
        p = tmp_path / f"f{i:03d}.png"
        im.save(p)
        out.append(p)
    return out


def test_attach_index_finds_biggest_change(tmp_path: Path) -> None:
    clip = _clip(tmp_path, 12, 7)
    assert ct.attach_index(clip) == 7
    assert ct.attach_index(clip[:1]) == 0


def _ln(kind: str, step: int | None = None) -> Line:
    return Line(speaker="metan", text="あ", scene=Scene(kind=kind, step=step))  # type: ignore[arg-type]


def test_plan_hits_preroll_and_hold(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    clip = _clip(tmp_path, 24, 10)
    monkeypatch.setattr(ct, "clip_frames", lambda plan, step: clip)
    lines = [
        ("実践", _ln("stage", 0)),  # 「変成を使うわね」
        ("実践", _ln("stage", 1)),  # 付いた → 前の行で手つき
        ("実践", _ln("talk")),
        ("実践", _ln("stage", 2)),  # 前が talk → 手つきは流せない
        ("実践", _ln("stage", 2)),
    ]
    hits = ct.plan_hits(lines, plan=None, fps=24)  # type: ignore[arg-type]
    assert set(hits) == {1, 3}
    a, b = hits[1], hits[3]
    assert a.preroll and a.start == 10 and a.land_at == 0.0
    assert not b.preroll and b.start == 10 - int(0.4 * 24) and b.land_at == pytest.approx(9 / 24)
    assert a.min_seconds == pytest.approx(14 / 24 + ct.HOLD_AFTER_ATTACH)


def test_new_chapter_disables_preroll(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    clip = _clip(tmp_path, 6, 3)
    monkeypatch.setattr(ct, "clip_frames", lambda plan, step: clip)
    hits = ct.plan_hits([("A", _ln("stage", 0)), ("B", _ln("stage", 1))], plan=None)  # type: ignore[arg-type]
    assert not hits[1].preroll
