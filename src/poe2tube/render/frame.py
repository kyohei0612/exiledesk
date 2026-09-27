"""台本 1 行 → 画面 1 枚。白背景 + 装飾枠 + シーン (図解) + 立ち絵 2 体 + テロップ.

配置 (1920x1080):
- 上帯: セクション名ピル + タイトル (左上)、進行バー (右上)
- 中央: シーンパネル (図解 / アイテム / 実践)。talk の時は空けて立ち絵を大きく
- 下: テロップ帯。左右下に立ち絵 (めたん左、ずんだもん右)。話者を少し大きく、相手は淡く
"""

from __future__ import annotations

from PIL import Image, ImageDraw

from poe2tube.config.settings import REPO_ROOT, get_settings
from poe2tube.contracts.craft_stage import CraftStageResult
from poe2tube.render.draw import load_icon, pill, shadow_panel
from poe2tube.render.item_card import card_height, draw_item_card
from poe2tube.render.palette import ACCENT, ACCENT_SOFT, GOLD, INK, LINE, MUTED, PANEL, WHITE, font
from poe2tube.render.stack import draw_stack
from poe2tube.render.tachie import render_tachie
from poe2tube.script.model import Emotion, Line, Scene, Speaker

ICON_DIR = REPO_ROOT / "assets" / "icons"
TELOP_H = 170
CHAR_H_TALK = 760
CHAR_H_PANEL = 520


def render_frame(
    line: Line,
    result: CraftStageResult,
    section_name: str,
    progress: float,
    mouth: int = 0,
    props: list[str] | None = None,
) -> Image.Image:
    s = get_settings()
    w, h = s.width, s.height
    img = Image.new("RGBA", (w, h), (*s.background_rgb, 255))
    _decor(img, section_name, progress)
    scene = line.scene
    panel_mode = scene.kind != "talk"
    if panel_mode:
        panel = (330, 130, w - 330, h - TELOP_H - 40)
        _scene_panel(img, panel, scene, result)
    _characters(img, line, panel_mode, mouth)
    _props(img, props or [], line.speaker, panel_mode)
    _telop(img, line)
    return img


def _decor(img: Image.Image, section_name: str, progress: float) -> None:
    w, h = img.size
    d = ImageDraw.Draw(img)
    # 外枠 (角に色を置いて白の単調さを消す)
    d.rounded_rectangle((16, 16, w - 16, h - 16), 36, outline=LINE, width=4)
    d.rounded_rectangle((16, 16, 420, 90), 36, fill=ACCENT_SOFT)
    pill(img, (40, 34), section_name, ACCENT, size=28)
    # 進行バー
    d.rounded_rectangle((w - 440, 44, w - 60, 62), 9, fill=PANEL, outline=LINE)
    d.rounded_rectangle((w - 440, 44, w - 440 + int(380 * progress), 62), 9, fill=ACCENT)


def _scene_panel(img: Image.Image, box: Box, scene: Scene, result: CraftStageResult) -> None:
    shadow_panel(img, box, fill=WHITE, outline=LINE, radius=32, blur=24)
    x0, y0, x1, y1 = box
    inner = (x0 + 40, y0 + 40, x1 - 40, y1 - 40)
    if scene.kind == "stack":
        steps = scene.show_steps or list(range(1, (scene.step or 0) + 1))
        draw_stack(img, inner, result, steps, scene.step, scene.highlight, ICON_DIR)
    elif scene.kind == "item":
        item = result.steps[scene.step - 1].after if scene.step else result.steps[0].before
        hl = set()
        if scene.highlight == "added" and scene.step:
            hl = {m.mod_id for m in result.steps[scene.step - 1].changed.added}
        ch = card_height(item)
        cw = 900
        cx = (x0 + x1) // 2 - cw // 2
        cy = (y0 + y1) // 2 - ch // 2
        draw_item_card(img, (cx, cy, cx + cw, cy + ch), item, hl, scene.highlight == "name")
    elif scene.kind == "stage":
        _stage_placeholder(img, inner, scene, result)
    elif scene.kind == "cost":
        _cost(img, inner, result)


