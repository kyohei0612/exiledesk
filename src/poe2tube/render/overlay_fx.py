"""GiftCut テロップスタイルを使った動画内の演出 (kyohei 2026-09-28「全部入れて」).

1. 打った瞬間の結果: 「+ 雷耐性 +40%」「消えた! 火ダメージ」を拡大したアイテムの**下**にポップ
   (クラフト画面に文字を被せない。「レアに!」は ExileDesk の演出が出すので出さない)
2. 章の区切り: 章が変わった行の頭で、パネルを出す前の白地に章名を大きく
3. 強調ワード: 下のテロップの数字・ティア・個数だけを色付きスタイルで
"""

from __future__ import annotations

import re
from functools import lru_cache

from PIL import Image, ImageDraw, ImageFilter

from poe2tube.contracts.craft_stage import StageStep
from poe2tube.render.palette import INK, font
from poe2tube.render.scene_panel import STAGE_HIT_Y
from poe2tube.render.telop_style import load_presets, render_telop

# 反応の行の頭 (= 付いた瞬間) からの秒。手つきは前の行で流し終わっている (video/clip_timing.py)
HIT_START, HIT_END = 0.15, 3.0  # 付いてすぐ文字 → 声は REVEAL_LEAD 秒後 (ネタバレ防止)
CHAPTER_SECONDS = 3.0  # 章名カード。この間は声を出さない (kyohei 2026-09-30「早すぎて見えない」)
HIT_Y = STAGE_HIT_Y  # 撮影画面の下 15% の空き (ExileDesk layout=clip が空けてくれる帯)
EMPHASIS = re.compile(r"(T\d+|[+＋−-]\s?\d+(?:\.\d+)?%?|\d+(?:\.\d+)?%|\d+(?:つ|個|手目|手|枠))")
STYLE_RARITY = "textstyle010"  # 黄
STYLE_ADDED = "textstyle025"  # 赤メタリック
STYLE_REMOVED = "textstyle100"  # 青
STYLE_CHAPTER = "textstyle025"
STYLE_EMPHASIS = "textstyle033"  # 赤・3 重縁
FALLBACK = {
    "fontFamily": "Noto Sans JP Black",
    "fontSize": 100,
    "fill": {"color": "#ffe040"},
    "strokes": [{"color": "#a01010", "width": 12, "position": "outside"}],
}
RARITY_JA = {"magic": "マジックに!", "rare": "レアに!", "unique": "ユニークに!"}


def _style(name: str) -> str | dict[str, object]:
    return name if name in load_presets() else FALLBACK


@lru_cache(maxsize=1)
def emphasis_style() -> dict[str, object]:
    """強調語用: textstyle033 の塗りと縁だけ (影を外す)。影があると画像の中心が右下にずれて
    本文と高さが合わない (kyohei 2026-09-28「デカフォントだけ下にずれる」)。"""
    base = load_presets().get(STYLE_EMPHASIS)
    if not base:
        return dict(FALLBACK)
    return {**base, "shadow": {"enabled": False}, "shadows": []}


def emphasis_image(text: str, height: int) -> Image.Image:
    return _emphasis_cached(text, height)


@lru_cache(maxsize=256)
def _emphasis_cached(text: str, height: int) -> Image.Image:
    s = emphasis_style()
    base = render_telop(s, text, 1.0)
    return render_telop(s, text, max(0.1, height / max(1, base.height)))


@lru_cache(maxsize=256)
def telop_image(style: str, text: str, height: int) -> Image.Image:
    """``height`` px 前後の高さに合わせて描いた透過画像 (同じ物はキャッシュ)."""
    s = _style(style)
    base = render_telop(s, text, 1.0)
    return render_telop(s, text, max(0.1, height / max(1, base.height)))


def _pop(t: float) -> float:
    """0.25 秒で 1.15 倍まで膨らんで 1 に戻る."""
    if t <= 0:
        return 0.0
    if t < 0.25:
        return 1.15 * t / 0.25
    if t < 0.4:
        return 1.15 - 0.15 * (t - 0.25) / 0.15
    return 1.0


