"""ショート (縦 1080x1920) の 1 フレーム: 横長フレームのパネルを切り出して縦に組み直す (ADR 005).

- 上: 「本編は関連動画から」の帯 (出しっぱなし) + ショートの題
- 中: 横長フレームのパネル部分 (クラフト画面・クイズのカード・結果の文字) を拡大
- 下: 立ち絵 2 人 + 大きい字幕 (折り返し)
"""

from __future__ import annotations

import re

from PIL import Image, ImageDraw

from poe2tube.render.draw import pill
from poe2tube.render.overlay_fx import draw_emphasis_text
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


def wrap_text(text: str, width: int = WRAP) -> list[str]:
    """句読点で区切ってから、長い所は字数で折る (最大 3 行)."""
    chunks = [c for c in re.split(r"(?<=[、。！？])", text) if c]
    lines: list[str] = []
    cur = ""
    for c in chunks:
        if len(cur) + len(c) <= width:
            cur += c
            continue
        if cur:
            lines.append(cur)
        while len(c) > width:
            lines.append(c[:width])
            c = c[width:]
        cur = c
    if cur:
        lines.append(cur)
    return lines[:3]


def _header(img: Image.Image, title: str | None) -> None:
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, SW, 110), fill=ACCENT)
    d.text((SW // 2, 55), BANNER, font=font(48), fill=WHITE, anchor="mm")
    if title:
        for i, ln in enumerate(wrap_text(title, 14)[:2]):
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
    rows = wrap_text(line.text)
    step = 92
    top = (TELOP_Y0 + TELOP_Y1) // 2 - step * (len(rows) - 1) // 2
    for i, row in enumerate(rows):
        draw_emphasis_text(img, row, (SW // 2, top + i * step), SW - 120)


def compose_short(static: Image.Image, line: Line, mouth: int, title: str | None) -> Image.Image:
    """``static`` は横長の下地 + パネル (+ 結果の文字)。立ち絵・字幕は描かないで渡す."""
    img = Image.new("RGBA", (SW, SH), (255, 255, 255, 255))
    _header(img, title)
    if line.scene.kind != "talk":
        panel = static.crop(PANEL_SRC)
        k = SW / panel.width
        panel = panel.resize((SW, int(panel.height * k)), Image.Resampling.LANCZOS)
        img.alpha_composite(panel, (0, PANEL_Y))
    _characters(img, line, mouth)
    _telop(img, line)
    return img
