"""VOICEVOX エンジン (HTTP) で台本 1 行を wav にする.

- 感情 → スタイル id (ずんだもん: ノーマル 3 / あまあま 1 / ツンツン 7 / ヘロヘロ 75 / なみだめ 76、
  四国めたん: ノーマル 2 / あまあま 0 / ツンツン 6 / ささやき 36)
- 話速は settings.voicevox_speed (1.2)
- キャッシュ: sha256(text, style, speed) → cache/voice/<hash>.wav
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any

import requests
import structlog

from poe2tube.config.settings import REPO_ROOT, get_settings
from poe2tube.script.model import Emotion, Line, Speaker

log = structlog.get_logger()
CACHE_DIR = REPO_ROOT / "cache" / "voice"
CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0

STYLE: dict[Speaker, dict[Emotion, int]] = {
    # troubled はヘロヘロ (75) だと極端に遅く弱いので ノーマル (顔で困りを出す)
    "zundamon": {"normal": 3, "troubled": 3, "surprised": 7, "happy": 1, "proud": 7, "sad": 76},
    "metan": {"normal": 2, "troubled": 0, "surprised": 6, "happy": 0, "proud": 6, "sad": 36},
}
ENGINE_EXE = (
    Path(os.environ.get("LOCALAPPDATA", ""))
    / "Microsoft/WinGet/Packages/HiroshibaKazuyuki.VOICEVOX_Microsoft.Winget.Source_8wekyb3d8bbwe"
    / "VOICEVOX/vv-engine/run.exe"
)


def predicted_seconds(query: dict[str, Any]) -> float:
    """audio_query の各モーラ長 + 句読点ポーズ + 前後の無音から speed 1.0 の発話秒を出す."""
    total = float(query.get("prePhonemeLength", 0)) + float(query.get("postPhonemeLength", 0))
    for phrase in query.get("accent_phrases", []):
        for mora in phrase.get("moras", []):
            total += float(mora.get("consonant_length") or 0) + float(mora.get("vowel_length") or 0)
        pause = phrase.get("pause_mora")
        if pause:
            total += float(pause.get("vowel_length") or 0)
    return total


class VoicevoxClient:
    def __init__(self, base_url: str | None = None, speed: float | None = None) -> None:
        s = get_settings()
        self.base = (base_url or s.voicevox_url).rstrip("/")
        self.speed = speed if speed is not None else s.voicevox_speed
        self.target_rate = s.target_chars_per_sec
        self.max_speed = s.voicevox_max_speed
        self.session = requests.Session()

    # --- エンジン -------------------------------------------------------
    def alive(self) -> bool:
        try:
            return self.session.get(f"{self.base}/version", timeout=2).ok
        except requests.RequestException:
            return False

    def ensure_engine(self, wait_seconds: int = 90) -> None:
        """動いていなければ run.exe を隠し窓で起動して /version が返るまで待つ."""
        if self.alive():
            return
        if not ENGINE_EXE.exists():
            raise FileNotFoundError(f"VOICEVOX エンジンが無い: {ENGINE_EXE}")
        host, port = self.base.replace("http://", "").split(":")
        subprocess.Popen(
            [str(ENGINE_EXE), "--host", host, "--port", port],
            creationflags=CREATE_NO_WINDOW,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        log.info("voicevox engine starting", exe=str(ENGINE_EXE), port=port)
        deadline = time.time() + wait_seconds
        while time.time() < deadline:
            if self.alive():
                return
            time.sleep(1)
        raise TimeoutError(f"VOICEVOX が {wait_seconds} 秒で起動しない")

    # --- 合成 -----------------------------------------------------------
    @staticmethod
    def style_of(line: Line) -> int:
        return STYLE[line.speaker][line.emotion]

    def cache_path(self, line: Line) -> Path:
        key = json.dumps([line.spoken, self.style_of(line), self.speed], ensure_ascii=False)
        digest = hashlib.sha256(key.encode()).hexdigest()[:20]
        return CACHE_DIR / f"{line.speaker}_{digest}.wav"

    def synthesize(self, line: Line) -> Path:
        """wav のパスを返す (キャッシュ命中なら合成しない)."""
        path = self.cache_path(line)
        if path.exists():
            return path
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        style = self.style_of(line)
        query = self._post("/audio_query", params={"text": line.spoken, "speaker": style}).json()
        query["speedScale"] = self.speed_for(query, line.spoken)
        wav = self._post("/synthesis", params={"speaker": style}, json_body=query).content
        path.write_bytes(wav)
        log.info(
            "voice synthesized",
            speaker=line.speaker,
            style=style,
            chars=len(line.spoken),
            speed=round(query["speedScale"], 2),
        )
        return path

    def speed_for(self, query: dict[str, Any], text: str) -> float:
        """話者・スタイルで速さがばらつくのを揃える (kyohei 2026-09-27: ずんだもんが遅すぎる).

        audio_query のモーラ長から speed 1.0 の発話秒を予測し、目標の字/秒
        (settings.target_chars_per_sec) に届かない時だけ speedScale を上げる。
        速い方は基準の speed のまま (上限 max_speed)。
        """
        base_sec = predicted_seconds(query)
        if base_sec <= 0 or not text:
            return self.speed
        rate_at_base = len(text) / (base_sec / self.speed)
        if rate_at_base >= self.target_rate:
            return self.speed
        return min(self.max_speed, self.speed * self.target_rate / rate_at_base)

    def _post(
        self, route: str, params: dict[str, Any], json_body: dict[str, Any] | None = None
    ) -> requests.Response:
        r = self.session.post(f"{self.base}{route}", params=params, json=json_body, timeout=120)
        r.raise_for_status()
        return r
