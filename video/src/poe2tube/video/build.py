"""台本 JSON → mp4 の 1 本道 (1 分テスト用の最小構成、BGM / 字幕焼き込みは後段で追加)."""

from __future__ import annotations

import json
import multiprocessing as mp
import os
import shutil
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

import structlog

from poe2tube.audio.mix import mix
from poe2tube.audio.voicevox import VoicevoxClient
from poe2tube.capture.anim import anim_query, capture_anims, intro_timing
from poe2tube.capture.stage import capture_plan, ensure_vite, needs_capture, pob_json
from poe2tube.capture.views import capture_views, view_query
from poe2tube.config.settings import REPO_ROOT, get_settings
from poe2tube.contracts.craft_stage import CraftStagePlan
from poe2tube.names import NameBook
from poe2tube.script.model import VideoScript
from poe2tube.video.animate import sound_events
from poe2tube.video.chapters import build_all
from poe2tube.video.clip_timing import plan_cue_timing, plan_hits
from poe2tube.video.encode import concat_with_audio, encode_files
from poe2tube.video.frames import write_frames
from poe2tube.video.results import ResultSet, load_results
from poe2tube.video.timeline import Cue, build_cues, concat_audio, read_wav

log = structlog.get_logger()
CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


@dataclass(frozen=True)
class BuildResult:
    mp4: Path
    seconds: float
    frames: int


def load_script(path: Path) -> tuple[VideoScript, ResultSet]:
    """台本と、台本が指す結果 JSON の組 (メイン + 追加の実演) を読んで噛み合わせを点検する."""
    script = VideoScript.model_validate(json.loads(path.read_text(encoding="utf-8")))
    rs = load_results(script)
    problems = script.check_against(rs.main, rs.demos)
    if problems:
        raise ValueError("台本と結果 JSON が噛み合わない: " + "; ".join(problems))
    return script, rs


CAPTURE_WORKERS = 6  # 手つきを同時に撮るブラウザの数 (実演ごとに 1 つ)


def _capture_one(key: str | None, plan: CraftStagePlan, steps: list[int], pob: str | None) -> str:
    capture_plan(plan, steps, pob=pob)
    return str(key)


def capture_stage_scenes(script: VideoScript, rs: ResultSet) -> None:
    """stage シーンが指す手を実演ごとに ExileDesk の実画面で撮る (失敗時は図解で代用).

    撮っていない実演が 2 つ以上なら、実演ごとに別のプロセスでブラウザを開いて同時に撮る。
    """
    s = get_settings()
    if not s.stage_capture:
        return
    jobs = []
    for key, res in rs.items():
        steps = sorted(
            {
                ln.scene.step or 0
                for ln in script.lines
                if ln.scene.kind == "stage" and ln.scene.demo == key
            }
        )
        if steps and needs_capture(res.plan, steps):
            jobs.append((key, res.plan, steps, pob_json(res)))
    if not jobs:
        log.info("stage scenes ready", cached="all")
        return
    ensure_vite()  # 同時に起動しないよう、先に 1 回だけ
    if len(jobs) == 1:
        workers = 1
    else:
        workers = min(CAPTURE_WORKERS, len(jobs))
    with ProcessPoolExecutor(workers, mp_context=mp.get_context("spawn")) as ex:
        futures = {ex.submit(_capture_one, *job): job[0] for job in jobs}
        for fut in as_completed(futures):
            try:
                log.info("stage scenes ready", demo=fut.result())
            except Exception as e:  # noqa: BLE001 — 撮影は補助。落ちても動画は作る
                log.warning(
                    "stage capture failed, falling back to drawn panel",
                    demo=futures[fut],
                    error=str(e)[:300],
                )


def capture_view_scenes(script: VideoScript, rs: ResultSet) -> None:
    """段の表・比べる・スポットライト・⑰ の画面と登場の動きを撮っておく (失敗しても動画は作る)."""
    if not get_settings().stage_capture:
        return
    queries = [q for ln in script.lines if (q := view_query(ln.scene, rs)) is not None]
    if not queries:
        return
    try:
        capture_views(queries)
        log.info("view scenes ready", count=len(set(queries)))
    except Exception as e:  # noqa: BLE001 — 撮影は補助。落ちても動画は作る
        log.warning("view capture failed", error=str(e)[:300])
    lines = script.lines
    anims = [
        q
        for i, ln in enumerate(lines)
        if (q := anim_query(ln.scene, lines[i - 1].scene if i else None, rs)) is not None
    ]
    try:  # 登場の動き (&play=1、ExileDesk ⑰)。撮れなければ今まで通りスライドで出す
        capture_anims(anims, fps=get_settings().fps)
        log.info("view anims ready", count=len(set(anims)))
    except Exception as e:  # noqa: BLE001
        log.warning("view anim capture failed", error=str(e)[:300])


