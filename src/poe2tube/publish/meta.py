"""台本 + チャンネル設定 + チャプター → 動画 1 本ぶんの投稿情報 (`VideoMeta`)."""

from __future__ import annotations

import json
import re
from pathlib import Path

from poe2tube.config.settings import REPO_ROOT
from poe2tube.publish.models import ChannelProfile, Chapter, VideoMeta
from poe2tube.script.model import VideoScript

MIN_CHAPTER_SECONDS = 10.0  # YouTube のチャプター条件: 各 10 秒以上・3 個以上・先頭 0:00


def chapters_path(name: str, root: Path = REPO_ROOT) -> Path:
    return root / "output" / "work" / name / "chapters.json"


def load_chapters(path: Path) -> list[Chapter]:
    if not path.exists():
        return []
    return [Chapter.model_validate(c) for c in json.loads(path.read_text(encoding="utf-8"))]


def clean_chapters(chapters: list[Chapter]) -> list[Chapter]:
    """10 秒未満の章は前の章にまとめ、先頭を 0:00 にする。3 個未満なら出さない."""
    out: list[Chapter] = []
    for i, c in enumerate(chapters):
        nxt = chapters[i + 1].start if i + 1 < len(chapters) else None
        if out and nxt is not None and nxt - c.start < MIN_CHAPTER_SECONDS:
            continue
        out.append(Chapter(title=c.title, start=0.0) if not out else c)
    return out if len(out) >= 3 else []


def timestamp(sec: float) -> str:
    s = int(sec)
    h, m, s = s // 3600, s % 3600 // 60, s % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def default_summary(title: str) -> str:
    """タイトルの【】を外した物。data/publish で上書きする前提の仮の一文."""
    return re.sub(r"^【[^】]*】\s*", "", title).strip()


def build_description(summary: str, chapters: list[Chapter], profile: ChannelProfile) -> str:
    parts = [summary.strip()]
    ch = clean_chapters(chapters)
    if ch:
        parts.append("▼チャプター\n" + "\n".join(f"{timestamp(c.start)} {c.title}" for c in ch))
    v = profile.video
    if v.credits:
        parts.append("▼クレジット\n" + "\n".join(v.credits))
    if v.disclaimer:
        parts.append(v.disclaimer.strip())
    if v.hashtags:
        parts.append(" ".join(h if h.startswith("#") else f"#{h}" for h in v.hashtags))
    return "\n\n".join(parts)


def build_meta(
    name: str,
    script: VideoScript,
    profile: ChannelProfile,
    summary: str | None = None,
    extra_tags: list[str] | None = None,
    root: Path = REPO_ROOT,
) -> VideoMeta:
    thumb = next(
        (
            f"output/{name}_thumb.{ext}"
            for ext in ("jpg", "png")
            if (root / f"output/{name}_thumb.{ext}").exists()
        ),
        None,
    )
    v = profile.video
    tags = list(dict.fromkeys(v.tags + (extra_tags or [])))
    return VideoMeta(
        video=f"output/{name}.mp4",
        thumbnail=thumb,
        title=script.title,
        description=build_description(
            summary or default_summary(script.title),
            load_chapters(chapters_path(name, root)),
            profile,
        ),
        tags=tags,
        category_id=v.category_id,
        default_language=v.default_language,
        privacy=v.privacy,
        playlist_key=v.playlist_key,
    )
