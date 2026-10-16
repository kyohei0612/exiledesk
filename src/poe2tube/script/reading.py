"""読み上げ用の文字を VOICEVOX 向けに整える.

VOICEVOX は半角スペースを「、」と同じ区切りとして読む (「2 つ」→「に、つ」「0 個」→「ゼロ、こ」)。
テロップ側は見やすさで数字の前後に空白を入れるので、読み上げ直前にだけ取り除く。
"""

from __future__ import annotations

import re

# 英単語同士 (Sapphire Ring 等) の空白だけは残す
_SPACE = re.compile(r"(?<![A-Za-z])[ 　]+|[ 　]+(?![A-Za-z])")
# 読みを直す言葉 (テロップはそのまま)。解呪 = かいじゅ、聖別 = せいべつ、後編 = こうへん、
# 札 = ふだ (VOICEVOX は「さつ」と読む。kyohei 2026-10-12「札？ふだだね読み方」)
_WORDS = (
    ("MOD", "モッド"),
    ("Mod", "モッド"),
    ("解呪", "かいじゅ"),
    ("聖別", "せいべつ"),
    ("後編", "こうへん"),
    ("札", "ふだ"),
    ("Esc", "エスケープ"),  # kyohei 2026-10-12「Esc はエスケープ」
    ("行を", "ぎょうを"),  # 工程の行・MOD の行 (「こう」と読まれる)。kyohei「行はぎょう」
    ("行は", "ぎょうは"),
    ("黄色", "きいろ"),  # kyohei 2026-10-12「黄色はきいろ」
    # kyohei 2026-10-16「エグザイルデスクね読み方」。URL は先に (exiledesk の部分が残らないよう)
    ("exiledesk.com", "エグザイルデスク・ドットコム"),
    ("ExileDesk", "エグザイルデスク"),
    ("EXILEDESK", "エグザイルデスク"),
    ("exiledesk", "エグザイルデスク"),
)
_PLUS = re.compile(r"\+(?=\d)")
# 数字の付かない「%」(「右の%は」) は VOICEVOX が読まない → パーセント (kyohei 2026-10-12)
_PERCENT = re.compile(r"(?<![\d.])[%％]")


def normalize_speech(text: str) -> str:
    """読み上げ前の整形: 余計な空白を消し、英略語と記号を読みに直す."""
    for src, dst in _WORDS:
        text = text.replace(src, dst)
    text = _PLUS.sub("プラス", text)
    text = _PERCENT.sub("パーセント", text)
    return _SPACE.sub("", text)
