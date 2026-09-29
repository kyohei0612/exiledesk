"""読み上げ用の文字を VOICEVOX 向けに整える.

VOICEVOX は半角スペースを「、」と同じ区切りとして読む (「2 つ」→「に、つ」「0 個」→「ゼロ、こ」)。
テロップ側は見やすさで数字の前後に空白を入れるので、読み上げ直前にだけ取り除く。
"""

from __future__ import annotations

import re

# 英単語同士 (Sapphire Ring 等) の空白だけは残す
_SPACE = re.compile(r"(?<![A-Za-z])[ 　]+|[ 　]+(?![A-Za-z])")
# 読みを直す言葉 (テロップはそのまま)。解呪は「かいじゅ」(kyohei 2026-09-30)
_WORDS = (("MOD", "モッド"), ("Mod", "モッド"), ("解呪", "かいじゅ"))
_PLUS = re.compile(r"\+(?=\d)")


def normalize_speech(text: str) -> str:
    """読み上げ前の整形: 余計な空白を消し、英略語と記号を読みに直す."""
    for src, dst in _WORDS:
        text = text.replace(src, dst)
    text = _PLUS.sub("プラス", text)
    return _SPACE.sub("", text)
