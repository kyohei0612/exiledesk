"""チャンネル設定と動画 1 本ぶんの投稿情報 (ADR 003)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Privacy = Literal["private", "unlisted", "public"]


class PlaylistSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(description="台本側から指す短い名前")
    title: str = Field(max_length=150)
    description: str = ""
    privacy: Privacy = "public"


class Source(BaseModel):
    """台本の解説で参考にした記事・サイト。説明欄の「▼参考」に出す (kyohei 2026-09-29)."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, description="サイト名・記事名 (例 Maxroll「防御ガイド」)")
    url: str = Field(pattern=r"^https?://", description="出典の URL")


class VideoDefaults(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category_id: str = Field(default="20", description="20 = ゲーム")
    default_language: str = "ja"
    tags: list[str] = Field(default_factory=list)
    credits: list[str] = Field(default_factory=list, description="説明文の末尾に入れる")
    disclaimer: str = ""
    hashtags: list[str] = Field(default_factory=list, description="説明文の最後の行 (#付き)")
    privacy: Privacy = "private"
    playlist_key: str | None = None


class ChannelProfile(BaseModel):
    """`data/channel/<name>.json`。apply_channel がこの内容をチャンネルに反映する."""

    model_config = ConfigDict(extra="forbid")

    expected_title: str = Field(description="接続先のチャンネル名。違えば何もしない (事故防止)")
    description: str = Field(max_length=1000)
    keywords: list[str] = Field(default_factory=list)
    country: str = "JP"
    default_language: str = "ja"
    banner: str | None = Field(default=None, description="リポジトリからの相対パス (2560x1440)")
    icon: str | None = Field(default=None, description="手で設定する用 (API では変えられない)")
    playlists: list[PlaylistSpec] = Field(default_factory=list)
    video: VideoDefaults = Field(default_factory=VideoDefaults)

    def keywords_str(self) -> str:
        """brandingSettings.channel.keywords は空白区切り (空白を含む語は "" で囲む)."""
        return " ".join(f'"{k}"' if " " in k else k for k in self.keywords)


class Chapter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    start: float = Field(ge=0)


class VideoMeta(BaseModel):
    """`data/publish/<name>.json`。publish_video がこれを見て上げる."""

    model_config = ConfigDict(extra="forbid")

    video: str = Field(description="mp4 のパス (リポジトリ相対)")
    thumbnail: str | None = None
    title: str = Field(max_length=100)
    description: str = Field(max_length=5000)
    tags: list[str] = Field(default_factory=list)
    category_id: str = "20"
    default_language: str = "ja"
    privacy: Privacy = "private"
    publish_at: str | None = Field(
        default=None, description="ISO 8601 (+09:00)。指定時は private で上げて時刻に公開"
    )
    playlist_key: str | None = None

    @field_validator("tags")
    @classmethod
    def _tags_fit(cls, v: list[str]) -> list[str]:
        # YouTube のタグは合計 500 字 (空白を含む語は "" 込み) まで
        total = sum(len(t) + (2 if " " in t else 0) for t in v) + max(0, len(v) - 1)
        if total > 500:
            raise ValueError(f"タグが長すぎる ({total} 字 > 500)")
        return v