def _stage_placeholder(img: Image.Image, box: Box, scene: Scene, result: CraftStageResult) -> None:
    """クラフトステージの撮影画面が来るまでの仮: 左に工程アイコン列、右に現在のアイテム."""
    x0, y0, x1, y1 = box
    d = ImageDraw.Draw(img)
    pill(img, (x0, y0), "実践: クラフトステージ (仮画面)", MUTED, size=24)
    step = scene.step or 0
    item = result.steps[step - 1].after if step else result.steps[0].before
    y = y0 + 80
    for st in result.steps:
        done = st.index <= step
        icon_path = ICON_DIR / f"{st.currency}.png"
        if icon_path.exists():
            ic = load_icon(icon_path, 110)
            if not done:
                ic = ic.copy()
                ic.putalpha(ic.getchannel("A").point(lambda a: a // 4))
            img.alpha_composite(ic, (x0, y))
        d.text((x0 + 130, y + 30), st.currency_ja, font=font(30), fill=INK if done else MUTED)
        if st.index == step:
            pill(img, (x0 + 130, y + 72), "← いま使った", GOLD, INK, size=20, pad=10)
        y += 150
    hl = {m.mod_id for m in result.steps[step - 1].changed.added} if step else set()
    ch = card_height(item)
    draw_item_card(img, (x0 + 520, y0 + 60, x1, y0 + 60 + ch), item, hl)


def _cost(img: Image.Image, box: Box, result: CraftStageResult) -> None:
    x0, y0, x1, _ = box
    d = ImageDraw.Draw(img)
    y = y0 + 20
    for st in result.steps:
        d.text((x0 + 40, y), f"工程 {st.index}  {st.currency_ja}", font=font(36), fill=INK)
        d.text(
            (x1 - 420, y), f"{st.cost.subtotal:.2f} {result.price_unit}", font=font(36), fill=MUTED
        )
        y += 80
    d.line((x0 + 40, y, x1 - 40, y), fill=LINE, width=3)
    d.text((x0 + 40, y + 30), "合計", font=font(48), fill=INK)
    d.text(
        (x1 - 420, y + 30),
        f"{result.total_cost:.2f} {result.price_unit}",
        font=font(48),
        fill=ACCENT,
    )


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


def _props(img: Image.Image, props: list[str], speaker: str, panel_mode: bool) -> None:
    """小道具: 会話中は話者の顔の横に、パネル中は話者の頭の上にポンと出す (パネルと被らない)."""
    if not props:
        return
    w, _ = img.size
    size = 150 if not panel_mode else 130
    if panel_mode:
        y = 220
        x = (w - 260 - size // 2) if speaker == "zundamon" else 260 - size // 2
    else:
        y = 300
        x = (w - 400 - size) if speaker == "zundamon" else 400
    for i, key in enumerate(props):
        path = ICON_DIR / f"{key}.png"
        if not path.exists():
            continue
        ic = load_icon(path, size)
        bx = x + (i * (size + 20)) * (1 if speaker == "metan" else -1)
        shadow_panel(
            img,
            (bx - 12, y - 12, bx + size + 12, y + size + 12),
            fill=WHITE,
            outline=GOLD,
            radius=30,
        )
        img.alpha_composite(ic, (bx, y))


def _telop(img: Image.Image, line: Line) -> None:
    w, h = img.size
    d = ImageDraw.Draw(img)
    y0 = h - TELOP_H - 10
    color = (46, 160, 67) if line.speaker == "zundamon" else (214, 90, 160)
    d.rounded_rectangle((60, y0, w - 60, h - 30), 28, fill=WHITE, outline=color, width=5)
    name = "ずんだもん" if line.speaker == "zundamon" else "四国めたん"
    pill(img, (90, y0 - 26), name, color, size=26)
    size = 56
    while d.textlength(line.text, font=font(size)) > w - 240 and size > 30:
        size -= 2
    tw = d.textlength(line.text, font=font(size))
    d.text(((w - tw) / 2, y0 + (TELOP_H - size) / 2 - 8), line.text, font=font(size), fill=INK)


Box = tuple[int, int, int, int]
