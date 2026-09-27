"""SE の鳴らし所と自前 SE の優先."""

from __future__ import annotations

from pathlib import Path

from poe2tube.audio.mix import se_path
from poe2tube.config.settings import REPO_ROOT
from poe2tube.names import NameBook
from poe2tube.script.model import Line, Scene
from poe2tube.video.animate import POP_DELAY, sound_events
from poe2tube.video.timeline import Cue

SAMPLE = Path(__file__).parent / "fixtures" / "price-keys.sample.json"


def _cue(i: int, line: Line, start: float) -> Cue:
    return Cue(i, "s", line, Path("x.wav"), start, 2.0, (0,) * 48)


def test_sound_events_kinds_and_times() -> None:
    book = NameBook.load(price_keys=SAMPLE, essence_keys=SAMPLE.with_name("none.json"))
    lines = [
        Line(speaker="metan", text="はじめ", scene=Scene(kind="talk")),
        Line(speaker="metan", text="変成のオーブよ", scene=Scene(kind="stack", step=1)),
        Line(
            speaker="zundamon",
            text="えっなのだ",
            emotion="surprised",
            scene=Scene(kind="stack", step=1),
        ),
        Line(speaker="metan", text="完成", scene=Scene(kind="item", step=3, highlight="name")),
    ]
    cues = [_cue(i + 1, ln, i * 2.0) for i, ln in enumerate(lines)]
    ev = sound_events(cues, book, n_steps=3)
    kinds = [(e.kind, e.at) for e in ev]
    assert ("start", 0.0) in kinds
    assert ("slide", 2.0) in kinds  # talk → stack
    assert ("pop", 2.0 + POP_DELAY) in kinds  # 変成のオーブ
    assert ("shock", 4.0) in kinds
    assert ("complete", 6.0) in kinds  # 最終工程の名前強調
    assert not any(k == "slide" and t == 4.0 for k, t in kinds)  # 同じ画面なら鳴らさない


def test_se_lookup_order() -> None:
    # 1) GiftCut の SE (あれば) → 2) POE2Tube 自前 → 3) youtube-pipeline
    p = se_path("pop")
    assert p.exists()
    assert "GiftCut" in str(p) or p == REPO_ROOT / "assets" / "se" / "se_pop_1.mp3"
    assert se_path("miss") == REPO_ROOT / "assets" / "se" / "se_miss_1.mp3"  # GiftCut に無い種類
    assert "youtube-pipeline" in str(se_path("start")) or se_path("start").exists()
