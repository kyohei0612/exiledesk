from poe2tube.script.model import Line
from poe2tube.script.reading import normalize_speech


def test_spaces_around_numbers_removed() -> None:
    assert normalize_speech("枠の種類が 2 つあるの。") == "枠の種類が2つあるの。"
    assert normalize_speech("最大 6 個入るわ。") == "最大6個入るわ。"


def test_english_word_spaces_kept() -> None:
    assert normalize_speech("Sapphire Ring よ") == "Sapphire Ringよ"


def test_mod_and_plus_read() -> None:
    assert normalize_speech("MOD は 0 個よ。") == "モッドは0個よ。"
    assert normalize_speech("知性 +9 も") == "知性プラス9も"


def test_exiledesk_read() -> None:
    assert normalize_speech("ExileDeskの新しい機能よ") == "エグザイルデスクの新しい機能よ"
    assert normalize_speech("サイトはexiledesk.comで") == "サイトはエグザイルデスク・ドットコムで"


def test_line_spoken_is_normalized() -> None:
    line = Line.model_validate(
        {"speaker": "metan", "text": "MOD が 2 つ", "scene": {"kind": "talk"}}
    )
    assert line.spoken == "モッドが2つ"
    assert line.text == "MOD が 2 つ"
