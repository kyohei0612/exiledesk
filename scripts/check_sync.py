"""出来上がった動画の「映像・字幕・音声」のずれを確かめる (kyohei 2026-09-29「ちょいずれてた」).

    python scripts/check_sync.py data/scripts/<name>.json

- 行ごと: 音声の声の立ち上がり (実際の wav を 20ms 単位で見る) と、行の開始時刻のずれ
- 行ごと: 行の真ん中のコマに写っている画面の種類 (撮影 / クイズ / 会話) と、台本の画面の種類
- 付く瞬間: 効果音の時刻と、撮影の連番で付いたコマが写る時刻のずれ
- 行の頭・真ん中・終わりのコマを並べた一覧画像 output/work/<name>/sync_sheet.png
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import structlog
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poe2tube.audio.voicevox import VoicevoxClient  # noqa: E402
from poe2tube.capture.anim import intro_timing  # noqa: E402
from poe2tube.config.settings import get_settings  # noqa: E402
from poe2tube.names import NameBook  # noqa: E402
from poe2tube.render.palette import font  # noqa: E402
from poe2tube.video.animate import sound_events  # noqa: E402
from poe2tube.video.build import load_script  # noqa: E402
from poe2tube.video.clip_timing import plan_cue_timing, plan_hits  # noqa: E402
from poe2tube.video.timeline import build_cues, read_wav  # noqa: E402

log = structlog.get_logger()


def voice_onsets(path: Path, starts: list[float], sr_hop: float = 0.02) -> list[float]:
    """連結した声の wav で、各行の開始時刻から 1 秒以内に声が立ち上がる時刻."""
    samples, sr = read_wav(path)
    hop = int(sr * sr_hop)
    rms = np.array(
        [float(np.sqrt(np.mean(samples[i : i + hop] ** 2))) for i in range(0, len(samples), hop)]
    )
    thr = max(1e-4, float(np.percentile(rms, 90)) * 0.08)
    out = []
    for st in starts:
        k0 = int(st / sr_hop)
        k = next((k for k in range(k0, min(len(rms), k0 + 50)) if rms[k] > thr), k0)
        out.append(k * sr_hop)
    return out


def main(script_path: Path) -> None:
    s = get_settings()
    sc, rs = load_script(script_path)
    work = ROOT / "output" / "work" / script_path.stem
    vv = VoicevoxClient()
    wavs = [vv.cache_path(ln) for ln in sc.lines]
    lines = [(sec.name, ln) for sec in sc.sections for ln in sec.lines]
    hits = plan_hits(lines, rs.plan_of, s.fps)
    secs = [len(smp) / sr for smp, sr in (read_wav(w) for w in wavs)]
    intros = intro_timing([ln.scene for _, ln in lines], rs, s.fps)
    hold, delay = plan_cue_timing(lines, secs, hits, intros)
    cues = build_cues(sc.sections, wavs, s.fps, min_seconds=hold, voice_delay=delay)
    onsets = voice_onsets(work / "voice.wav", [c.start + c.voice_delay for c in cues])
    frames = work / "frames"
    ev = sound_events(cues, NameBook.load(), sc.final_step or len(rs.main.steps), rs)
    worst = 0.0
    rows = []
    for i, c in enumerate(cues):
        lag = onsets[i] - (c.start + c.voice_delay)
        worst = max(worst, abs(lag))
        hit = hits.get(i)
        hit_se = [e.at for e in ev if e.kind.startswith("hit_") and c.start <= e.at < c.end]
        land = c.start + (hit.land_at if hit else 0)
        note = ""
        if hit:
            d = (hit_se[0] - land) if hit_se else float("nan")
            note = f" 付く {land:6.2f}s / 効果音 {hit_se[0] if hit_se else '-'} (差 {d:+.2f}s)"
        rows.append((i, c))
        lead = f" 画面を先に {c.voice_delay:.1f}s" if c.voice_delay else ""
        print(
            f"{i + 1:3d} {c.start:6.2f}s〜{c.end:6.2f}s 声の立ち上がり {lag:+.2f}s{lead} "
            f"画面={c.line.scene.kind:<7} {c.line.text[:22]}{note}"
        )
    print(f"声のずれの最大 {worst:.2f}s (0.30s 未満なら OK)")
    # 行の頭・真ん中・終わりのコマの一覧
    tw, th = 384, 216
    sheet = Image.new("RGB", (tw * 3 + 360, (th + 6) * len(rows)), "white")
    d = ImageDraw.Draw(sheet)
    for r, (i, c) in enumerate(rows):
        a = int(c.start * s.fps) + 2
        b = int((c.start + c.end) / 2 * s.fps)
        z = int(c.end * s.fps) - 2
        y = r * (th + 6)
        d.text((6, y + 6), f"{i + 1} {c.line.scene.kind}", fill="black", font=font(22))
        d.text((6, y + 40), c.line.text[:14], fill="black", font=font(18))
        d.text((6, y + 66), c.line.text[14:28], fill="black", font=font(18))
        for k, f in enumerate((a, b, z)):
            p = frames / f"f{f:05d}.png"
            if p.exists():
                sheet.paste(Image.open(p).convert("RGB").resize((tw, th)), (360 + k * tw, y))
    out = work / "sync_sheet.png"
    sheet.save(out)
    log.info("sync sheet", path=str(out))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
