"""コマを CPU の複数のコアで並べて作る.

kyohei 2026-10-04「並列だな 10 分の 1 になるなら使わない手はない」。

行を ``CHUNK`` コマずつの小分けにして別々のプロセスで作り、出来た順ではなく**番号の順**に受け取って
RGB のまま書き出し (video/encode.py) へ流す。描き方は 1 本の流れ (frames.iter_frames) と全く同じ。

コマ (1 枚 6 MB) をプロセスの間でコピーして渡すと、そこが詰まる (測って 1 秒 130 コマ)。なので
**共有メモリの置き場**を用意し、作業は置き場に直接描き込み、親は置き場から ffmpeg へ流すだけにする。
番号の順に受け取るので、重い小分け (手を打つ演出の行) が終わるまで後ろは待つ。小分けを小さくし、
置き場を多め (SLOT_BUDGET 分、約 96 個) にして、待っている間もほかの作業が先へ進めるようにする。
"""

from __future__ import annotations

import multiprocessing as mp
import os
from collections import deque
from collections.abc import Iterator
from multiprocessing.pool import AsyncResult
from multiprocessing.shared_memory import SharedMemory

import structlog

from poe2tube.video.frames import FrameContext, cue_frames

log = structlog.get_logger()
CHUNK = 8  # 1 つの仕事のコマ数。小さいほど重い行 (手を打つ演出) の順番待ちが短い
SLOT_BUDGET = 4_500_000_000  # 置き場 (共有メモリ) に使ってよいメモリ。先に作っておける量
FRAME_BYTES = 1920 * 1080 * 3  # 横長も縦 (1080x1920) も同じ大きさ
RawFrame = tuple[int, int, memoryview]  # (幅, 高さ, RGB)。次の小分けを受け取るまで有効
_CTX: FrameContext | None = None


def default_workers() -> int:
    """使う作業の数。CPU の数から 4 を残して、16 まで (ほかの作業が固まらないように)."""
    return max(1, min(16, (os.cpu_count() or 2) - 4))


def _init(ctx: FrameContext) -> None:
    global _CTX
    _CTX = ctx


def _render(task: tuple[int, int, int, str]) -> tuple[int, int, int]:
    """行 i の k0〜k1 コマ目を置き場 (共有メモリ) に描き込み、(枚数, 幅, 高さ) を返す."""
    i, k0, k1, slot = task
    assert _CTX is not None
    shm = SharedMemory(name=slot)
    out = shm.buf
    assert out is not None
    try:
        count, w, h = 0, 0, 0
        last: tuple[object, bytes] | None = None  # 同じ絵 (使い回したコマ) は RGB にし直さない
        for frame in cue_frames(_CTX, i, k0, k1):
            if last is not None and last[0] is frame:
                data = last[1]
            else:
                rgb = frame.convert("RGB")
                w, h = rgb.size
                data = rgb.tobytes()
                last = (frame, data)
            if len(data) != FRAME_BYTES:
                raise ValueError(f"コマの大きさが想定外: {w}x{h}")
            out[count * FRAME_BYTES : (count + 1) * FRAME_BYTES] = data
            count += 1
        return count, w, h
    finally:
        del out
        shm.close()


def _tasks(ctx: FrameContext, only: range | None = None) -> Iterator[tuple[int, int, int]]:
    for i, c in enumerate(ctx.cues):
        if only is not None and i not in only:
            continue
        n = len(c.mouth_levels)
        for k0 in range(0, n, CHUNK):
            yield i, k0, min(n, k0 + CHUNK)


class FramePool:
    """並べて作るプロセスと置き場 (共有メモリ) を 1 回だけ用意して、何章分でも使う.

    章ごとに作る時、章ごとに 16 プロセスを立ち上げ直すと 1 章数秒かかるので使い回す (2026-10-04)。
    ``with FramePool(ctx, workers) as fp: fp.frames(range(i0, i1))``
    """

    def __init__(self, ctx: FrameContext, workers: int) -> None:
        self.ctx = ctx
        self.workers = workers
        n_slots = max(workers + 2, SLOT_BUDGET // (CHUNK * FRAME_BYTES))
        self.slots = [SharedMemory(create=True, size=CHUNK * FRAME_BYTES) for _ in range(n_slots)]
        self.pool = mp.get_context("spawn").Pool(workers, initializer=_init, initargs=(ctx,))

    def __enter__(self) -> FramePool:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def close(self) -> None:
        self.pool.terminate()
        self.pool.join()
        for shm in self.slots:
            shm.close()
            shm.unlink()

    def frames(self, only: range | None = None) -> Iterator[tuple[int, RawFrame]]:
        """(通し番号, RGB のコマ) を番号の順に返す。コマは受け取ったらすぐ使う (置き場を使い回す).

        ``only`` を渡すとその行だけ (章ごとの動画)。番号は 0 から数え直す。
        """
        ctx, slots = self.ctx, self.slots
        free = deque(range(len(slots)))
        tasks = _tasks(ctx, only)
        pending: deque[tuple[tuple[int, int, int], int, AsyncResult[tuple[int, int, int]]]] = (
            deque()
        )
        n = 0

        def submit() -> None:
            task = next(tasks, None) if free else None
            if task is not None:
                s = free.popleft()
                job = self.pool.apply_async(_render, ((*task, slots[s].name),))
                pending.append((task, s, job))

        for _ in range(len(slots)):
            submit()
        while pending:
            (i, _k0, k1), s, job = pending.popleft()
            count, w, h = job.get()
            buf = slots[s].buf
            assert buf is not None
            for k in range(count):
                view = buf[k * FRAME_BYTES : (k + 1) * FRAME_BYTES]
                yield n, (w, h, view)
                view.release()  # 流し終わったら手放す (置き場を片付けられるように)
                n += 1
            free.append(s)  # 書き出しに流し終わったので置き場を返す
            submit()
            c = ctx.cues[i]
            if k1 == len(c.mouth_levels):
                log.info("frames", line=c.index, scene=c.line.scene.kind, done=n, total=ctx.total)


def iter_frames_parallel(
    ctx: FrameContext, workers: int, only: range | None = None
) -> Iterator[tuple[int, RawFrame]]:
    """1 回だけ並べて作る時の近道 (プロセスは使い終わったら片付ける)."""
    with FramePool(ctx, workers) as fp:
        yield from fp.frames(only)
