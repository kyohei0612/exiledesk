"""POE2Tube の設定。環境変数 / .env (POE2TUBE_ 接頭辞) で上書きできる."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="POE2TUBE_", env_file=".env", extra="ignore")

    exiledesk_root: Path = Field(
        default=Path.home() / "ExileDesk",
        description="ExileDesk のリポジトリ。公式日本語名 (price-keys.json 等) の出どころ",
    )
    youtube_pipeline_root: Path = Field(default=Path.home() / "youtube-pipeline")
    voicevox_url: str = "http://127.0.0.1:50021"
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
    bgm_gain_db: float = -20.0
    se_gain_db: float = -10.0
    width: int = 1920
    height: int = 1080
    background_rgb: tuple[int, int, int] = Field(default=(255, 255, 255), description="白背景固定")

    @property
    def price_keys_path(self) -> Path:
        return self.exiledesk_root / "src" / "services" / "htc" / "price-keys.json"

    @property
    def essence_keys_path(self) -> Path:
        return self.exiledesk_root / "src" / "services" / "htc" / "essence-keys.json"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
