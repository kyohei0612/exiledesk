"""章ごとの動画: 章が OK になった時点で 1080p の本番の画質で作っておき、最後はつなぐだけ.

kyohei 2026-10-04「台本 OK の段階で裏で動画作れる？ 最後のまとめが終わった時には全部作成済みで
チェックもできて、あとは合体だけの方が確実」「確認用の動画は要らない、1080p で作って確認して
そのまま合体」。

- 章の動画 = その章の映像 + その章の音。音は「それまでの全部の章の音」を合わせてから章の時間を
  切り出すので、BGM の流れも効果音の位置も、全体を合わせた時と同じ
- 章の中身・前の章の最後の行・声・撮影の版などが同じなら作り直さない (``.key`` に指紋を残す)
- 最後の合体は映像をそのままつなぎ (-c:v copy)、音だけ全体で合わせ直す (video/encode.py)
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import structlog

from poe2tube.capture.stage import CAPTURE_VER
from poe2tube.config.settings import get_settings
from poe2tube.names import NameBook
from poe2tube.script.model import VideoScript
from poe2tube.video.encode import encode_stream
from poe2tube.video.frames import cue_frames, make_context
from poe2tube.video.parallel import FramePool, default_workers, iter_frames_parallel
from poe2tube.video.results import ResultSet
from poe2tube.video.timeline import Cue, read_wav, write_wav

log = structlog.get_logger()
# 描き方を変えたら上げる (作り済みの章の動画を使い回さないように)
RENDER_VER = "r4-reuse"


def cue_range(cues: list[Cue], section: str) -> tuple[int, int]:
    """その章の行の位置 [i0, i1)。"""
    idx = [i for i, c in enumerate(cues) if c.section == section]
    if not idx:
        raise ValueError(f"章が無い: {section}")
    return idx[0], idx[-1] + 1


def chapter_path(work: Path, k: int) -> Path:
    return work / "chapters" / f"section_{k:02d}.mp4"


def _file_sha(path: str) -> str:
    p = Path(path)
    return hashlib.sha256(p.read_bytes()).hexdigest()[:16] if p.exists() else "-"


def chapter_key(script: VideoScript, k: int, cues: list[Cue], n_sections: int) -> str:
    """章の指紋: これが同じなら、作った動画をそのまま使える."""
    s = get_settings()
    sec = script.sections[k]
    i0, i1 = cue_range(cues, sec.name)
    prev = script.sections[k - 1].lines[-1].model_dump(mode="json") if k else None
    files = [script.result_file, *script.demos.values(), *script.resists.values()]
    parts = {
        "section": sec.model_dump(mode="json"),
        "prev": prev,
        "k": k,
        "voices": [(c.wav.name, c.frames, c.voice_delay) for c in cues[i0:i1]],
        "n_sections": n_sections,
        "capture": CAPTURE_VER,
        "render": (RENDER_VER, s.hit_zoom),
        "video": (s.width, s.height, s.fps, s.nvenc),
        "audio": (s.bgm, s.bgm_gain_db, s.se_gain_db),
        "script": (script.final_step, script.layout, script.short_title),
        "results": [_file_sha(f) for f in files],
    }
    raw = json.dumps(parts, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def is_fresh(path: Path, key: str) -> bool:
    keyfile = path.with_suffix(".key")
    return path.exists() and keyfile.exists() and keyfile.read_text(encoding="utf-8") == key


def cut_audio(full: Path, cues: list[Cue], i0: int, i1: int, out: Path) -> Path:
    """全体の音から、行 i0〜i1 の時間だけを切り出す (コマ数と厳密に合わせる)."""
    samples, sr = read_wav(full)
    a = int(round(cues[i0].start * sr))
    b = a + int(round(sum(c.duration for c in cues[i0:i1]) * sr))
    return write_wav(out, samples[a:b], sr)


def build_chapter(
    script: VideoScript,
    rs: ResultSet,
    k: int,
    cues: list[Cue],
    full_audio: Path,
    work: Path,
    book: NameBook,
    n_sections: int,
    pool: FramePool | None = None,
) -> Path:
    """章 k の 1080p の動画 (映像 + その章の音) を作る。指紋が同じなら作らない.

    ``pool`` を渡すと、並べて作るプロセスをほかの章と使い回す (起動の時間を省く)。
    """
    s = get_settings()
    out = chapter_path(work, k)
    key = chapter_key(script, k, cues, n_sections)
    if is_fresh(out, key):
        log.info("chapter reused", k=k, path=out.name)
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    sec = script.sections[k]
    i0, i1 = cue_range(cues, sec.name)
    short = script.layout == "short"
    ctx = make_context(cues, rs, book, script.final_step, short, script.short_title, n_sections)
    audio = cut_audio(full_audio, cues, i0, i1, out.with_suffix(".wav"))
    workers = s.render_workers or default_workers()
    if pool is not None:
        frames = encode_stream(pool.frames(range(i0, i1)), audio, s.fps, out, s.nvenc)
    elif workers > 1:
        frames = encode_stream(
            iter_frames_parallel(ctx, workers, range(i0, i1)), audio, s.fps, out, s.nvenc
        )
    else:
        it = ((n, f) for n, f in enumerate(f for i in range(i0, i1) for f in cue_frames(ctx, i)))
        frames = encode_stream(it, audio, s.fps, out, s.nvenc)
    out.with_suffix(".key").write_text(key, encoding="utf-8")
    log.info("chapter built", k=k, name=sec.name, frames=frames, path=out.name)
    return out


def build_all(
    script: VideoScript,
    rs: ResultSet,
    cues: list[Cue],
    full_audio: Path,
    work: Path,
    book: NameBook,
    n_sections: int,
    only: list[int] | None = None,
) -> list[Path]:
    """章をまとめて作る。作る章が 2 つ以上なら、並べて作るプロセスを 1 回だけ立ち上げて使い回す."""
    s = get_settings()
    ks = only if only is not None else list(range(len(script.sections)))
    todo = [
        k
        for k in ks
        if not is_fresh(chapter_path(work, k), chapter_key(script, k, cues, n_sections))
    ]
    workers = s.render_workers or default_workers()
    pool: FramePool | None = None
    if len(todo) >= 2 and workers > 1:
        short = script.layout == "short"
        ctx = make_context(cues, rs, book, script.final_step, short, script.short_title, n_sections)
        pool = FramePool(ctx, workers)
    try:
        return [
            build_chapter(script, rs, k, cues, full_audio, work, book, n_sections, pool) for k in ks
        ]
    finally:
        if pool is not None:
            pool.close()
