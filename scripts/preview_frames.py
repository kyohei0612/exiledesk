"""台本の全行を 1 枚ずつ静止画にして output/preview/ に出す (台本チェック用).

python scripts/preview_frames.py data/scripts/test_1min_craft_intro.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import structlog

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poe2tube.names import NameBook  # noqa: E402
from poe2tube.render.frame import render_frame  # noqa: E402
from poe2tube.script.model import VideoScript  # noqa: E402
from poe2tube.video.results import load_results  # noqa: E402

log = structlog.get_logger()


def main(script_path: Path) -> None:
    script = VideoScript.model_validate(json.loads(script_path.read_text(encoding="utf-8")))
    rs = load_results(script, ROOT)
    problems = script.check_against(rs.main, rs.demos)
    if problems:
        raise SystemExit("台本と結果 JSON が噛み合わない: " + "; ".join(problems))
    book = NameBook.load()
    out = ROOT / "output" / "preview" / script_path.stem
    out.mkdir(parents=True, exist_ok=True)
    total = len(script.lines)
    i = 0
    for section in script.sections:
        for line in section.lines:
            i += 1
            props = [f.key for f in book.find_in_text(line.text)]
            img = render_frame(
                line, rs.of(line.scene), section.name, i / total, mouth=0, props=props
            )
            path = out / f"{i:02d}_{line.scene.kind}.png"
            img.convert("RGB").save(path)
            log.info("frame", n=i, scene=line.scene.kind, props=props, path=path.name)


if __name__ == "__main__":
    main(
        Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data/scripts/test_1min_craft_intro.json"
    )
