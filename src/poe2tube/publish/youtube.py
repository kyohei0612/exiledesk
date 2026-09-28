"""YouTube Data API の接続・接続先チャンネルの確認・動画の投稿 (ADR 003).

`service` は googleapiclient の Resource。テストでは同じ形の偽物を渡す。
書き込む関数は全部 `execute=False` (dry-run) が既定で、やる事を `Action` の一覧で返す。
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import structlog

from poe2tube.config.settings import REPO_ROOT, get_settings
from poe2tube.publish.models import VideoMeta

log = structlog.get_logger()

SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube",
]
LOCK_PATH = REPO_ROOT / "output" / ".youtube_publish.lock"


class WrongChannelError(RuntimeError):
    """接続先が想定のチャンネルではない (ニュースのチャンネルに書き込む事故を止める)."""


@dataclass(frozen=True)
class Action:
    what: str
    detail: str = ""

    def __str__(self) -> str:
        return f"{self.what}: {self.detail}" if self.detail else self.what


def build_service() -> Any:
    """POE2Tube 専用の refresh token で YouTube API に繋ぐ."""
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build  # type: ignore[import-untyped]

    s = get_settings()
    if not (s.youtube_client_id and s.youtube_client_secret and s.youtube_refresh_token):
        raise RuntimeError(
            "POE2TUBE_YOUTUBE_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN が .env に無い。"
            " python scripts/youtube_auth.py で接続する"
        )
    creds = Credentials(  # type: ignore[no-untyped-call]
        token=None,
        refresh_token=s.youtube_refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=s.youtube_client_id,
        client_secret=s.youtube_client_secret,
        scopes=SCOPES,
    )
    return build("youtube", "v3", credentials=creds, cache_discovery=False)


def my_channel(service: Any) -> dict[str, Any]:
    res = service.channels().list(part="snippet,brandingSettings", mine=True).execute()
    items = res.get("items") or []
    if not items:
        raise WrongChannelError(
            "この認証にチャンネルが無い (YouTube でチャンネルを作ってから接続する)"
        )
    return dict(items[0])


def verify_channel(service: Any, expected_title: str) -> dict[str, Any]:
    """接続先のチャンネル名が expected_title と一致しなければ WrongChannelError."""
    ch = my_channel(service)
    title = ch.get("snippet", {}).get("title", "")
    if title != expected_title:
        raise WrongChannelError(
            f"接続先は「{title}」で、想定の「{expected_title}」ではない。何もしないで止める"
        )
    log.info("youtube channel verified", title=title, channel_id=ch.get("id"))
    return ch


@contextmanager
def publish_lock(path: Path = LOCK_PATH) -> Iterator[None]:
    """同時に 2 つ投稿しない (二重アップロード防止)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError as e:
        raise RuntimeError(f"別の投稿が動いている (ロック {path})。止まっていれば消す") from e
    try:
        os.write(fd, str(os.getpid()).encode())
        yield
    finally:
        os.close(fd)
        path.unlink(missing_ok=True)


def video_body(meta: VideoMeta) -> dict[str, Any]:
    status: dict[str, Any] = {"privacyStatus": meta.privacy, "selfDeclaredMadeForKids": False}
    if meta.publish_at:
        status = {**status, "privacyStatus": "private", "publishAt": meta.publish_at}
    return {
        "snippet": {
            "title": meta.title,
            "description": meta.description,
            "tags": meta.tags,
            "categoryId": meta.category_id,
            "defaultLanguage": meta.default_language,
            "defaultAudioLanguage": meta.default_language,
        },
        "status": status,
    }


def upload_video(
    service: Any,
    meta: VideoMeta,
    playlist_id: str | None = None,
    execute: bool = False,
    root: Path = REPO_ROOT,
) -> tuple[list[Action], str | None]:
    """動画 → サムネ → 再生リストの順に上げる。戻り値は (やった/やる事, video_id)."""
    video = root / meta.video
    if not video.exists():
        raise FileNotFoundError(f"動画が無い: {video}")
    thumb = root / meta.thumbnail if meta.thumbnail else None
    if thumb is not None and not thumb.exists():
        raise FileNotFoundError(f"サムネが無い: {thumb}")
    when = f"予約 {meta.publish_at}" if meta.publish_at else meta.privacy
    actions = [Action("動画を上げる", f"{meta.title} ({video.name}, {when})")]
    if thumb is not None:
        actions.append(Action("サムネを付ける", thumb.name))
    if playlist_id:
        actions.append(Action("再生リストに入れる", playlist_id))
    if not execute:
        return actions, None

    from googleapiclient.http import MediaFileUpload  # type: ignore[import-untyped]

    media = MediaFileUpload(str(video), chunksize=8 * 1024 * 1024, resumable=True)
    req = service.videos().insert(part="snippet,status", body=video_body(meta), media_body=media)
    res = None
    while res is None:
        status, res = req.next_chunk()
        if status is not None:
            log.info("uploading", progress=round(status.progress() * 100))
    video_id = str(res["id"])
    log.info("video uploaded", video_id=video_id)
    if thumb is not None:
        service.thumbnails().set(videoId=video_id, media_body=MediaFileUpload(str(thumb))).execute()
    if playlist_id:
        service.playlistItems().insert(
            part="snippet",
            body={
                "snippet": {
                    "playlistId": playlist_id,
                    "resourceId": {"kind": "youtube#video", "videoId": video_id},
                }
            },
        ).execute()
    return actions, video_id
