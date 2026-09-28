"""`ChannelProfile` をチャンネルに反映する (説明・キーワード・国・言語・バナー・再生リスト).

アイコンとチャンネル名は API で変えられないので、手順だけ返す (ADR 003)。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import structlog

from poe2tube.config.settings import REPO_ROOT
from poe2tube.publish.models import ChannelProfile
from poe2tube.publish.youtube import Action, verify_channel

log = structlog.get_logger()


def load_profile(path: Path) -> ChannelProfile:
    return ChannelProfile.model_validate(json.loads(path.read_text(encoding="utf-8")))


def branding_body(
    ch: dict[str, Any], profile: ChannelProfile, banner_url: str | None
) -> dict[str, Any]:
    """今の brandingSettings に上書きする形で作る (送らなかった項目が消えないように)."""
    current = ch.get("brandingSettings", {})
    channel = {
        **current.get("channel", {}),
        "description": profile.description,
        "keywords": profile.keywords_str(),
        "country": profile.country,
        "defaultLanguage": profile.default_language,
    }
    body: dict[str, Any] = {"id": ch["id"], "brandingSettings": {**current, "channel": channel}}
    if banner_url:
        body["brandingSettings"]["image"] = {"bannerExternalUrl": banner_url}
    return body


def existing_playlists(service: Any) -> dict[str, str]:
    """自分の再生リスト {タイトル: id}."""
    out: dict[str, str] = {}
    token: str | None = None
    while True:
        res = (
            service.playlists()
            .list(part="snippet", mine=True, maxResults=50, pageToken=token)
            .execute()
        )
        for it in res.get("items", []):
            out[it["snippet"]["title"]] = it["id"]
        token = res.get("nextPageToken")
        if not token:
            return out


def ensure_playlists(
    service: Any, profile: ChannelProfile, execute: bool
) -> tuple[list[Action], dict[str, str]]:
    """無い再生リストだけ作る。戻り値の dict は {key: playlist_id} (dry-run では作る物は空)."""
    have = existing_playlists(service)
    actions: list[Action] = []
    ids: dict[str, str] = {}
    for p in profile.playlists:
        if p.title in have:
            ids[p.key] = have[p.title]
            continue
        actions.append(Action("再生リストを作る", p.title))
        if execute:
            res = (
                service.playlists()
                .insert(
                    part="snippet,status",
                    body={
                        "snippet": {"title": p.title, "description": p.description},
                        "status": {"privacyStatus": p.privacy},
                    },
                )
                .execute()
            )
            ids[p.key] = str(res["id"])
    return actions, ids


def apply_profile(
    service: Any, profile: ChannelProfile, execute: bool = False, root: Path = REPO_ROOT
) -> list[Action]:
    ch = verify_channel(service, profile.expected_title)
    actions = [
        Action("説明文を書く", f"{len(profile.description)} 字"),
        Action("キーワード", profile.keywords_str()),
        Action("国 / 言語", f"{profile.country} / {profile.default_language}"),
    ]
    banner_url: str | None = None
    if profile.banner:
        banner = root / profile.banner
        if not banner.exists():
            raise FileNotFoundError(f"バナーが無い: {banner} (python scripts/make_banner.py)")
        actions.append(Action("バナーを上げる", banner.name))
        if execute:
            from googleapiclient.http import MediaFileUpload  # type: ignore[import-untyped]

            res = service.channelBanners().insert(media_body=MediaFileUpload(str(banner))).execute()
            banner_url = str(res["url"])
    if execute:
        service.channels().update(
            part="brandingSettings", body=branding_body(ch, profile, banner_url)
        ).execute()
        log.info("channel branding updated", channel_id=ch["id"])
    pl_actions, _ = ensure_playlists(service, profile, execute)
    actions += pl_actions
    if profile.icon:
        actions.append(
            Action("【手で】アイコンを設定", f"YouTube Studio → カスタマイズ → {profile.icon}")
        )
    return actions
