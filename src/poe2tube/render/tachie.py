"""立ち絵: 坂本アヒル氏 PSD のレイヤーを感情 + 口の開きで切り替えて PNG にする (キャッシュ付き).

PSD の描画は 1 枚 2〜3 秒かかるので、(キャラ, 感情, 口) ごとに ``cache/tachie/`` へ PNG を置く。
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image
from psd_tools import PSDImage
from psd_tools.api.layers import Group, Layer

from poe2tube.config.settings import REPO_ROOT
from poe2tube.script.model import Emotion, Speaker

CHAR_DIR = REPO_ROOT / "assets" / "characters"
CACHE_DIR = REPO_ROOT / "cache" / "tachie"
MOUTH_LEVELS = (0, 1, 2)

# (グループ名, 選ぶ子の名前)。子はレイヤーでもグループでもよい (兄弟は非表示にする)
Selection = list[tuple[str, str]]


@dataclass(frozen=True)
class CharSpec:
    psd: Path
    fixed: Selection
    emotions: dict[Emotion, Selection]
    mouths: dict[int, str]
    mouth_group: str = "!口"
    # 感情ごとの「閉じ口」の差し替え (待機顔をムッとさせないため。無ければ mouths[0])
    closed_mouth: dict[Emotion, str] = field(default_factory=dict)


ZUNDAMON = CharSpec(
    psd=CHAR_DIR / "zundamon/ずんだもん立ち絵素材V3.2/ずんだもん立ち絵素材V3.2_基本版.psd",
    fixed=[
        ("!右腕", "*基本"),
        ("!左腕", "*基本"),
        ("!顔色", "*ほっぺ基本"),
        ("!枝豆", "*枝豆通常"),
    ],
    emotions={
        "normal": [("!眉", "*基本眉2"), ("!目", "*基本目")],
        "troubled": [("!眉", "*困り眉"), ("!目", "*基本目↑")],
        "surprised": [("!眉", "*上がり眉"), ("!目", "*〇〇")],
        "happy": [("!眉", "*基本眉2"), ("!目", "*にっこり")],
        "proud": [("!眉", "*基本眉2"), ("!目", "*細め目")],
        "sad": [("!眉", "*困り眉"), ("!目", "*UU")],
    },
    mouths={0: "*ん", 1: "*ほう", 2: "*ほあ"},
    # 待機・機嫌のいい時は口を「むふ」(候補 C、2026-09-27 kyohei 指示で待機顔を柔らかく)
    closed_mouth={"normal": "*むふ", "happy": "*えへ", "proud": "*にやり"},
)
METAN = CharSpec(
    psd=CHAR_DIR / "metan/四国めたん立ち絵素材2.1/四国めたん立ち絵素材2.1.psd",
    fixed=[("!右腕", "*普通"), ("!左腕", "*普通"), ("!顔色", "*普通2")],
    emotions={
        "normal": [("!眉", "*太眉ごきげん"), ("!目", "*目セット"), ("!黒目", "*カメラ目線")],
        "troubled": [("!眉", "*こまり"), ("!目", "*目セット"), ("!黒目", "*目そらし")],
        "surprised": [("!眉", "*太眉ごきげん"), ("!目", "*目セット"), ("*目セット", "*見開き白目")],
        "happy": [("!眉", "*ごきげん"), ("!目", "*目閉じ")],
        "proud": [("!眉", "*太眉ごきげん"), ("!目", "*目セット"), ("!黒目", "*カメラ目線2")],
        "sad": [("!眉", "*こまり"), ("!目", "*目閉じ2")],
    },
    mouths={0: "*ほほえみ", 1: "*お", 2: "*わあー"},
)
SPECS: dict[Speaker, CharSpec] = {"zundamon": ZUNDAMON, "metan": METAN}


def _find_group(psd: PSDImage, name: str) -> Group:
    for layer in psd.descendants():
        if isinstance(layer, Group) and layer.name == name:
            return layer
    raise KeyError(f"グループ {name!r} が PSD に無い")


def _select(psd: PSDImage, group_name: str, chosen: str, siblings_off: bool = True) -> None:
    group = _find_group(psd, group_name)
    group.visible = True
    hit = False
    for child in group:
        child_layer: Layer = child
        if child_layer.name == chosen:
            child_layer.visible = True
            hit = True
        elif siblings_off:
            child_layer.visible = False
    if not hit:
        raise KeyError(f"{group_name} に {chosen!r} が無い")


def _apply(psd: PSDImage, selection: Selection) -> None:
    for group_name, chosen in selection:
        # 目セット内の白目だけ切り替える時は兄弟 (黒目グループ) を消さない
        _select(psd, group_name, chosen, siblings_off=not chosen.endswith("白目"))


def render_tachie(speaker: Speaker, emotion: Emotion, mouth: int, height: int) -> Image.Image:
    """立ち絵 1 枚 (RGBA)。キャッシュがあればそれを返す."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache = CACHE_DIR / f"{speaker}_{emotion}_m{mouth}_h{height}.png"
    if cache.exists():
        try:
            return Image.open(cache).convert("RGBA")
        except OSError:  # 書きかけ (並べて作る別のプロセスが書いている途中) → 自分で描く
            pass
    spec = SPECS[speaker]
    psd = PSDImage.open(spec.psd)
    _apply(psd, spec.fixed)
    _apply(psd, spec.emotions[emotion])
    mouth_layer = spec.mouths[mouth]
    if mouth == 0:
        mouth_layer = spec.closed_mouth.get(emotion, mouth_layer)
    _select(psd, spec.mouth_group, mouth_layer)
    img = psd.composite(force=True).convert("RGBA")
    img = img.resize((int(img.width * height / img.height), height), Image.Resampling.LANCZOS)
    # 並べて作るとほかのプロセスが同じ絵を読むので、別の名前で書き切ってから付け替える
    tmp = cache.with_name(f"{cache.stem}.{os.getpid()}.tmp.png")
    img.save(tmp)
    try:
        os.replace(tmp, cache)
    except OSError:  # Windows: ほかのプロセスが開いている (もう出来ている) → 自分の分は捨てる
        tmp.unlink(missing_ok=True)
    return img


def warm_cache(height: int) -> int:
    """全キャラ × 感情 × 口をまとめて描いてキャッシュ。描いた枚数を返す."""
    n = 0
    for speaker, spec in SPECS.items():
        for emotion in spec.emotions:
            for mouth in MOUTH_LEVELS:
                render_tachie(speaker, emotion, mouth, height)
                n += 1
    return n
