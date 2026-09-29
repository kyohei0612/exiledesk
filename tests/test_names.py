"""公式日本語名の辞書と本文検出."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from poe2tube.config.settings import get_settings
from poe2tube.names import NameBook

SAMPLE = Path(__file__).parent / "fixtures" / "price-keys.sample.json"


@pytest.fixture
def book() -> NameBook:
    return NameBook.load(price_keys=SAMPLE, essence_keys=SAMPLE.with_name("no-essence.json"))


def test_exalt_is_kouki_na_orb(book: NameBook) -> None:
    assert book.ja("exalt") == "高貴なオーブ"
    assert book.ja("divine") == "神のオーブ"
    with pytest.raises(KeyError):
        book.ja("exalted")


def test_find_in_text_prefers_longest_and_keeps_order(book: NameBook) -> None:
    found = book.find_in_text(
        "高貴なオーブ (上級) を使って、次に変成のオーブと右側の高貴なお告げ。"
    )
    assert [f.key for f in found] == ["exalt_greater", "transmute", "OmenofDextralExaltation"]
    assert found[0].start == 0


def test_find_in_text_empty_when_nothing(book: NameBook) -> None:
    assert book.find_in_text("MODって何なのだ？") == []


def test_real_exiledesk_file_loads_when_present() -> None:
    s = get_settings()
    if not s.price_keys_path.exists():
        pytest.skip("ExileDesk が無い環境")
    book = NameBook.load()
    assert book.ja("exalt") == "高貴なオーブ"
    assert book.ja("essence:breach") == "ブリーチのエッセンス"
    assert any(k.startswith("essence:lesser:") for k in book.names)


def test_skill_and_rune_names(tmp_path: Path) -> None:
    """ExileDesk ⑰ のスキル・ルーンの公式名が小道具になる (サポートと 2 字以下は入れない)."""
    from poe2tube.names import _skills_and_runes

    d = tmp_path.joinpath("src", "services", "craft-stage")
    d.mkdir(parents=True)
    skills = [
        {"id": "SkillGemIceStrike", "en": "Ice Strike", "ja": "アイスストライク", "support": False},
        {"id": "SupportX", "en": "X", "ja": "サポートの何か", "support": True},
        {"id": "Short", "en": "S", "ja": "短い", "support": False},
    ]
    (d / "skill-art.json").write_text(json.dumps(skills, ensure_ascii=False), encoding="utf-8")
    runes = {"runes": {"Lesser Iron Rune": {"ja": "鉄のレッサールーン", "kind": "rune"}}}
    (d / "stage-runes.json").write_text(json.dumps(runes, ensure_ascii=False), encoding="utf-8")
    got = _skills_and_runes(tmp_path)
    assert set(got) == {"skill:SkillGemIceStrike", "rune:Lesser Iron Rune"}
    book = NameBook(names=got)
    found = book.find_in_text("アイスストライクに鉄のレッサールーンなのだ")
    assert [f.key for f in found] == ["skill:SkillGemIceStrike", "rune:Lesser Iron Rune"]