def write_chapters(cues: list[Cue], path: Path) -> None:
    """章 (section) の頭の時刻。投稿時の説明文のチャプターに使う (ADR 003)."""
    seen: list[dict[str, object]] = []
    for c in cues:
        if not seen or seen[-1]["title"] != c.section:
            seen.append({"title": c.section, "start": round(c.start, 2)})
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(seen, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


@dataclass(frozen=True)
class Prepared:
    """声・撮影・行の長さ・全体の音まで済んだ状態 (章ごとの動画と合体の両方が使う)."""

    script: VideoScript
    rs: ResultSet
    work: Path
    cues: list[Cue]
    audio: Path
    book: NameBook

    @property
    def n_sections(self) -> int:
        return max(self.script.planned_sections or 0, len(self.script.sections))


def prepare(script_path: Path) -> Prepared:
    s = get_settings()
    script, rs = load_script(script_path)
    work = REPO_ROOT / "output" / "work" / script_path.stem
    vv = VoicevoxClient()
    vv.ensure_engine()
    wavs = [vv.synthesize(ln) for ln in script.lines]
    log.info("voice ready", lines=len(wavs))
    book = NameBook.load()
    capture_stage_scenes(script, rs)  # 手つきの長さを測るので先に撮る
    capture_view_scenes(script, rs)
    lines = [(sec.name, ln) for sec in script.sections for ln in sec.lines]
    hits = plan_hits(lines, rs.plan_of, s.fps)
    secs = [len(smp) / sr for smp, sr in (read_wav(w) for w in wavs)]
    intros = intro_timing([ln.scene for _, ln in lines], rs, s.fps)
    hold, delay = plan_cue_timing(lines, secs, hits, intros)
    cues = build_cues(script.sections, wavs, s.fps, min_seconds=hold, voice_delay=delay)
    write_chapters(cues, work / "chapters.json")
    write_lines(cues, work / "lines.json")  # 行ごとの開始時刻 (check_flicker・check_sync で使う)
    voice = concat_audio(cues, work / "voice.wav")
    events = sound_events(cues, book, script.final_step or len(rs.main.steps), rs)
    audio = mix(voice, work / "audio.wav", s.bgm, events, s.bgm_gain_db, s.se_gain_db)
    log.info("audio mixed", bgm=s.bgm, events=len(events))
    return Prepared(script, rs, work, cues, audio, book)


def build_chapters(script_path: Path, only: list[int] | None = None) -> list[Path]:
    """章ごとの 1080p の動画を作る (作り済みで変わっていない章は使い回す)。確認はこの動画で."""
    p = prepare(script_path)
    return build_all(p.script, p.rs, p.cues, p.audio, p.work, p.book, p.n_sections, only)


def write_lines(cues: list[Cue], path: Path) -> None:
    """行ごとの (開始秒, 長さ, 章, 台詞)。出来た動画のどこがどの行かを後で調べる用."""
    rows = [
        {"start": round(c.start, 3), "duration": round(c.duration, 3), "section": c.section}
        | {"text": c.line.text}
        for c in cues
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def build_video(
    script_path: Path, out: Path | None = None, keep_frames: bool = False
) -> BuildResult:
    """全部の章の動画をそろえて (無い・古い章だけ作る)、つないで音と合わせる."""
    s = get_settings()
    p = prepare(script_path)
    script, rs, cues, audio, book = p.script, p.rs, p.cues, p.audio, p.book
    out = out or REPO_ROOT / "output" / f"{script_path.stem}.mp4"
    out.parent.mkdir(parents=True, exist_ok=True)
    total = sum(c.frames for c in cues)
    if keep_frames:  # 確かめ用に連番 PNG を残す (check_sync で 1 コマずつ見る時)
        short = script.layout == "short"
        write_frames(
            cues, rs, book, p.work / "frames", script.final_step, short, script.short_title
        )
        encode_files(p.work / "frames", audio, s.fps, out, s.nvenc)
    else:  # 章ごとの動画 (2026-10-04) をつなぐだけ。映像は作り直さない
        shutil.rmtree(p.work / "frames", ignore_errors=True)
        segments = build_all(script, rs, cues, audio, p.work, book, p.n_sections)
        concat_with_audio(segments, audio, out)
    log.info("video built", mp4=str(out), frames=total)
    return BuildResult(out, total / s.fps, total)
