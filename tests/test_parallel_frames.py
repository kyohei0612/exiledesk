"""コマを並べて作っても、1 本の流れで作ったコマと 1 ピクセルも違わない (2026-10-04)."""

from __future__ import annotations

import json
import wave
from pathlib import Path

import numpy as np

from poe2tube.config.settings import REPO_ROOT
from poe2tube.contracts.craft_stage import CraftStageResult
from poe2tube.names import NameBook
from poe2tube.script.model import Line, Scene, Section
from poe2tube.script.panel import Panel
from poe2tube.video import parallel
from poe2tube.video.frames import cue_frames, iter_frames, make_context
from poe2tube.video.timeline import build_cues

EX = "contracts/examples/result-transmute-augment-regal.json"


def _wav(path: Path, seconds: float) -> Path:
    t = np.arange(int(24000 * seconds)) / 24000
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(24000)
        w.writeframes((0.5 * np.sin(2 * np.pi * 220 * t) * 32767).astype(np.int16).tobytes())
    return path


def _ctx(tmp_path: Path):  # type: ignore[no-untyped-def]
    result = CraftStageResult.model_validate(
        json.loads((REPO_ROOT / EX).read_text(encoding="utf-8"))
    )
    icons = Scene(kind="icons", panel=Panel(title="見出し", icons=["exalt", "regal"]))
    lines = [
        Line(speaker="metan", text="高貴なオーブを使うわ。", scene=icons),
        Line(speaker="zundamon", text="白いのだ。", scene=Scene(kind="item", step=0)),
    ]
    sections = [Section(name="一", target_seconds=5, lines=lines[:1])]
    sections.append(Section(name="二", target_seconds=5, lines=lines[1:]))
    wavs = [_wav(tmp_path / "1.wav", 0.4), _wav(tmp_path / "2.wav", 0.3)]
    cues = build_cues(sections, wavs, fps=12, gap=0.25)
    return cues, result, make_context(cues, result, NameBook.load())


def test_chunks_match_one_stream(tmp_path: Path) -> None:
    cues, result, ctx = _ctx(tmp_path)
    whole = [f.convert("RGB").tobytes() for _, f in iter_frames(cues, result, NameBook.load())]
    parts: list[bytes] = []
    for i, c in enumerate(ctx.cues):
        n = len(c.mouth_levels)
        for k0 in range(0, n, 5):  # わざと半端な小分け
            parts += [f.convert("RGB").tobytes() for f in cue_frames(ctx, i, k0, min(n, k0 + 5))]
    assert len(parts) == len(whole) == ctx.total
    assert parts == whole


def test_parallel_matches_one_stream(tmp_path: Path) -> None:
    cues, result, ctx = _ctx(tmp_path)
    whole = [f.convert("RGB").tobytes() for _, f in iter_frames(cues, result, NameBook.load())]
    got = [(n, (w, h, bytes(b))) for n, (w, h, b) in parallel.iter_frames_parallel(ctx, workers=2)]
    assert [n for n, _ in got] == list(range(len(whole)))
    assert [bytes(raw[2]) for _, raw in got] == whole


def test_default_workers_leaves_cores() -> None:
    assert 1 <= parallel.default_workers() <= 16


def test_chapter_progress_does_not_depend_on_later_chapters() -> None:
    from poe2tube.video.frames import chapter_progress

    early = chapter_progress(["a", "a", "b"], n_sections=4)
    later = chapter_progress(["a", "a", "b", "b", "c", "d"], n_sections=4)
    assert early == later[:3]
    assert early[0] == 0.0 and early[1] == 0.125 and early[2] == 0.25


def test_cut_audio_matches_cue_time(tmp_path: Path) -> None:
    from poe2tube.video.chapters import cue_range, cut_audio
    from poe2tube.video.timeline import concat_audio, read_wav

    cues, _result, _ctx2 = _ctx(tmp_path)
    full = concat_audio(cues, tmp_path / "full.wav")
    i0, i1 = cue_range(cues, "二")
    part = cut_audio(full, cues, i0, i1, tmp_path / "part.wav")
    samples, sr = read_wav(part)
    assert len(samples) == int(round(cues[1].duration * sr))
