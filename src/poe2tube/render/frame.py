"""台本 1 行 → 画面 1 枚。白背景 + 装飾枠 + シーン (図解) + 立ち絵 2 体 + テロップ.

配置 (1920x1080):
- 上帯: セクション名ピル (左上)、進行バー (右上)
- 中央: シーンパネル (図解 / アイテム / 実践)。talk の時は空けて立ち絵を大きく
- 下: テロップ帯。左右下に立ち絵 (めたん左、ずんだもん右)。話者を少し大きく、相手は淡く

動画では 1 行の間ずっと同じ「静的な層」(背景 + 枠 + パネル) に、フレームごとに変わる
「動的な層」(口パク立ち絵 + 小道具 + テロップ) を重ねる。静的な層は 1 行に 1 回だけ描く。
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

from poe2tube.config.settings import REPO_ROOT, get_settings
from poe2tube.contracts.craft_stage import CraftStageResult
from poe2tube.render.draw import load_icon, pill, shadow_panel
from poe2tube.render.overlay_fx import draw_emphasis_text
from poe2tube.render.palette import ACCENT, ACCENT_SOFT, GOLD, LINE, PANEL, WHITE, font
from poe2tube.render.scene_panel import draw_scene_panel
from poe2tube.render.tachie import render_tachie
from poe2tube.script.model import Emotion, Line, Speaker

ICON_DIR = REPO_ROOT / "assets" / "icons"
TELOP_H = 170
CHAR_H_TALK = 760
CHAR_H_PANEL = 520
Box = tuple[int, int, int, int]


def render_base(section_name: str, progress: float) -> Image.Image:
    """下地: 白背景 + 外枠 + セクション名 + 進行バー."""
    s = get_settings()
    img = Image.new("RGBA", (s.width, s.height), (*s.background_rgb, 255))
    _decor(img, section_name, progress)
    return img


def render_panel_layer(
    line: Line,
    result: CraftStageResult,
    stage_shot: Path | None = None,
    final_step: int | None = None,
    zoom: float = 0.0,
) -> Image.Image | None:
    """シーンパネルだけの透明レイヤー (talk なら None)。スライドイン演出のため下地と分ける."""
    if line.scene.kind == "talk":
        return None
    s = get_settings()
    w, h = s.width, s.height
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    panel = (330, 130, w - 330, h - TELOP_H - 40)
    shadow_panel(layer, panel, fill=WHITE, outline=LINE, radius=32, blur=24)
    x0, y0, x1, y1 = panel
    draw_scene_panel(
        layer,
        (x0 + 40, y0 + 40, x1 - 40, y1 - 40),
        line.scene,
        result,
        ICON_DIR,
        stage_shot,
        final_step,
        zoom,
    )
    return layer


def render_static(
    line: Line, result: CraftStageResult, section_name: str, progress: float
) -> Image.Image:
    """1 行の間変わらない層: 下地 + シーンパネル."""
    img = render_base(section_name, progress)
    layer = render_panel_layer(line, result)
    if layer is not None:
        img.alpha_composite(layer)
    return img


def compose_frame(
    static: Image.Image,
    line: Line,
    mouth: int = 0,
    props: list[str] | None = None,
    prop_scale: float = 1.0,
) -> Image.Image:
    """静的な層の上に、口パク立ち絵 + 小道具 + テロップを重ねて 1 フレームにする."""
    img = static.copy()
    panel_mode = line.scene.kind != "talk"
    _characters(img, line, panel_mode, mouth)
    _props(img, props or [], line.speaker, panel_mode, prop_scale)
    _telop(img, line)
    return img


def render_frame(
    line: Line,
    result: CraftStageResult,
    section_name: str,
    progress: float,
    mouth: int = 0,
    props: list[str] | None = None,
) -> Image.Image:
    """静止画 1 枚を一発で (プレビュー用)."""
    return compose_frame(render_static(line, result, section_name, progress), line, mouth, props)


def _decor(img: Image.Image, section_name: str, progress: float) -> None:
    w, h = img.size
    d = ImageDraw.Draw(img)
    # 外枠 (角に色を置いて白の単調さを消す)
    d.rounded_rectangle((16, 16, w - 16, h - 16), 36, outline=LINE, width=4)
    # 章名の長さに合わせて薄青の下地を伸ばす (8 分の構成表は章名が長い)
    label_w = int(d.textlength(section_name, font=font(28))) + 36
    d.rounded_rectangle((16, 16, max(420, 40 + label_w + 40), 90), 36, fill=ACCENT_SOFT)
    pill(img, (40, 34), section_name, ACCENT, size=28)
    # 進行バー
    d.rounded_rectangle((w - 440, 44, w - 60, 62), 9, fill=PANEL, outline=LINE)
    d.rounded_rectangle((w - 440, 44, w - 440 + int(380 * progress), 62), 9, fill=ACCENT)


def _characters(img: Image.Image, line: Line, panel_mode: bool, mouth: int) -> None:
    w, h = img.size
    ch = CHAR_H_PANEL if panel_mode else CHAR_H_TALK
    speakers: tuple[tuple[Speaker, int], ...] = (("metan", 40), ("zundamon", w - 40))
    for speaker, x_anchor in speakers:
        speaking = speaker == line.speaker
        emotion: Emotion = line.emotion if speaking else "normal"
        height = ch if speaking else int(ch * 0.92)
        im = render_tachie(speaker, emotion, mouth if speaking else 0, height)
        if not speaking:
            im = im.copy()
            im.putalpha(im.getchannel("A").point(lambda a: int(a * 0.8)))
        x = x_anchor if speaker == "metan" else x_anchor - im.width
        img.alpha_composite(im, (x, h - TELOP_H - im.height + 30))


def _props(
    img: Image.Image, props: list[str], speaker: str, panel_mode: bool, scale: float
) -> None:
    """小道具: 会話中は話者の顔の横、パネル中は話者の頭の上。``scale`` でポップイン (0→1)."""
    if not props or scale <= 0:
        return
    w, _ = img.size
    base = 150 if not panel_mode else 130
    size = max(8, int(base * scale))
    if panel_mode:
        cy = 220 + base // 2
        cx = (w - 260) if speaker == "zundamon" else 260
    else:
        cy = 300 + base // 2
        cx = (w - 400 - base // 2) if speaker == "zundamon" else 400 + base // 2
    for i, key in enumerate(props):
        path = ICON_DIR / f"{key}.png"
        if not path.exists():
            continue
        ic = load_icon(path, size)
        ccx = cx + (i * (base + 20)) * (1 if speaker == "metan" else -1)
        bx, by = ccx - size // 2, cy - size // 2
        pad = int(12 * scale)
        shadow_panel(
            img,
            (bx - pad, by - pad, bx + size + pad, by + size + pad),
            fill=WHITE,
            outline=GOLD,
            radius=max(4, int(30 * scale)),
        )
        img.alpha_composite(ic, (bx, by))


def _telop(img: Image.Image, line: Line) -> None:
    w, h = img.size
    d = ImageDraw.Draw(img)
    y0 = h - TELOP_H - 10
    color = (46, 160, 67) if line.speaker == "zundamon" else (214, 90, 160)
    d.rounded_rectangle((60, y0, w - 60, h - 30), 28, fill=WHITE, outline=color, width=5)
    name = "ずんだもん" if line.speaker == "zundamon" else "四国めたん"
    pill(img, (90, y0 - 26), name, color, size=26)
    # 数字・ティア・個数だけ GiftCut スタイルで強調 (overlay_fx)
    draw_emphasis_text(img, line.text, (w // 2, y0 + TELOP_H // 2 - 4), w - 240)
