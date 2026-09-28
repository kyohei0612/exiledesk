"""チョコバナナのチャンネルに接続する (1 回だけ。ADR 003).

    python scripts/youtube_auth.py

1. OAuth クライアント (ニュースと同じ物) が POE2Tube/.env に無ければ youtube-pipeline/.env から写す
2. ブラウザが開くので、Google アカウントを選んだ後に **「チョコバナナ」チャンネル** を選ぶ
3. 接続先のチャンネル名が「チョコバナナ」の時だけ refresh token を POE2Tube/.env に保存する
"""

from __future__ import annotations

import sys
from pathlib import Path

import structlog

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from poe2tube.config.settings import get_settings  # noqa: E402
from poe2tube.publish.channel import load_profile  # noqa: E402
from poe2tube.publish.envfile import read_env, set_env  # noqa: E402
from poe2tube.publish.youtube import SCOPES, WrongChannelError, verify_channel  # noqa: E402

log = structlog.get_logger()
ENV = ROOT / ".env"


def ensure_client() -> tuple[str, str]:
    mine = read_env(ENV)
    cid, secret = mine.get("POE2TUBE_YOUTUBE_CLIENT_ID"), mine.get("POE2TUBE_YOUTUBE_CLIENT_SECRET")
    if cid and secret:
        return cid, secret
    news = read_env(get_settings().youtube_pipeline_root / ".env")
    cid, secret = news.get("YOUTUBE_CLIENT_ID"), news.get("YOUTUBE_CLIENT_SECRET")
    if not (cid and secret):
        raise SystemExit(
            "OAuth クライアントが見つからない (youtube-pipeline/.env の YOUTUBE_CLIENT_ID/SECRET)"
        )
    set_env(ENV, "POE2TUBE_YOUTUBE_CLIENT_ID", cid)
    set_env(ENV, "POE2TUBE_YOUTUBE_CLIENT_SECRET", secret)
    log.info("oauth client copied from youtube-pipeline/.env")
    return cid, secret


def main() -> None:
    from google_auth_oauthlib.flow import InstalledAppFlow  # type: ignore[import-untyped]
    from googleapiclient.discovery import build  # type: ignore[import-untyped]

    cid, secret = ensure_client()
    flow = InstalledAppFlow.from_client_config(
        {
            "installed": {
                "client_id": cid,
                "client_secret": secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": ["http://localhost"],
            }
        },
        SCOPES,
    )
    log.info("ブラウザで Google アカウント → 「チョコバナナ」チャンネルを選んでください")
    creds = flow.run_local_server(port=8080, prompt="consent select_account")
    service = build("youtube", "v3", credentials=creds, cache_discovery=False)
    profile = load_profile(get_settings().channel_profile)
    try:
        verify_channel(service, profile.expected_title)
    except WrongChannelError as e:
        log.error("token not saved", reason=str(e))
        raise SystemExit(
            "接続先が違うので保存しなかった。もう一度実行して「チョコバナナ」を選ぶ"
        ) from e
    set_env(ENV, "POE2TUBE_YOUTUBE_REFRESH_TOKEN", creds.refresh_token)
    log.info("connected", channel=profile.expected_title, saved_to=str(ENV))


if __name__ == "__main__":
    main()
