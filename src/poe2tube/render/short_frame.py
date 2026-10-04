"""ショート (縦 1080x1920) の 1 フレーム: 横長フレームのパネルを切り出して縦に組み直す (ADR 005).

- 上: 「本編は関連動画から」の帯 (出しっぱなし) + ショートの題
- 中: 横長フレームのパネル部分 (クラフト画面・クイズのカード・結果の文字) を拡大
- 下: 立ち絵 2 人 + 大きい字幕 (折り返し)
"""

from __future__ import annotations

from PIL import Image, ImageDraw

from poe2tube.render.draw import pill
from poe2tube.render.overlay_fx import draw_countdown, draw_emphasis_text, tight_spaces
from poe2tube.render.palette import ACCENT, INK, WHITE, font
from poe2tube.render.tachie import render_tachie
from poe2tube.script.model import Emotion, Line, Speaker

SW, SH = 1080, 1920
PANEL_SRC = (300, 100, 1620, 890)  # 横長フレームのパネル (stage は少し広い) を全部含む範囲
PANEL_Y = 300
BANNER = "▶ 本編は関連動画から"
CHAR_H = 640
TELOP_Y0, TELOP_Y1 = 1560, 1880
WRAP = 15  # 字幕 1 行の字数の目安


PUNCT = "、。！？…"
PARTICLES = "はがをにでもへと"


def _break_points(rest: str, cut: int) -> list[list[int]]:
    """折ってよい位置の候補: 句読点の後 (前後 6 字) → 助詞の後 (前後 4 字)."""
    punct = [i + 1 for i in range(max(1, cut - 6), min(len(rest) - 1, cut + 6)) if rest[i] in PUNCT]
    particle = [
        i + 1
        for i in range(max(1, cut - 4), min(len(rest) - 1, cut + 4))
        if rest[i] in PARTICLES and not ("ぁ" <= rest[i + 1] <= "ゖ") and rest[i + 1] not in PUNCT
    ]
    return [punct, particle]


def _not_in_word(rest: str, cut: int) -> int:
    """英字・数字の並び (MOD・T1 等) の途中では折らない。並びの前か後の近い方へずらす."""

    def word(ch: str) -> bool:
        return ch.isascii() and (ch.isalnum() or ch in "+-%.")

    if not 0 < cut < len(rest) or not (word(rest[cut - 1]) and word(rest[cut])):
        return cut
    start, end = cut, cut
    while start > 0 and word(rest[start - 1]):
        start -= 1
    while end < len(rest) and word(rest[end]):
        end += 1
    return start if start > 0 and cut - start <= end - cut else end


def wrap_text(text: str, width: int = WRAP, max_rows: int = 3) -> list[str]:
    """だいたい同じ長さの行に割る。句読点か助詞の後で折り、行頭に句読点を置かない."""
    text = text.strip()
    if len(text) <= width:
        return [text]
    rows = min(max_rows, -(-len(text) // width))
    target = -(-len(text) // rows)
    out: list[str] = []
    rest = text
    while rest and len(out) < rows - 1:
        cut = min(target, len(rest))
        left = rows - len(out) - 1  # この行の後に残る行数
        for cand in _break_points(rest, cut):
            fit = [i for i in cand if i <= width + 3 and len(rest) - i <= (width + 3) * left]
            if fit:
                cut = min(fit, key=lambda i: abs(i - target))
                break
        cut = _not_in_word(rest, cut)
        while cut < len(rest) and rest[cut] in PUNCT + "）」":
            cut += 1  # 行頭に句読点を置かない
        out.append(rest[:cut])
        rest = rest[cut:]
    if rest:
        out.append(rest)
    return out


def _header(img: Image.Image, title: str | None) -> None:
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, SW, 110), fill=ACCENT)
    d.text((SW // 2, 55), BANNER, font=font(48), fill=WHITE, anchor="mm")
    if title:
        for i, ln in enumerate(wrap_text(title, 16, 2)):
            d.text((SW // 2, 170 + i * 76), ln, font=font(62), fill=INK, anchor="mm")


def _characters(img: Image.Image, line: Line, mouth: int) -> None:
    speakers: tuple[tuple[Speaker, int], ...] = (("metan", 20), ("zundamon", SW - 20))
    for speaker, x_anchor in speakers:
        speaking = speaker == line.speaker
        emotion: Emotion = line.emotion if speaking else "normal"
        h = CHAR_H if speaking else int(CHAR_H * 0.9)
        im = render_tachie(speaker, emotion, mouth if speaking else 0, h)
        if not speaking:
            im = im.copy()
            im.putalpha(im.getchannel("A").point(lambda a: int(a * 0.75)))
        x = x_anchor if speaker == "metan" else x_anchor - im.width
        img.alpha_composite(im, (x, TELOP_Y0 - im.height + 40))


def _telop(img: Image.Image, line: Line) -> None:
    d = ImageDraw.Draw(img)
    color = (46, 160, 67) if line.speaker == "zundamon" else (214, 90, 160)
    d.rounded_rectangle((30, TELOP_Y0, SW - 30, TELOP_Y1), 32, fill=WHITE, outline=color, width=6)
    name = "ずんだもん" if line.speaker == "zundamon" else "四国めたん"
    pill(img, (60, TELOP_Y0 - 28), name, color, size=30)
    rows = wrap_text(tight_spaces(line.text))
    step = 92
    top = (TELOP_Y0 + TELOP_Y1) // 2 - step * (len(rows) - 1) // 2
    for i, row in enumerate(rows):
        draw_emphasis_text(img, row, (SW // 2, top + i * step), SW - 120)


def compose_short(
    static: Image.Image,
    line: Line,
    mouth: int,
    title: str | None,
    countdown: int | None = None,
) -> Image.Image:
    """``static`` は横長の下地 + パネル (+ 結果の文字)。立ち絵・字幕は描かないで渡す."""
    img = Image.new("RGBA", (SW, SH), (255, 255, 255, 255))
    _header(img, title)
    if line.scene.kind != "talk":
        panel = static.crop(PANEL_SRC)
        k = SW / panel.width
        panel = panel.resize((SW, int(panel.height * k)), Image.Resampling.LANCZOS)
        img.alpha_composite(panel, (0, PANEL_Y))
    _characters(img, line, mouth)
    if countdown is not None:  # 2 人の間の空き (カードに被せない)
        draw_countdown(img, countdown, (SW // 2, 1230), 300)
    _telop(img, line)
    return img
