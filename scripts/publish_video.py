"""動画 1 本を チョコバナナ に上げる (既定は非公開).

    python scripts/publish_video.py act_craft_8min                 # 投稿情報を作って表示 (dry-run)
    python scripts/publish_video.py act_craft_8min --execute       # 非公開で上げる
    python scripts/publish_video.py act_craft_8min --publish-at 2026-10-01T19:00:00+09:00 --execute

初回は data/publish/<name>.json (タイトル・説明文・タグ) を台本から作って保存する。
中身を直したい時はそのファイルを編集してから再実行する (--rebuild で作り直し)。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import structlog

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poe2tube.config.settings import get_settings  # noqa: E402
from poe2tube.publish.channel import ensure_playlists, load_profile  # noqa: E402
from poe2tube.publish.meta import build_meta  # noqa: E402
from poe2tube.publish.models import VideoMeta  # noqa: E402
from poe2tube.publish.youtube import (  # noqa: E402
    build_service,
    publish_lock,
    upload_video,
    verify_channel,
)
from poe2tube.script.model import VideoScript  # noqa: E402

log = structlog.get_logger()


def load_or_build_meta(name: str, summary: str | None, rebuild: bool) -> VideoMeta:
    path = ROOT / "data" / "publish" / f"{name}.json"
    if path.exists() and not rebuild:
        return VideoMeta.model_validate(json.loads(path.read_text(encoding="utf-8")))
    script_path = ROOT / "data" / "scripts" / f"{name}.json"
    script = VideoScript.model_validate(json.loads(script_path.read_text(encoding="utf-8")))
    meta = build_meta(name, script, load_profile(get_settings().channel_profile), summary)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(meta.model_dump_json(indent=2) + "\n", encoding="utf-8")
    log.info("publish meta written (edit it if needed)", path=str(path))
    return meta


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("name", help="data/scripts/<name>.json の name")
    ap.add_argument("--summary", default=None, help="説明文の 1 段落目 (初回作成時)")
    ap.add_argument("--rebuild", action="store_true", help="data/publish/<name>.json を作り直す")
    ap.add_argument("--publish-at", default=None, help="予約公開 ISO 8601 (+09:00)")
    ap.add_argument("--execute", action="store_true", help="付けた時だけ YouTube に上げる")
    a = ap.parse_args()

    meta = load_or_build_meta(a.name, a.summary, a.rebuild)
    if a.publish_at:
        meta = meta.model_copy(update={"publish_at": a.publish_at})
    log.info("title", title=meta.title)
    log.info("description", text=meta.description)

    profile = load_profile(get_settings().channel_profile)
    service = build_service()
    with publish_lock():
        verify_channel(service, profile.expected_title)
        pl_actions, ids = ensure_playlists(service, profile, a.execute)
        playlist_id = ids.get(meta.playlist_key or "")
        actions, video_id = upload_video(service, meta, playlist_id, execute=a.execute, root=ROOT)
    for act in pl_actions + actions:
        log.info("done" if a.execute else "plan", action=str(act))
    if video_id:
        log.info("uploaded", url=f"https://youtu.be/{video_id}")
    elif not a.execute:
        log.info("dry-run でした。上げるなら --execute を付けて実行")


if __name__ == "__main__":
    main()
