"""シーンパネルの中身: stack / item / stage (仮) / cost を結果 JSON から描く."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

from poe2tube.capture.stage import cached_path
from poe2tube.contracts.craft_stage import CraftStageResult, StageStep
from poe2tube.render.draw import load_icon, pill
from poe2tube.render.item_card import card_height, draw_item_card
from poe2tube.render.palette import ACCENT, GOLD, GREEN, INK, LINE, MUTED, font
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


# 撮影画面 (1920x1080、ExileDesk v0.1.311 の動画モード) の見せる範囲
HAND_REGION = (60, 150, 1080, 1050)  # アイテム枠 + 下の棚: 手つき (拾って運ぶ) が見える
CARD_REGION = (180, 150, 960, 650)  # アイテム枠だけ: 付いた瞬間に寄る
ZOOM_TEXT_H = 130  # 拡大中はパネルの下にこれだけ空けて、結果の文字をそこに出す


def _lerp_box(a: tuple[int, int, int, int], b: tuple[int, int, int, int], e: float) -> list[int]:
    return [int(a[i] + (b[i] - a[i]) * e) for i in range(4)]


def _stage_capture(img: Image.Image, box: Box, shot: Path, step: int, zoom: float = 0.0) -> None:
    """ExileDesk クラフトステージの実画面を貼る。``zoom``: 0 = 全体、1 = 棚とアイテム (手つき)、
    2 = アイテムだけ (付いた瞬間)。間の値はなめらかに寄る.

    kyohei 2026-09-28: 付く瞬間の前から付いた時までアイテムを拡大、文字はクラフト画面に被せない。
    """
    x0, y0, x1, y1 = box
    im = Image.open(shot).convert("RGBA")
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
    scale = min((x1 - x0) / im.width, (y1 - y0 - 44) / im.height)
    im = im.resize((int(im.width * scale), int(im.height * scale)), Image.Resampling.LANCZOS)
    px = x0 + (x1 - x0 - im.width) // 2
    py = y0 + 44
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((px - 6, py - 6, px + im.width + 6, py + im.height + 6), 16, fill=INK)
    img.alpha_composite(im, (px, py))
    label = "クラフトステージ (ExileDesk)" + (f"  {step} 手目" if step else "  開始前")
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
