"""コマを CPU の複数のコアで並べて作る.

kyohei 2026-10-04「並列だな 10 分の 1 になるなら使わない手はない」。

行を ``CHUNK`` コマずつの小分けにして別々のプロセスで作り、出来た順ではなく**番号の順**に受け取って
RGB のまま書き出し (video/encode.py) へ流す。先に作りすぎてメモリを食わないよう、配る仕事は
作業の数の 2 倍までに抑える。描き方は 1 本の流れ (frames.iter_frames) と全く同じ。
"""

from __future__ import annotations

import multiprocessing as mp
import os
from collections import deque
from collections.abc import Iterator
from multiprocessing.pool import AsyncResult

import structlog

from poe2tube.video.frames import FrameContext, cue_frames

log = structlog.get_logger()
CHUNK = 12  # 1 つの仕事のコマ数 (1 コマ 6 MB なので 12 コマで約 75 MB)
RawFrame = tuple[int, int, bytes]  # (幅, 高さ, RGB)
_CTX: FrameContext | None = None


def default_workers() -> int:
    """使う作業の数。CPU の数から 4 を残して、16 まで (ほかの作業が固まらないように)."""
    return max(1, min(16, (os.cpu_count() or 2) - 4))


def _init(ctx: FrameContext) -> None:
    global _CTX
    _CTX = ctx


def _render(task: tuple[int, int, int]) -> list[RawFrame]:
    i, k0, k1 = task
    assert _CTX is not None
    out: list[RawFrame] = []
    for frame in cue_frames(_CTX, i, k0, k1):
        rgb = frame.convert("RGB")
        out.append((rgb.width, rgb.height, rgb.tobytes()))
    return out


def _tasks(ctx: FrameContext) -> Iterator[tuple[int, int, int]]:
    for i, c in enumerate(ctx.cues):
        n = len(c.mouth_levels)
        for k0 in range(0, n, CHUNK):
            yield i, k0, min(n, k0 + CHUNK)


def iter_frames_parallel(ctx: FrameContext, workers: int) -> Iterator[tuple[int, RawFrame]]:
    """(通し番号, RGB のコマ) を番号の順に返す."""
    tasks = _tasks(ctx)
    pending: deque[tuple[tuple[int, int, int], AsyncResult[list[RawFrame]]]] = deque()
    n = 0
    with mp.get_context("spawn").Pool(workers, initializer=_init, initargs=(ctx,)) as pool:

        def submit() -> None:
            task = next(tasks, None)
            if task is not None:
                pending.append((task, pool.apply_async(_render, (task,))))

        for _ in range(workers * 2):
            submit()
        while pending:
            (i, _k0, k1), job = pending.popleft()
            frames = job.get()
            submit()
            for raw in frames:
                yield n, raw
                n += 1
            c = ctx.cues[i]
            if k1 == len(c.mouth_levels):
                log.info("frames", line=c.index, scene=c.line.scene.kind, done=n, total=ctx.total)
