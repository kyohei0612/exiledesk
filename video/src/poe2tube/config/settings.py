"""POE2Tube の設定。環境変数 / .env (POE2TUBE_ 接頭辞) で上書きできる."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="POE2TUBE_", env_file=REPO_ROOT / ".env", extra="ignore"
    )

    exiledesk_root: Path = Field(
        default=Path.home() / "ExileDesk-stage",
        description=(
            "撮影・実演・名前に使う ExileDesk。既定はリリースの印で固定した別フォルダ (ADR 006、"
            "scripts/update_exiledesk.py で進める)。開発版を試す時は .env で ~/ExileDesk に"
        ),
    )
    youtube_pipeline_root: Path = Field(default=Path.home() / "youtube-pipeline")
    giftcut_root: Path = Field(
        default=Path.home() / "GiftCut", description="テロップスタイル (telop-presets) の出どころ"
    )
    voicevox_url: str = "http://127.0.0.1:50021"
    exiledesk_dev_url: str = Field(
        default="http://localhost:1430",
        description="撮影で開く ExileDesk (固定版は 1430、開発版を試す時は 1420)",
    )
    nvenc: bool = Field(
        default=True,
        description="mp4 の書き出しに GPU (NVENC) を使う。使えない PC では自動で CPU (libx264)",
    )
    hit_zoom: bool = Field(
        default=True,
        description="付ける瞬間にアイテムへ寄る拡大 (今の録画の形では ExileDesk の動きを使う)",
    )
    render_workers: int = Field(
        default=0,
        ge=0,
        description="コマを並べて作るプロセスの数 (0 = 自動: CPU の数 - 4、16 まで。1 = 並べない)",
    )
    stage_capture: bool = Field(
        default=True, description="stage シーンを ExileDesk の実画面で撮る (False なら図解で代用)"
    )
    voicevox_speed: float = Field(
        default=1.2, description="話速 (kyohei 指示 2026-09-27: 1.2 倍くらい)"
    )
    target_chars_per_sec: float = Field(
        default=7.3, description="めたんノーマル 1.2 倍の実測。遅いスタイルはここまで速める"
    )
    voicevox_max_speed: float = 1.7
    speaker_zundamon: int = 3
    speaker_metan: int = 2
    fps: int = Field(default=24, description="スライドイン等の動きが滑らかに見える最低ライン")
    bgm: str | None = Field(
        default="bgm_bright_1", description="youtube-pipeline assets/bgm のファイル名 (拡張子なし)"
    )
    bgm_gain_db: float = Field(
        default=-34.0, description="BGM 音量 (09-28 半分に、10-04 うっすら聞こえるくらいに -34)"
    )
    se_gain_db: float = -10.0
    width: int = 1920
    height: int = 1080
    background_rgb: tuple[int, int, int] = Field(default=(255, 255, 255), description="白背景固定")
    youtube_client_id: str | None = Field(
        default=None, description="ニュースと同じ OAuth クライアント"
    )
    youtube_client_secret: str | None = None
    youtube_refresh_token: str | None = Field(
        default=None, description="チョコバナナ用 (scripts/youtube_auth.py が書く)"
    )
    channel_profile: Path = Field(
        default=REPO_ROOT / "data" / "channel" / "chocobanana.json",
        description="チャンネル設定 (ADR 003)",
    )

    @property
    def price_keys_path(self) -> Path:
        return self.exiledesk_root / "src" / "services" / "htc" / "price-keys.json"

    @property
    def essence_keys_path(self) -> Path:
        return self.exiledesk_root / "src" / "services" / "htc" / "essence-keys.json"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
