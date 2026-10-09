"""ui-art-compose.py — build-ui-art-from-client.mjs の続き: DDS を切って組み立て、webp にする (2026-10-09)

python scripts/ui-art-compose.py <DDS の置き場> <出力先>
- どの絵も右と下に 8px の余白があるので切る
- 面の枠 (LoadingScreenBorder の 8 枚) は 1 枚の 9 分割の絵にする (CSS の border-image で使う。角 = FRAME_C px)
- ボタン (左・中・右) は横に並べた 1 枚にする (border-image で左右 BTN_E px を固定、中を伸ばす)
"""
import os
import sys
from PIL import Image

src, out = sys.argv[1], sys.argv[2]


def load(name):
    im = Image.open(os.path.join(src, name + ".dds")).convert("RGBA")
    w, h = im.size
    return im.crop((0, 0, w - 8, h - 8))


def save(im, name):
    im.save(os.path.join(out, name + ".webp"), "WEBP", quality=90, method=6)


# 面の枠: 角 76 + 辺 144 + 角 76。辺は角の内側の端の帯に揃える
P = "LoadingScreenBorder"
tl, tr, bl, br = (load(P + k) for k in ("TopLeft", "TopRight", "BottomLeft", "BottomRight"))
t, b, l, r = (load(P + k) for k in ("Top", "Bottom", "Left", "Right"))
C, E = tl.size[0], t.size[0]
S = C * 2 + E
fr = Image.new("RGBA", (S, S))
# 辺の外側の端を角の外側の端に揃える (角は飾りが内へ垂れているので、内側では揃えられない)。
# 角の絵は端の 2px が空いているので、辺は角の下にも少し伸ばして先に置き、上に角を重ねる
bb = lambda im: im.getbbox()
for dx in (-8, 0, 8):
    fr.alpha_composite(t, (C + dx, bb(tl)[1] - bb(t)[1]))
    fr.alpha_composite(b, (C + dx, S - bl.size[1] + bb(bl)[3] - bb(b)[3]))
    fr.alpha_composite(l, (bb(tl)[0] - bb(l)[0], C + dx))
    fr.alpha_composite(r, (S - tr.size[0] + bb(tr)[2] - bb(r)[2], C + dx))
fr.alpha_composite(tl, (0, 0))
fr.alpha_composite(tr, (S - tr.size[0], 0))
fr.alpha_composite(bl, (0, S - bl.size[1]))
fr.alpha_composite(br, (S - br.size[0], S - br.size[1]))
save(fr, "frame")
# 枠の辺だけ (サイドバーの縁など、縦 / 横に繰り返して使う)
save(l, "edge-v")
save(t, "edge-h")
print("frame", fr.size, "corner", C)

# ボタン
for c, n in (("Generic", "btn"), ("Red", "btn-red")):
    for st, suf in (("Normal", ""), ("Hover", "-hover"), ("Pressed", "-pressed")):
        a, m, z = (load(f"Button{c}{st}{p}") for p in ("Left", "Middle", "Right"))
        h = max(a.size[1], m.size[1], z.size[1])
        im = Image.new("RGBA", (a.size[0] + m.size[0] + z.size[0], h))
        im.alpha_composite(a, (0, 0))
        im.alpha_composite(m, (a.size[0], 0))
        im.alpha_composite(z, (a.size[0] + m.size[0], 0))
        save(im, n + suf)
print("btn", im.size, "edge", a.size[0])

# そのまま使う物
for name, to in (
    ("WindowTitleBarLeft", "title-l"), ("WindowTitleBarMiddle", "title-m"), ("WindowTitleBarRight", "title-r"), ("WindowTitleBarCenterPiece", "title-c"),
    ("FourDividerYellow", "divider"),
    ("SelectionBorderTopLeft", "sel-tl"), ("SelectionBorderTopRight", "sel-tr"), ("SelectionBorderBottomLeft", "sel-bl"), ("SelectionBorderBottomRight", "sel-br"),
    ("HeaderLeft", "head-l"), ("HeaderRight", "head-r"), ("CosmeticStanderItemFrame", "item-frame"),
    ("ggg_concept_currencyexchange_tabbutton_available", "tab"), ("ggg_concept_currencyexchange_tabbutton_hovered", "tab-hover"),
    ("ggg_concept_currencyexchange_tabbutton_selected", "tab-on"), ("ggg_concept_currencyexchange_tabbutton_unavailable", "tab-off"),
    ("ggg_concept_currencyexchange_itemslot", "slot"), ("ggg_concept_currencyexchange_itemslot_selected", "slot-on"),
    ("VerticalSeparator", "sep-v"), ("sidefilter_selected", "side-on"),
):
    im = load(name)
    save(im, to)
    print(to, im.size)

# サイドバーのアイコン
for k, to in (("HeaderIconTrade", "currency"), ("HeaderIconFriend", "trade"), ("HeaderIconAchievement", "vaal"), ("HeaderIconShop", "craft"),
              ("HeaderIconCharacter", "dps"), ("HeaderIconPassive", "pob"), ("HeaderIconCosmetics", "mtx"), ("HeaderAltasPoint", "stage"), ("HeaderAltasMap", "settings")):
    save(load(k), "nav-" + to)
    save(load(k + "Hover"), "nav-" + to + "-on")
print("nav icons")
