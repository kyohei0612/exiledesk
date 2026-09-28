"""音声クライアント (HTTP はモック) / タイムライン / アニメの検証."""

from __future__ import annotations

import wave
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from poe2tube.audio import voicevox as vv
from poe2tube.script.model import Line, Scene, Section
from poe2tube.video.animate import POP_DELAY, POP_SECONDS, pop_scale
from poe2tube.video.timeline import (
    MOUTH_CLOSED,
    MOUTH_OPEN,
    build_cues,
    concat_audio,
    mouth_levels,
    read_wav,
)


def _write_wav(path: Path, seconds: float, sr: int = 24000, loud: bool = True) -> Path:
    t = np.arange(int(sr * seconds)) / sr
    sig = (0.6 * np.sin(2 * np.pi * 220 * t)) if loud else np.zeros_like(t)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((sig * 32767).astype(np.int16).tobytes())
    return path


def test_mouth_levels_open_on_sound_and_closed_in_gap(tmp_path: Path) -> None:
    samples, sr = read_wav(_write_wav(tmp_path / "a.wav", 1.0))
    levels = mouth_levels(samples, sr, fps=12, gap_frames=3)
    assert len(levels) == 12 + 3
    assert levels[0] == MOUTH_OPEN
    assert levels[-3:] == (MOUTH_CLOSED,) * 3


def test_build_cues_and_concat_audio_align(tmp_path: Path) -> None:
    lines = [
        Line(speaker="metan", text="あ", scene=Scene(kind="talk")),
        Line(speaker="zundamon", text="い", scene=Scene(kind="talk")),
    ]
    sec = Section(name="s", target_seconds=5, lines=lines)
    wavs = [_write_wav(tmp_path / "1.wav", 0.5), _write_wav(tmp_path / "2.wav", 0.25, loud=False)]
    cues = build_cues([sec], wavs, fps=12, gap=0.25)
    assert [c.frames for c in cues] == [6 + 3, 3 + 3]
    assert cues[1].start == pytest.approx(cues[0].duration)
    out = concat_audio(cues, tmp_path / "mix.wav")
    samples, sr = read_wav(out)
    assert len(samples) == int(round((cues[0].duration + cues[1].duration) * sr))
    # 反応の行の最短の長さ: 短ければ無音で延ばす
    held = build_cues([sec], wavs, fps=12, gap=0.25, min_seconds={1: 2.0})
    assert held[1].frames == 24 and held[0].frames == 9


def test_build_cues_rejects_mismatch(tmp_path: Path) -> None:
    sec = Section(
        name="s",
        target_seconds=5,
        lines=[Line(speaker="metan", text="あ", scene=Scene(kind="talk"))],
    )
    with pytest.raises(ValueError):
        build_cues([sec], [], fps=12)


def test_pop_scale_curve() -> None:
    assert pop_scale(0.0) == 0.0
    assert pop_scale(10.0) == 1.0
    peak = max(pop_scale(POP_DELAY + POP_SECONDS * k / 20) for k in range(21))
    assert 1.0 < peak < 1.2  # 少し行き過ぎて戻る
    assert pop_scale(POP_DELAY + POP_SECONDS) == pytest.approx(1.0)


class _Resp:
    def __init__(self, payload: Any = None, content: bytes = b"") -> None:
        self._payload = payload
        self.content = content
        self.ok = True

    def json(self) -> Any:
        return self._payload

    def raise_for_status(self) -> None:
        return None


def test_voicevox_client_caches_and_maps_style(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(vv, "CACHE_DIR", tmp_path)
    client = vv.VoicevoxClient(base_url="http://127.0.0.1:1", speed=1.2)
    calls: list[str] = []

    def fake_post(url: str, params: Any, json: Any = None, timeout: int = 0) -> _Resp:
        calls.append(url.rsplit("/", 1)[-1])
        if url.endswith("/audio_query"):
            return _Resp(payload={"accent_phrases": [], "speedScale": 1.0})
        assert json["speedScale"] == 1.2
        return _Resp(content=b"RIFF....")

    monkeypatch.setattr(client.session, "post", fake_post)
    line = Line(
        speaker="zundamon", text="MOD", speech="モッド", emotion="happy", scene=Scene(kind="talk")
    )
    assert client.style_of(line) == 1
    p1 = client.synthesize(line)
    p2 = client.synthesize(line)
    assert p1 == p2 and p1.read_bytes() == b"RIFF...."
    assert calls == ["audio_query", "synthesis"]  # 2 回目はキャッシュ
    assert client.cache_path(line).name.startswith("zundamon_")


def test_stage_hit_not_replayed_after_talk() -> None:
    from poe2tube.video.clip_timing import stage_hit

    def ln(kind: str, step: int | None = None) -> Line:
        return Line(speaker="metan", text="あ", scene=Scene(kind=kind, step=step))  # type: ignore[arg-type]

    shown: set[tuple[str | None, int]] = set()
    first = ln("stage", 2)
    assert stage_hit(ln("stage", 1), first, shown)
    shown.add((None, 2))
    # 雑談を挟んで同じ 2 手目に戻っても打ち直さない
    assert not stage_hit(ln("talk"), ln("stage", 2), shown)
    assert stage_hit(ln("talk"), ln("stage", 2))  # shown 無しは従来どおり
