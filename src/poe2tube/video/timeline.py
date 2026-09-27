"""タイムライン: 1 行 = 1 wav。声の長さがその行の表示時間 (声先行・絵追従).

- 行と行の間に ``gap`` 秒の無音
- 口パクは wav の RMS を fps ごとに測って 3 段階 (閉じ / 半開き / 開き)
"""

from __future__ import annotations

import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import numpy.typing as npt

from poe2tube.script.model import Line, Section

MOUTH_CLOSED, MOUTH_HALF, MOUTH_OPEN = 0, 1, 2


@dataclass(frozen=True)
class Cue:
    """1 行ぶんの時間情報."""

    index: int
    section: str
    line: Line
    wav: Path
    start: float
    duration: float
    mouth_levels: tuple[int, ...]  # fps ごと (無音の gap を含む)

    @property
    def end(self) -> float:
        return self.start + self.duration

    @property
    def frames(self) -> int:
        return len(self.mouth_levels)


def read_wav(path: Path) -> tuple[npt.NDArray[np.float32], int]:
    """モノラル float32 (-1..1) と sample rate."""
    with wave.open(str(path)) as w:
        sr = w.getframerate()
        raw = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
        if w.getnchannels() == 2:
            raw = raw.reshape(-1, 2).mean(axis=1)
    return raw / 32768.0, sr


def mouth_levels(
    samples: npt.NDArray[np.float32], sr: int, fps: int, gap_frames: int
) -> tuple[int, ...]:
    """fps ごとの RMS を 95 パーセンタイルで正規化して 3 段階に。末尾に gap ぶんの閉じ口."""
    hop = max(1, sr // fps)
    n = int(np.ceil(len(samples) / hop))
    if n == 0:
        return tuple([MOUTH_CLOSED] * gap_frames)
    rms = np.array(
        [float(np.sqrt(np.mean(samples[i * hop : (i + 1) * hop] ** 2) + 1e-9)) for i in range(n)]
    )
    peak = float(np.percentile(rms, 95)) or 1.0
    levels = [
        MOUTH_CLOSED if r < 0.15 else MOUTH_HALF if r < 0.45 else MOUTH_OPEN for r in rms / peak
    ]
    return tuple(levels + [MOUTH_CLOSED] * gap_frames)


def build_cues(sections: list[Section], wavs: list[Path], fps: int, gap: float = 0.3) -> list[Cue]:
    """セクション順に wav を当てて Cue 列を作る。``wavs`` は全行ぶん (行の順)."""
    lines = [(sec.name, ln) for sec in sections for ln in sec.lines]
    if len(lines) != len(wavs):
        raise ValueError(f"行数 {len(lines)} と wav 数 {len(wavs)} が違う")
    gap_frames = int(round(gap * fps))
    cues: list[Cue] = []
    t = 0.0
    for i, ((section, line), wav) in enumerate(zip(lines, wavs, strict=True), start=1):
        samples, sr = read_wav(wav)
        levels = mouth_levels(samples, sr, fps, gap_frames)
        duration = len(levels) / fps
        cues.append(Cue(i, section, line, wav, t, duration, levels))
        t += duration
    return cues


def concat_audio(cues: list[Cue], out: Path, sr: int = 24000) -> Path:
    """Cue の並びどおりに wav を連結 (gap は無音)。フレーム数と厳密に合わせる."""
    parts: list[npt.NDArray[np.float32]] = []
    for c in cues:
        samples, src_sr = read_wav(c.wav)
        if src_sr != sr:
            raise ValueError(f"sample rate が違う: {c.wav} ({src_sr} != {sr})")
        need = int(round(c.duration * sr))
        if len(samples) < need:
            samples = np.concatenate([samples, np.zeros(need - len(samples), dtype=np.float32)])
        parts.append(samples[:need])
    mixed = np.concatenate(parts) if parts else np.zeros(0, dtype=np.float32)
    return write_wav(out, mixed, sr)


def write_wav(out: Path, samples: npt.NDArray[np.float32], sr: int) -> Path:
    """float32 (-1..1) を 16bit モノラル wav に."""
    out.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((np.clip(samples, -1, 1) * 32767).astype(np.int16).tobytes())
    return out


def scene_changed(prev: Line | None, cur: Line) -> bool:
    """画面が切り替わる行か (シーンの種類・工程・並びのどれかが違う)."""
    if prev is None:
        return True
    a, b = prev.scene, cur.scene
    key_a = (a.kind, a.step, tuple(a.show_steps or ()))
    key_b = (b.kind, b.step, tuple(b.show_steps or ()))
    return key_a != key_b
