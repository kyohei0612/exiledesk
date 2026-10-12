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
from poe2tube.names import icon_path
from poe2tube.render.draw import load_icon, pill, shadow_panel
from poe2tube.render.overlay_fx import draw_emphasis_text, tight_spaces
from poe2tube.render.palette import ACCENT, ACCENT_SOFT, GOLD, LINE, PANEL, WHITE, font
from poe2tube.render.scene_panel import (
    STAGE_PANEL,
    USE_CLIP_LAYOUT,
    VIEW_TAGS,
    draw_scene_panel,
    stage_inner,
)
from poe2tube.render.tachie import render_tachie
from poe2tube.script.model import Emotion, Line, Speaker

ICON_DIR = REPO_ROOT / "assets" / "icons"
TELOP_H = 170
CHAR_H_TALK = 760
CHAR_H_PANEL = 520
# footage (アプリを操作した録画) は画面いっぱい。2 人は右下に肩から上、テロップは低く小さく
# (kyohei 2026-10-12「B で右下に 2 人」「テロップの枠ももう少し縦幅とフォント狭く、小さく」)
# kyohei 2026-10-12「もはや邪魔、テロップに付け足して顔で」→ 話す人の顔をテロップの左端に重ねる
FOOT_TELOP_H = 132
FOOT_FONT = 52
BUST_H = 230
BUST_CROP = 0.40  # 立ち絵の上から何割を顔 (肩から上) として切るか
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
    crop: tuple[float, float, float, float] | None = None,
) -> Image.Image | None:
    """シーンパネルだけの透明レイヤー (talk なら None)。スライドイン演出のため下地と分ける."""
    if line.scene.kind == "talk":
        return None
    s = get_settings()
    w, h = s.width, s.height
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    if line.scene.kind == "footage":  # 録画は枠なしで画面いっぱい
        if stage_shot is not None and stage_shot.exists():
            im = Image.open(stage_shot).convert("RGBA")
            if crop is not None and crop != (0, 0, im.width, im.height):  # 寄る (拡大)
                return_box = (crop[0], crop[1], crop[2], crop[3])
                im = im.resize((w, h), Image.Resampling.LANCZOS, box=return_box)
            else:
                im = im.resize((w, h))
            layer.paste(im, (0, 0))
        return layer
    wide = line.scene.kind in ("stage", "footage") or line.scene.kind in VIEW_TAGS
    if wide and USE_CLIP_LAYOUT:
        panel, inner = STAGE_PANEL, stage_inner()
    else:
        panel = (330, 130, w - 330, h - TELOP_H - 40)
        inner = (panel[0] + 40, panel[1] + 40, panel[2] - 40, panel[3] - 40)
    shadow_panel(layer, panel, fill=WHITE, outline=LINE, radius=32, blur=24)
    draw_scene_panel(
        layer,
        inner,
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
    telop: bool = True,
) -> Image.Image:
    """静的な層の上に、口パク立ち絵 + 小道具 + テロップを重ねて 1 フレームにする.

    telop=False: テロップを描かない (章名カードの間。先の話が見えないように、kyohei 2026-09-30)。
    """
    img = static.copy()
    if line.scene.kind == "footage":
        if telop:
            _telop(img, line, compact=True)
            _busts(img, line, mouth)
        return img
    panel_mode = line.scene.kind != "talk"
    _characters(img, line, panel_mode, mouth)
    _props(img, props or [], line.speaker, panel_mode, prop_scale)
    if telop:
        _telop(img, line)
    return img


def _busts(img: Image.Image, line: Line, mouth: int) -> None:
    """footage: 話す人の顔 (肩から上) をテロップの左端に重ねる。録画の上には人を出さない."""
    _, h = img.size
    full = render_tachie(line.speaker, line.emotion, mouth, int(BUST_H / BUST_CROP))
    face = full.crop((0, 0, full.width, BUST_H))
    if line.speaker == "zundamon":  # ずんだもんは左を向く絵なので反す (帯の内側を向く)
        face = face.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    img.alpha_composite(face, (40, h - BUST_H - 8))


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
        path = icon_path(key, ICON_DIR)
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


def _telop(img: Image.Image, line: Line, compact: bool = False) -> None:
    w, h = img.size
    d = ImageDraw.Draw(img)
    th, size, bottom = (FOOT_TELOP_H, FOOT_FONT, 18) if compact else (TELOP_H, 62, 30)
    y0 = h - th - (bottom - 20)
    color = (46, 160, 67) if line.speaker == "zundamon" else (214, 90, 160)
    d.rounded_rectangle((60, y0, w - 60, h - bottom), 24, fill=WHITE, outline=color, width=5)
    name = "ずんだもん" if line.speaker == "zundamon" else "四国めたん"
    left = 360 if compact else 90  # compact: 左端に顔を重ねるので名前と文は右へ
    pill(img, (left, y0 - 24), name, color, size=24 if compact else 26)
    # 数字・ティア・個数だけ GiftCut スタイルで強調 (overlay_fx)
    cx = (left + 40 + w - 60) // 2 if compact else w // 2
    center = (cx, y0 + (h - bottom - y0) // 2 - 2)
    draw_emphasis_text(img, tight_spaces(line.text), center, w - 240 - (left - 90), size)