def _paste_center(
    img: Image.Image, im: Image.Image, cx: int, cy: int, scale: float, alpha: float
) -> None:
    if scale <= 0.02 or alpha <= 0:
        return
    if scale != 1.0:
        im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))))
    if alpha < 1.0:
        im = im.copy()
        im.putalpha(im.getchannel("A").point(lambda a: int(a * alpha)))
    img.alpha_composite(im, (cx - im.width // 2, cy - im.height // 2))


def hit_label(step: StageStep) -> tuple[str, str]:
    """(文字, スタイル)。打てない / 壊れた / ユニーク → MOD の増減 → 品質・ソケット・コラプト.

    数値 (品質の上がり幅など) は出さない (kyohei 2026-09-28: 未確定の値は言わない)。
    """
    if not step.applied:
        return "使えない!", STYLE_REMOVED
    a, b = step.after, step.before
    if a.destroyed:
        return "壊れた!", STYLE_REMOVED
    if a.unique is not None and b.unique is None:
        return "ユニークに!", STYLE_ADDED
    ch = step.changed
    if ch.added:
        return "+ " + _short(ch.added[0].text_ja), STYLE_ADDED
    if ch.removed:
        return "消えた! " + _short(ch.removed[0].text_ja), STYLE_REMOVED
    if len(a.augments) > len(b.augments):  # ルーンをはめた (ExileDesk ⑰)
        return "+ " + _short(str(a.augments[-1].get("text_ja", "ルーン"))), STYLE_ADDED
    if len(a.augments) == len(b.augments) and a.augments != b.augments:
        # 置き換え・傑作のルーン: 数は同じで中身が変わる (ExileDesk ㉘)。新しい方の効き目を出す
        new = next(x for x, y in zip(a.augments, b.augments, strict=True) if x != y)
        return "+ " + _short(str(new.get("text_ja", "ルーン"))), STYLE_ADDED
    if a.disposed and not b.disposed:
        return ("解呪!" if a.disposed == "disenchant" else "サルベージ!"), STYLE_ADDED
    if a.quality > b.quality:
        return "品質アップ!", STYLE_ADDED
    if a.sockets > b.sockets:
        return "ソケット +1", STYLE_ADDED
    if (a.gem_sockets or 0) > (b.gem_sockets or 0):
        return "サポート枠が増えた!", STYLE_ADDED
    if a.corrupted and not b.corrupted:
        return "コラプト!", STYLE_REMOVED
    return "変化なし", STYLE_REMOVED


NUMBER = re.compile(r"[+＋-]?\d+(?:\.\d+)?%?")
ADDS = re.compile(r"(\d+)から(\d+)の(.+?)を(?:アタックに)?追加する")


def _short(text: str, n: int = 12) -> str:
    """MOD 文を短い名前に: 「火ダメージが22%増加する」→「火ダメージ 22%」."""
    if len(text) <= n:
        return text
    m = ADDS.fullmatch(text)  # 「14から23の火ダメージを追加する」→「火ダメージ 14〜23」
    if m:
        return f"{m.group(3)} {m.group(1)}〜{m.group(2)}"
    if "が" in text:
        head = text.split("が", 1)[0]
        if len(head) > n - 3 and "の" in head:  # 「見つかるアイテムのレアリティ」→「レアリティ」
            head = head.rsplit("の", 1)[1]
        num = NUMBER.search(text)
        short = f"{head} {num.group(0)}" if num and num.group(0) not in head else head
        if len(short) <= n + 2:
            return short
    if "が" not in text and len(text) <= n + 3:  # 「サフィックスモッド +1個」は切らない
        return text
    return text[: n - 1] + "…"


def draw_hit(img: Image.Image, step: StageStep, t: float) -> None:
    """実践パネルの中央下あたりに結果をポップ (t は行の頭からの秒)."""
    if not HIT_START <= t <= HIT_END:
        return
    text, style = hit_label(step)
    im = telop_image(style, text, 100)
    if im.width > 1100:
        im = im.resize((1100, int(im.height * 1100 / im.width)))
    fade = min(1.0, (HIT_END - t) / 0.3)
    _paste_center(img, im, img.width // 2, HIT_Y, _pop(t - HIT_START), fade)


BLUR_RADIUS = 14  # 章名カードの間の背景のぼかしの強さ (px)


def blur_bg(img: Image.Image, radius: int = BLUR_RADIUS) -> Image.Image:
    """画面全体をぼかす (章名カードの文字だけを目立たせる、kyohei 2026-09-30)."""
    return img.filter(ImageFilter.GaussianBlur(radius))


def draw_chapter(img: Image.Image, name: str, t: float) -> None:
    """章の頭に章名を大きく (半透明の帯 + ポップ + フェードアウト)."""
    if t > CHAPTER_SECONDS:
        return
    fade = min(1.0, (CHAPTER_SECONDS - t) / 0.35)
    im = telop_image(STYLE_CHAPTER, name.replace(": ", "　"), 150)
    if im.width > 1500:
        im = im.resize((1500, int(im.height * 1500 / im.width)))
    _paste_center(img, im, img.width // 2, 500, _pop(t), fade)


_SPACES = re.compile(" +")


def tight_spaces(text: str) -> str:
    """字幕の半角スペースを詰める (日本語の隣だけ。英単語どうしの間は残す).

    台本は「MOD が」「10% 増加」のように書いてあるが、字幕では「MODが」「10%増加」
    (kyohei 2026-10-04「字幕に半角スペースが多い、いらん」)。声 (VOICEVOX) には元の文を渡す。
    """

    def keep(m: re.Match[str]) -> str:
        a, b = m.string[m.start() - 1 : m.start()], m.string[m.end() : m.end() + 1]
        return m.group(0) if a.isascii() and b.isascii() else ""

    return _SPACES.sub(keep, text)


def draw_emphasis_text(img: Image.Image, text: str, center: tuple[int, int], max_w: int) -> None:
    """テロップ本文: 強調語 (数字・ティア・個数) だけ GiftCut スタイル、他は普通の文字で並べる."""
    parts = [p for p in EMPHASIS.split(text) if p]
    d = ImageDraw.Draw(img)
    size = 62
    while True:
        f = font(size)
        pieces: list[tuple[str, Image.Image | None, int]] = []
        for p in parts:
            if EMPHASIS.fullmatch(p):
                em = emphasis_image(p, int(size * 1.12))
                pieces.append((p, em, em.width + int(size * 0.08)))
            else:
                pieces.append((p, None, int(d.textlength(p, font=f))))
        total = sum(w for _, _, w in pieces)
        if total <= max_w or size <= 30:
            break
        size -= 2
    # 本文の「字の見た目の中心」に強調の中心を合わせる (anchor の基準線とはずれる)
    top, bottom = d.textbbox((0, 0), "あ漢", font=f, anchor="lm")[1::2]
    ink_cy = int(center[1] + (top + bottom) / 2)
    x = center[0] - total // 2
    for p, piece, w in pieces:
        if piece is None:
            d.text((x, center[1]), p, font=f, fill=INK, anchor="lm")
        else:
            img.alpha_composite(piece, (x, ink_cy - piece.height // 2))
        x += w


def countdown_number(duration: float, seconds: int, t: float) -> int | None:
    """行の最後 ``seconds`` 秒で数える数字 (3→2→1)。数える前と、行の外は None."""
    start = duration - seconds
    if t < start or t >= duration:
        return None
    return seconds - int(t - start)


def draw_countdown(img: Image.Image, number: int, center: tuple[int, int], size: int = 260) -> None:
    """大きい丸に数字 (クイズのカウントダウン)."""
    d = ImageDraw.Draw(img)
    cx, cy = center
    r = size // 2
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 255, 255, 235), outline=INK, width=10)
    d.text((cx, cy), str(number), font=font(int(size * 0.62)), fill=INK, anchor="mm")
