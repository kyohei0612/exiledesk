from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from poe2tube.config.settings import REPO_ROOT
from poe2tube.publish.channel import apply_profile, branding_body, ensure_playlists, load_profile
from poe2tube.publish.envfile import read_env, set_env
from poe2tube.publish.meta import build_description, build_meta, clean_chapters, timestamp
from poe2tube.publish.models import ChannelProfile, Chapter, VideoMeta
from poe2tube.publish.youtube import (
    WrongChannelError,
    publish_lock,
    upload_video,
    verify_channel,
    video_body,
)
from poe2tube.script.model import VideoScript

PROFILE = REPO_ROOT / "data" / "channel" / "chocobanana.json"


class _Req:
    def __init__(
        self,
        result: dict[str, Any],
        log: list[tuple[str, dict[str, Any]]],
        name: str,
        kw: dict[str, Any],
    ) -> None:
        self.result, self.log, self.name, self.kw = result, log, name, kw

    def execute(self) -> dict[str, Any]:
        self.log.append((self.name, self.kw))
        return self.result


class _Endpoint:
    def __init__(self, fake: FakeYouTube, name: str) -> None:
        self.fake, self.name = fake, name

    def __getattr__(self, method: str) -> Any:
        def call(**kw: Any) -> _Req:
            key = f"{self.name}.{method}"
            return _Req(self.fake.results.get(key, {}), self.fake.calls, key, kw)

        return call


class FakeYouTube:
    def __init__(
        self, title: str = "チョコバナナch", playlists: dict[str, str] | None = None
    ) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        items = [{"id": v, "snippet": {"title": k}} for k, v in (playlists or {}).items()]
        self.results: dict[str, dict[str, Any]] = {
            "channels.list": {
                "items": [
                    {
                        "id": "UC_choco",
                        "snippet": {"title": title},
                        "brandingSettings": {
                            "channel": {"title": title, "unsubscribedTrailer": "x"}
                        },
                    }
                ]
            },
            "playlists.list": {"items": items},
            "playlists.insert": {"id": "PL_new"},
            "channelBanners.insert": {"url": "https://banner"},
        }

    def __getattr__(self, name: str) -> Any:
        return lambda: _Endpoint(self, name)

    def names(self) -> list[str]:
        return [n for n, _ in self.calls]


def test_profile_file_is_valid() -> None:
    p = load_profile(PROFILE)
    assert p.expected_title == "チョコバナナch"
    assert "VOICEVOX:ずんだもん" in p.video.credits and "VOICEVOX:四国めたん" in p.video.credits
    assert p.video.privacy == "private"
    assert '"Path of Exile 2"' in p.keywords_str()


def test_verify_channel_blocks_wrong_channel() -> None:
    with pytest.raises(WrongChannelError):
        verify_channel(FakeYouTube(title="中学生でも分かる1分ニュース"), "チョコバナナch")
    assert verify_channel(FakeYouTube(), "チョコバナナch")["id"] == "UC_choco"


def test_apply_profile_dry_run_writes_nothing() -> None:
    fake = FakeYouTube()
    actions = apply_profile(fake, load_profile(PROFILE), execute=False)
    assert "channels.update" not in fake.names() and "playlists.insert" not in fake.names()
    texts = [str(a) for a in actions]
    assert any("再生リストを作る" in t for t in texts) and any("アイコン" in t for t in texts)


def test_apply_profile_execute_updates_branding_and_playlist(tmp_path: Path) -> None:
    banner = tmp_path / "b.png"
    banner.write_bytes(b"x")
    prof = load_profile(PROFILE).model_copy(update={"banner": "b.png"})
    fake = FakeYouTube()
    import googleapiclient.http as gh  # type: ignore[import-untyped]

    orig = gh.MediaFileUpload
    gh.MediaFileUpload = lambda *a, **k: "media"
    try:
        apply_profile(fake, prof, execute=True, root=tmp_path)
    finally:
        gh.MediaFileUpload = orig
    upd = dict(fake.calls)["channels.update"]["body"]["brandingSettings"]
    assert upd["channel"]["description"].startswith("PoE2")
    assert upd["channel"]["unsubscribedTrailer"] == "x"  # 既存の項目を消さない
    assert upd["image"]["bannerExternalUrl"] == "https://banner"
    assert "playlists.insert" in fake.names()


def test_wrong_channel_stops_before_any_write() -> None:
    fake = FakeYouTube(title="別チャンネル")
    with pytest.raises(WrongChannelError):
        apply_profile(fake, load_profile(PROFILE), execute=True)
    assert fake.names() == ["channels.list"]


def test_ensure_playlists_reuses_existing() -> None:
    prof = load_profile(PROFILE)
    fake = FakeYouTube(playlists={prof.playlists[0].title: "PL_have"})
    actions, ids = ensure_playlists(fake, prof, execute=True)
    assert actions == [] and ids == {"basics": "PL_have"}


