"""音のミックス: 声 + BGM (ループ、控えめ) + SE (時刻指定) を 1 本の wav にする (numpy).

BGM / SE は youtube-pipeline の assets を流用 (settings.youtube_pipeline_root)。
mp3 は ffmpeg で 24kHz モノラル wav に変換して cache/audio/ に置く。
"""

from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import numpy.typing as npt

from poe2tube.config.settings import REPO_ROOT, get_settings
from poe2tube.video.timeline import read_wav, write_wav

CACHE_DIR = REPO_ROOT / "cache" / "audio"
CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0
Samples = npt.NDArray[np.float32]


@dataclass(frozen=True)
class SoundEvent:
    """時刻 ``at`` 秒に鳴らす SE."""

    at: float
    kind: str  # start / slide / pop / shock / complete / miss


SE_ALIAS = {"hit": "se_pop_2.mp3"}  # クラフトステージで手を打った瞬間 (ピコッ)
# GiftCut の SE (kyohei 了承 2026-09-28)。場面 → (フォルダ, ファイル)。無ければ下の探し方に戻る
GIFTCUT_SE = {
    "start": ("03_登場・場面転換", "タイトル1.mp3"),
    "chapter": ("03_登場・場面転換", "シーン切替1.mp3"),
    "slide": ("03_登場・場面転換", "パッ1.mp3"),
    "pop": ("03_登場・場面転換", "ニュッ1.mp3"),
    "hit": ("01_強調・キラーン", "シャキーン1.mp3"),
    "hit_rarity": ("04_演出・ファンファーレ", "レベルアップ1.mp3"),
    "hit_added": ("04_演出・ファンファーレ", "アイテム入手1.mp3"),
    "hit_removed": ("02_ツッコミ・リアクション", "チーン1.mp3"),
    "complete": ("04_演出・ファンファーレ", "ジャジャーン1.mp3"),
    "shock": ("02_ツッコミ・リアクション", "驚き1.mp3"),
}


def se_path(kind: str) -> Path:
    """POE2Tube 自前の assets/se を先に、無ければ youtube-pipeline の物 (assets/se/README.md)."""
    s = get_settings()
    if kind in GIFTCUT_SE:
        folder, file = GIFTCUT_SE[kind]
        gc = s.giftcut_root / "SE" / folder / file
        if gc.exists():
            return gc
    name = SE_ALIAS.get(kind, f"se_{kind}_1.mp3")
    own = REPO_ROOT / "assets" / "se" / name
    if own.exists():
        return own
    return s.youtube_pipeline_root / "assets" / "se" / name


def bgm_path(name: str) -> Path:
    s = get_settings()
    return s.youtube_pipeline_root / "assets" / "bgm" / f"{name}.mp3"


def decode(path: Path, sr: int = 24000) -> Samples:
    """任意の音声ファイルを float32 モノラルに (ffmpeg 経由、キャッシュ)."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256(f"{path.resolve()}|{path.stat().st_mtime_ns}|{sr}".encode()).hexdigest()
    cached = CACHE_DIR / f"{key[:20]}.wav"
    if not cached.exists():
        exe = shutil.which("ffmpeg")
        if not exe:
            raise FileNotFoundError("ffmpeg が PATH に無い")
        cmd = [
            exe,
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(path),
            "-ac",
            "1",
            "-ar",
            str(sr),
            str(cached),
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, creationflags=CREATE_NO_WINDOW)
        if r.returncode != 0:
            raise RuntimeError(f"ffmpeg decode 失敗: {path} {r.stderr[-300:]}")
    samples, _ = read_wav(cached)
    return samples


def db(gain_db: float) -> float:
    return float(10 ** (gain_db / 20))


def loop_to(samples: Samples, length: int, fade: int) -> Samples:
    """``length`` サンプルになるまで繰り返し、末尾をフェードアウト."""
    if len(samples) == 0:
        return np.zeros(length, dtype=np.float32)
    reps = int(np.ceil(length / len(samples)))
    out = np.tile(samples, reps)[:length].astype(np.float32)
    fade = min(fade, length)
    if fade > 0:
        out[-fade:] *= np.linspace(1.0, 0.0, fade, dtype=np.float32)
        out[:fade] *= np.linspace(0.0, 1.0, fade, dtype=np.float32)
    return out


def place(track: Samples, clip: Samples, at: float, sr: int, gain: float) -> None:
    """``track`` の ``at`` 秒に ``clip`` を足し込む (はみ出しは切る)."""
    start = int(at * sr)
    if start >= len(track):
        return
    n = min(len(clip), len(track) - start)
    track[start : start + n] += clip[:n] * gain


def mix(
    voice_wav: Path,
    out: Path,
    bgm: str | None,
    events: list[SoundEvent],
    bgm_gain_db: float,
    se_gain_db: float,
    ducking: float = 0.55,
) -> Path:
    """声を主役に BGM と SE を重ねる。声が鳴っている間は BGM を ``ducking`` 倍に下げる."""
    voice, sr = read_wav(voice_wav)
    track = voice.astype(np.float32).copy()
    if bgm:
        music = loop_to(decode(bgm_path(bgm), sr), len(track), fade=sr * 2) * db(bgm_gain_db)
        env = _voice_envelope(voice, sr, ducking)
        track += music * env
    for ev in events:
        p = se_path(ev.kind)
        if p.exists():
            place(track, decode(p, sr), ev.at, sr, db(se_gain_db))
    peak = float(np.max(np.abs(track))) if len(track) else 0.0
    if peak > 0.98:
        track *= 0.98 / peak
    return write_wav(out, track, sr)


def _voice_envelope(voice: Samples, sr: int, ducking: float) -> Samples:
    """声のある所で ducking、無い所で 1.0。0.2 秒でなめらかに遷移."""
    hop = sr // 20
    n = int(np.ceil(len(voice) / hop))
    loud = np.array(
        [float(np.sqrt(np.mean(voice[i * hop : (i + 1) * hop] ** 2))) > 0.01 for i in range(n)]
    )
    env_blocks = np.where(loud, ducking, 1.0).astype(np.float32)
    env = np.repeat(env_blocks, hop)[: len(voice)]
    kernel = np.ones(hop * 4, dtype=np.float32) / (hop * 4)
    smooth = np.convolve(env, kernel, mode="same").astype(np.float32)
    return smooth
