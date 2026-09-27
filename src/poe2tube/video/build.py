"""台本 JSON → mp4 の 1 本道 (1 分テスト用の最小構成、BGM / 字幕焼き込みは後段で追加)."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import structlog

from poe2tube.audio.mix import mix
from poe2tube.audio.voicevox import VoicevoxClient
from poe2tube.capture.stage import capture_plan
from poe2tube.config.settings import REPO_ROOT, get_settings
from poe2tube.contracts.craft_stage import CraftStageResult
from poe2tube.names import NameBook
from poe2tube.script.model import VideoScript
from poe2tube.video.animate import sound_events, write_frames
from poe2tube.video.timeline import build_cues, concat_audio

log = structlog.get_logger()
CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


@dataclass(frozen=True)
class BuildResult:
    mp4: Path
    seconds: float
    frames: int


def load_script(path: Path) -> tuple[VideoScript, CraftStageResult]:
    script = VideoScript.model_validate(json.loads(path.read_text(encoding="utf-8")))
    result_path = REPO_ROOT / script.result_file
    result = CraftStageResult.model_validate(json.loads(result_path.read_text(encoding="utf-8")))
    problems = script.check_against(result)
    if problems:
        raise ValueError("台本と結果 JSON が噛み合わない: " + "; ".join(problems))
    return script, result


def ffmpeg_path() -> str:
    exe = shutil.which("ffmpeg")
    if not exe:
        raise FileNotFoundError("ffmpeg が PATH に無い")
    return exe


def encode(frames_dir: Path, audio: Path, fps: int, out: Path, nvenc: bool = False) -> None:
    vcodec = ["-c:v", "h264_nvenc", "-cq", "23"] if nvenc else ["-c:v", "libx264", "-crf", "20"]
    cmd = [
        ffmpeg_path(),
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-framerate",
        str(fps),
        "-i",
        str(frames_dir / "f%05d.png"),
        "-i",
        str(audio),
        *vcodec,
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-shortest",
        str(out),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, creationflags=CREATE_NO_WINDOW)
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg 失敗 rc={r.returncode}: {r.stderr[-800:]}")


def capture_stage_scenes(script: VideoScript, result: CraftStageResult) -> None:
    """台本の stage シーンが指す手を ExileDesk の実画面で撮っておく (失敗時は図解で代用)."""
    s = get_settings()
    steps = sorted({ln.scene.step or 0 for ln in script.lines if ln.scene.kind == "stage"})
    if not steps or not s.stage_capture:
        return
    try:
        paths = capture_plan(result.plan, steps)
        log.info("stage scenes ready", steps=steps, cached=len(paths))
    except Exception as e:  # noqa: BLE001 — 撮影は補助。落ちても動画は作る
        log.warning("stage capture failed, falling back to drawn panel", error=str(e)[:300])


def build_video(
    script_path: Path, out: Path | None = None, keep_frames: bool = False
) -> BuildResult:
    s = get_settings()
    script, result = load_script(script_path)
    work = REPO_ROOT / "output" / "work" / script_path.stem
    out = out or REPO_ROOT / "output" / f"{script_path.stem}.mp4"

    vv = VoicevoxClient()
    vv.ensure_engine()
    wavs = [vv.synthesize(ln) for ln in script.lines]
    log.info("voice ready", lines=len(wavs))

    book = NameBook.load()
    cues = build_cues(script.sections, wavs, s.fps)
    voice = concat_audio(cues, work / "voice.wav")
    events = sound_events(cues, book, script.final_step or len(result.steps))
    audio = mix(voice, work / "audio.wav", s.bgm, events, s.bgm_gain_db, s.se_gain_db)
    log.info("audio mixed", bgm=s.bgm, events=len(events))
    capture_stage_scenes(script, result)
    frames = write_frames(cues, result, book, work / "frames", script.final_step)
    log.info("frames ready", frames=frames, seconds=round(frames / s.fps, 1))

    out.parent.mkdir(parents=True, exist_ok=True)
    encode(work / "frames", audio, s.fps, out, nvenc=os.environ.get("POE2TUBE_NVENC") == "1")
    if not keep_frames:
        shutil.rmtree(work / "frames", ignore_errors=True)
    log.info("video built", mp4=str(out))
    return BuildResult(out, frames / s.fps, frames)