def test_branding_body_keeps_other_fields() -> None:
    ch = {"id": "U", "brandingSettings": {"channel": {"x": 1}, "watch": {"y": 2}}}
    body = branding_body(ch, ChannelProfile(expected_title="t", description="d"), None)
    assert body["brandingSettings"]["watch"] == {"y": 2}
    assert body["brandingSettings"]["channel"]["x"] == 1


def test_chapters_and_description() -> None:
    raw = [
        Chapter(title="導入", start=0.8),
        Chapter(title="短い", start=30),
        Chapter(title="仕組み", start=35),
        Chapter(title="まとめ", start=500),
    ]
    ch = clean_chapters(raw)
    assert [c.title for c in ch] == ["導入", "仕組み", "まとめ"] and ch[0].start == 0
    assert timestamp(65) == "1:05" and timestamp(3725) == "1:02:05"
    prof = load_profile(PROFILE)
    desc = build_description("要約", raw, prof)
    assert "0:00 導入" in desc and "VOICEVOX:四国めたん" in desc and desc.endswith("#ずんだもん")
    assert clean_chapters(raw[:2]) == []  # 3 個未満は出さない


def test_build_meta_from_script(tmp_path: Path) -> None:
    script = VideoScript.model_validate(
        json.loads(
            (REPO_ROOT / "data" / "scripts" / "act_craft_8min.json").read_text(encoding="utf-8")
        )
    )
    work = tmp_path / "output" / "work" / "act_craft_8min"
    work.mkdir(parents=True)
    (work / "chapters.json").write_text(
        json.dumps([{"title": s.name, "start": i * 60.0} for i, s in enumerate(script.sections)]),
        encoding="utf-8",
    )
    (tmp_path / "output" / "act_craft_8min_thumb.jpg").write_bytes(b"x")
    meta = build_meta("act_craft_8min", script, load_profile(PROFILE), root=tmp_path)
    assert meta.title == script.title and meta.thumbnail == "output/act_craft_8min_thumb.jpg"
    assert "▼チャプター" in meta.description and meta.privacy == "private"
    assert meta.playlist_key == "basics"


def test_video_body_schedules_as_private() -> None:
    m = VideoMeta(
        video="v.mp4",
        title="t",
        description="d",
        privacy="public",
        publish_at="2026-10-01T19:00:00+09:00",
    )
    st = video_body(m)["status"]
    assert st["privacyStatus"] == "private" and st["publishAt"].startswith("2026-10-01")
    assert st["selfDeclaredMadeForKids"] is False


def test_upload_dry_run_and_missing_file(tmp_path: Path) -> None:
    (tmp_path / "v.mp4").write_bytes(b"x")
    m = VideoMeta(video="v.mp4", title="t", description="d")
    actions, vid = upload_video(FakeYouTube(), m, "PL", execute=False, root=tmp_path)
    assert vid is None and len(actions) == 2
    with pytest.raises(FileNotFoundError):
        upload_video(FakeYouTube(), m.model_copy(update={"video": "none.mp4"}), None, root=tmp_path)


def test_tags_limit() -> None:
    with pytest.raises(ValueError):
        VideoMeta(video="v", title="t", description="d", tags=["あ" * 100] * 6)


def test_publish_lock_blocks_second(tmp_path: Path) -> None:
    lock = tmp_path / "l"
    with publish_lock(lock):
        with pytest.raises(RuntimeError):
            with publish_lock(lock):
                pass
    assert not lock.exists()


def test_envfile_roundtrip(tmp_path: Path) -> None:
    env = tmp_path / ".env"
    env.write_text("# c\nA=1\n", encoding="utf-8")
    set_env(env, "A", "2")
    set_env(env, "B", "x=y")
    assert read_env(env) == {"A": "2", "B": "x=y"}
    assert env.read_text(encoding="utf-8").startswith("# c\n")


def test_thumbnail_403_does_not_stop_playlist(tmp_path: Path) -> None:
    import httplib2  # type: ignore[import-untyped]
    from googleapiclient.errors import HttpError  # type: ignore[import-untyped]

    (tmp_path / "v.mp4").write_bytes(b"x")
    (tmp_path / "t.jpg").write_bytes(b"x")
    fake = FakeYouTube()

    class _Thumb:
        def set(self, **kw: Any) -> Any:
            class _R:
                def execute(self) -> None:
                    raise HttpError(httplib2.Response({"status": 403}), b"forbidden")

            return _R()

    fake.thumbnails = lambda: _Thumb()  # type: ignore[method-assign]
    m = VideoMeta(video="v.mp4", thumbnail="t.jpg", title="t", description="d")
    actions, vid = upload_video(fake, m, "PL", execute=True, root=tmp_path, video_id="VID")
    assert vid == "VID" and "videos.insert" not in fake.names()
    assert "playlistItems.insert" in fake.names()
    assert any("サムネ未設定" in str(a) for a in actions)
