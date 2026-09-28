"""シーンパネルの中身: stack / item / stage (仮) / cost を結果 JSON から描く."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw

from poe2tube.capture.stage import cached_path
from poe2tube.contracts.craft_stage import CraftStageResult, StageStep
from poe2tube.names import NameBook
from poe2tube.render.draw import load_icon, pill, shadow_panel
from poe2tube.render.item_card import card_height, draw_item_card
from poe2tube.render.palette import ACCENT, GOLD, GREEN, INK, LINE, MUTED, WHITE, font
from poe2tube.render.stack import draw_stack
from poe2tube.script.model import Scene

Box = tuple[int, int, int, int]


def draw_scene_panel(
    img: Image.Image,
    inner: Box,
    scene: Scene,
    result: CraftStageResult,
    icon_dir: Path,
    stage_shot: Path | None = None,
    final_step: int | None = None,
    zoom: float = 0.0,
) -> None:
    """``stage_shot`` を渡すと stage シーンにその画像 (打った瞬間の 1 コマ) を使う."""
    x0, y0, x1, y1 = inner
    if scene.kind == "stack":
        steps = scene.show_steps or list(range(1, (scene.step or 0) + 1))
        draw_stack(img, inner, result, steps, scene.step, scene.highlight, icon_dir, final_step)
    elif scene.kind == "item":
        item = result.steps[scene.step - 1].after if scene.step else result.steps[0].before
        hl: set[str] = set()
        if scene.highlight == "added" and scene.step:
            hl = {m.mod_id for m in result.steps[scene.step - 1].changed.added}
        ch = card_height(item)
        cw = 900
        cx = (x0 + x1) // 2 - cw // 2
        cy = (y0 + y1) // 2 - ch // 2
        draw_item_card(img, (cx, cy, cx + cw, cy + ch), item, hl, scene.highlight == "name")
    elif scene.kind == "stage":
        shot = stage_shot or cached_path(result.plan, scene.step or 0)
        if shot.exists():
            _stage_capture(img, inner, shot, scene.step or 0, zoom)
        else:
            _stage_placeholder(img, inner, scene, result, icon_dir)
    elif scene.kind == "cost":
        _cost(img, inner, result)
    elif scene.kind == "quiz":
        draw_quiz(img, inner, scene, icon_dir)


# 撮影画面 (1920x1080、ExileDesk v0.1.311 の動画モード) の見せる範囲
# v0.1.312 から棚がアイテムの右横に縦並び → アイテム + 棚を 1 つの範囲で拡大
# したまま手つきも全部見える (kyohei 2026-09-28)。MOD 6 つ分の高さまで取る
USE_CLIP_LAYOUT = True
HAND_REGION = (80, 150, 1060, 760)
CARD_REGION = HAND_REGION
ZOOM_TEXT_H = 130  # 拡大中はパネルの下にこれだけ空けて、結果の文字をそこに出す

# stage シーンだけパネルを広げ、撮影画面を大きく貼る (kyohei 2026-09-28「装備も小さい」)。
# 0.57 倍 → 0.67 倍。手順名の札は撮影画面の左上 (黒地) に重ねる
STAGE_PANEL: Box = (300, 104, 1620, 888)
STAGE_PAD = 14
SHOT_W, SHOT_H = 1920, 1080


def stage_shot_rect(inner: Box) -> Box:
    """撮影画面 (1920x1080) を ``inner`` に収めた時の貼り位置 (x0, y0, x1, y1)."""
    x0, y0, x1, y1 = inner
    scale = min((x1 - x0) / SHOT_W, (y1 - y0) / SHOT_H)
    w, h = int(SHOT_W * scale), int(SHOT_H * scale)
    px, py = x0 + (x1 - x0 - w) // 2, y0 + (y1 - y0 - h) // 2
    return (px, py, px + w, py + h)


def stage_inner() -> Box:
    x0, y0, x1, y1 = STAGE_PANEL
    return (x0 + STAGE_PAD, y0 + STAGE_PAD, x1 - STAGE_PAD, y1 - STAGE_PAD)


_R = stage_shot_rect(stage_inner())
# 撮影画面の下 15% の空き (ExileDesk layout=clip) の真ん中。結果の文字をここに出す
STAGE_HIT_Y = _R[1] + int((_R[3] - _R[1]) * 0.925)


def _lerp_box(a: tuple[int, int, int, int], b: tuple[int, int, int, int], e: float) -> list[int]:
    return [int(a[i] + (b[i] - a[i]) * e) for i in range(4)]


def _stage_capture(img: Image.Image, box: Box, shot: Path, step: int, zoom: float = 0.0) -> None:
    """ExileDesk クラフトステージの実画面を貼る。``zoom``: 0 = 全体、1 = 棚とアイテム (手つき)、
    2 = アイテムだけ (付いた瞬間)。間の値はなめらかに寄る.

    kyohei 2026-09-28: 付く瞬間の前から付いた時までアイテムを拡大、文字はクラフト画面に被せない。
    """
    x0, y0, x1, y1 = box
    im = Image.open(shot).convert("RGBA")
    # ExileDesk v0.1.313 の撮影用レイアウト (layout=clip) はアイテム + 棚だけを大きく描き、下 15% を
    # 空けてくれる → POE2Tube では拡大しない (kyohei 2026-09-28「拡大せずに使える形で」)
    zoom = 0.0 if USE_CLIP_LAYOUT else zoom
    if zoom > 0:
        full = (0, 0, im.width, im.height)
        if zoom <= 1:
            e = 1 - (1 - zoom) ** 3
            c = _lerp_box(full, HAND_REGION, e)
        else:
            e = 1 - (1 - min(1.0, zoom - 1)) ** 3
            c = _lerp_box(HAND_REGION, CARD_REGION, e)
        im = im.crop((c[0], c[1], c[2], c[3]))
        y1 = int(y1 - ZOOM_TEXT_H * min(1.0, zoom))
    label = "クラフトステージ (ExileDesk)" + (f"  {step} 手目" if step else "  開始前")
    d = ImageDraw.Draw(img)
    if USE_CLIP_LAYOUT:
        px, py, qx, qy = stage_shot_rect((x0, y0, x1, y1))
        im = im.resize((qx - px, qy - py), Image.Resampling.LANCZOS)
        d.rounded_rectangle((px - 6, py - 6, qx + 6, qy + 6), 16, fill=INK)
        img.alpha_composite(im, (px, py))
        # アイテム枠の左の黒地に「N 手目」だけ (長い札はアイテム名に被る)
        pill(img, (px + 14, py + 14), f"{step} 手目" if step else "開始前", ACCENT, size=26)
        return
    scale = min((x1 - x0) / im.width, (y1 - y0 - 44) / im.height)
    im = im.resize((int(im.width * scale), int(im.height * scale)), Image.Resampling.LANCZOS)
    px = x0 + (x1 - x0 - im.width) // 2
    py = y0 + 44
    d.rounded_rectangle((px - 6, py - 6, px + im.width + 6, py + im.height + 6), 16, fill=INK)
    img.alpha_composite(im, (px, py))
    pill(img, (x0, y0), label, ACCENT, size=24)


def _change_callout(img: Image.Image, box: Box, step: StageStep, icon_dir: Path) -> None:
    """撮影画面の右上に「この手で何が消えて何が付いたか」を文字で重ねる (速い演出の補助)."""
    x0, y0, x1, _ = box
    lines: list[tuple[str, tuple[int, int, int]]] = [(f"{step.currency_ja} を使った", INK)]
    lines += [(f"− {m.text_ja}", (200, 60, 60)) for m in step.changed.removed]
    lines += [(f"+ {m.text_ja}", GREEN) for m in step.changed.added]
    if not step.applied:
        lines.append((f"使えない: {step.reason or ''}", MUTED))
    d = ImageDraw.Draw(img)
    f = font(24)
    w = max(int(d.textlength(s, font=f)) for s, _ in lines) + 40 + 60
    h = 20 + 36 * len(lines)
    bx, by = x1 - w - 8, y0 + 52
    d.rounded_rectangle(
        (bx, by, bx + w, by + h), 14, fill=(255, 255, 255, 235), outline=GOLD, width=3
    )
    icon_path = icon_dir / f"{step.currency}.png"
    if icon_path.exists():
        img.alpha_composite(load_icon(icon_path, 48), (bx + 12, by + 8))
    for i, (s, col) in enumerate(lines):
        d.text((bx + 70, by + 10 + 36 * i), s, font=f, fill=col)


def _stage_placeholder(
    img: Image.Image, box: Box, scene: Scene, result: CraftStageResult, icon_dir: Path
) -> None:
    """クラフトステージ (結果 JSON から描く版): 上にカレンシー棚、中央にアイテム、下に工程履歴.

    ExileDesk のクラフトステージ画面 (Craft of Exile 式) と同じ並びにして、後で撮影画面に
    差し替えても見え方が変わらないようにする。
    """
    x0, y0, x1, y1 = box
    d = ImageDraw.Draw(img)
    pill(img, (x0, y0), "クラフトステージ", ACCENT, size=24)
    step = scene.step or 0
    item = result.steps[step - 1].after if step else result.steps[0].before
    # カレンシー棚: 手順に出る種類を並べ、いま使った物に金の枠
    shelf_y = y0 + 70
    x = x0
    seen: list[str] = []
    for st in result.steps:
        if st.currency in seen:
            continue
        seen.append(st.currency)
        icon_path = icon_dir / f"{st.currency}.png"
        current = st.index == step
        if current:
            d.rounded_rectangle(
                (x - 10, shelf_y - 10, x + 110, shelf_y + 110), 18, outline=GOLD, width=5
            )
        if icon_path.exists():
            img.alpha_composite(load_icon(icon_path, 100), (x, shelf_y))
        d.text((x, shelf_y + 108), st.currency_ja, font=font(18), fill=INK if current else MUTED)
        x += 200
    # 使用中のカレンシー: 棚からアイテムへ飛んだ先 (アイテムの左上に重ねる)
    hl = {m.mod_id for m in result.steps[step - 1].changed.added} if step else set()
    ch = card_height(item)
    cw = min(880, x1 - x0 - 40)
    cx = x0 + (x1 - x0 - cw) // 2
    cy = shelf_y + 190
    draw_item_card(img, (cx, cy, cx + cw, cy + ch), item, hl)
    if step:
        cur = result.steps[step - 1]
        icon_path = icon_dir / f"{cur.currency}.png"
        if icon_path.exists():
            img.alpha_composite(load_icon(icon_path, 90), (cx - 45, cy - 45))
        label = f"{cur.currency_ja} を使った" if cur.applied else f"使えない: {cur.reason or ''}"
        pill(img, (cx + 60, cy - 46), label, GOLD if cur.applied else MUTED, INK, size=20, pad=10)
    # 工程履歴 (下に積み上がる)
    hy = min(y1 - 60, cy + ch + 30)
    hx = x0
    for st in result.steps[:step]:
        added = "、".join(m.text_ja for m in st.changed.added) or "変化なし"
        text = f"{st.index}. {st.currency_ja} → {added}"
        box_ = pill(img, (hx, hy), text, ACCENT if st.index == step else LINE, INK, size=20, pad=12)
        hx = box_[2] + 12
        if hx > x1 - 300:
            hx, hy = x0, hy + 52


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
    total = f"{result.total_cost:.2f} {result.price_unit}"
    d.text((x1 - 420, y + 30), total, font=font(48), fill=ACCENT)


@lru_cache(maxsize=1)
def _names() -> NameBook:
    return NameBook.load()


def draw_quiz(img: Image.Image, box: Box, scene: Scene, icon_dir: Path) -> None:
    """クイズ: カレンシーをアイコン + 公式名のカードで横に並べる (ADR 005).

    ``answer`` の番号のカードを緑で囲み、``badges`` があればカードの下に札を付ける。
    """
    choices = scene.choices or []
    x0, y0, x1, y1 = box
    gap = 36
    cw = (x1 - x0 - gap * (len(choices) - 1)) // max(1, len(choices))
    ch = min(y1 - y0 - 20, int(cw * 1.25))
    top = y0 + (y1 - y0 - ch) // 2
    d = ImageDraw.Draw(img)
    for i, key in enumerate(choices):
        cx0 = x0 + i * (cw + gap)
        right = scene.answer is not None and i == scene.answer
        dim = scene.answer is not None and not right
        shadow_panel(
            img,
            (cx0, top, cx0 + cw, top + ch),
            fill=WHITE,
            outline=GREEN if right else (LINE if dim else GOLD),
            radius=28,
        )
        if right:
            d.rounded_rectangle((cx0, top, cx0 + cw, top + ch), 28, outline=GREEN, width=10)
        icon = icon_dir / f"{key}.png"
        size = int(cw * 0.58)
        if icon.exists():
            ic = load_icon(icon, size)
            if dim:
                ic.putalpha(ic.getchannel("A").point(lambda a: int(a * 0.45)))
            img.alpha_composite(ic, (cx0 + (cw - ic.width) // 2, top + 30))
        name = _names().ja(key)
        f = font(40 if len(name) <= 6 else 32)
        d.text(
            (cx0 + cw // 2, top + 60 + size),
            name,
            font=f,
            fill=MUTED if dim else INK,
            anchor="ma",
        )
        if scene.badges:
            color = GREEN if right else ACCENT
            label = scene.badges[i]
            bw = int(d.textlength(label, font=font(30))) + 44
            pill(img, (cx0 + (cw - bw) // 2, top + ch - 70), label, color, size=30)
