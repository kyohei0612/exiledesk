"""ゲーム公式の日本語名 (クライアント由来) の辞書。**自分で訳さない**.

出どころは ExileDesk の ``price-keys.json`` (currency / bones / omens) と ``essence-keys.json``。
どちらも GGG クライアントの BaseItemTypes から生成された物で、Exalted Orb は「高貴なオーブ」、
Divine Orb は「神のオーブ」が正 (kyohei 指示 2026-09-27: 基本日本語名、クライアント情報から引く)。

用途:
- ``ja(key)``: カレンシーキー → 日本語名 (台本・テロップ・費用の単位)
- ``find_in_text(text)``: セリフ本文に出た公式名を検出 → 小道具 (props) の自動挿入
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from pydantic import BaseModel, ConfigDict

from poe2tube.config.settings import get_settings


class GameName(BaseModel):
    model_config = ConfigDict(extra="ignore")

    en: str
    ja: str


@dataclass(frozen=True)
class Found:
    """本文中で見つかった公式名."""

    key: str
    ja: str
    start: int
    end: int


@dataclass
class NameBook:
    names: dict[str, GameName] = field(default_factory=dict)
    _by_ja: dict[str, str] = field(default_factory=dict, repr=False)
    _pattern: re.Pattern[str] | None = field(default=None, repr=False)

    @classmethod
    def load(cls, price_keys: Path | None = None, essence_keys: Path | None = None) -> NameBook:
        s = get_settings()
        price_keys = price_keys or s.price_keys_path
        essence_keys = essence_keys or s.essence_keys_path
        raw = json.loads(price_keys.read_text(encoding="utf-8"))
        names: dict[str, GameName] = {}
        for group in ("currency", "bones", "omens"):
            for key, val in raw.get(group, {}).items():
                names[key] = GameName.model_validate(val)
        if essence_keys.exists():
            ess = json.loads(essence_keys.read_text(encoding="utf-8")).get("keys", {})
            for key, val in ess.items():
                names[key] = GameName.model_validate(val)
        return cls(names=names)

    def __post_init__(self) -> None:
        # 同じ日本語名が複数キーに付く (エッセンスは装備種別ごとにキーが分かれる) ので先勝ち
        for key, gn in self.names.items():
            self._by_ja.setdefault(gn.ja, key)
        # 長い名前から先に当てる (「高貴なオーブ (上級)」を「高貴なオーブ」より優先)
        ordered = sorted(self._by_ja, key=len, reverse=True)
        self._pattern = re.compile("|".join(re.escape(n) for n in ordered)) if ordered else None

    def ja(self, key: str) -> str:
        """キー → 公式日本語名。無ければ KeyError (キーのまま出さない)."""
        return self.names[key].ja

    def key_of(self, ja: str) -> str | None:
        return self._by_ja.get(ja)

    def find_in_text(self, text: str) -> list[Found]:
        if self._pattern is None:
            return []
        return [
            Found(key=self._by_ja[m.group(0)], ja=m.group(0), start=m.start(), end=m.end())
            for m in self._pattern.finditer(text)
        ]
