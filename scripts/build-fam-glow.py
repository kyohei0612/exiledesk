"""
部位のタイルの光の色 (src/components/items/fam-glow.json) を絵から前もって計算する (2026-10-13)。
アプリは絵を画像パック (asset.localhost、よそのオリジン) から読むので canvas で色を読めず、全部既定の琥珀色になっていた。
計算は BaseCatalog.vue の tintGlow と同じ (24px に縮めて、明るく色の濃い画素の重み付き平均 → 明るく持ち上げる)。
タイルの絵を変えたら (FAM_UNIQUE / FAM_ART) 回し直す: python scripts/build-fam-glow.py
"""
import json, os, re
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
vue = open(os.path.join(ROOT, "src/components/items/BaseCatalog.vue"), encoding="utf-8").read()
def names(const):
    body = re.search(r"const " + const + r": Record<string, string> = \{(.*?)\};", vue, re.S).group(1)
    return re.findall(r':\s*"([^"]+)"', body)
uni = json.load(open(os.path.join(ROOT, "src/services/assets/unique-art.json"), encoding="utf-8"))
base = json.load(open(os.path.join(ROOT, "src/services/craft-stage/base-art.json"), encoding="utf-8"))
files = [("unique-art", uni[n]) for n in names("FAM_UNIQUE") if n in uni] + [("base-art", base[n]) for n in names("FAM_ART") if n in base]

out = {}
for pack, stem in files:
    im = Image.open(os.path.join(ROOT, "public", pack, stem + ".webp")).convert("RGBA").resize((24, 24), Image.BILINEAR)
    r = g = b = w = 0.0
    for R, G, B, A in im.getdata():
        if A < 128: continue
        mx, mn = max(R, G, B), min(R, G, B)
        sat = (mx - mn) / mx if mx else 0
        if mx < 60 or sat < 0.25: continue
        k = sat * (mx / 255)
        r += R * k; g += G * k; b += B * k; w += k
    if w < 1: continue
    R, G, B = r / w, g / w, b / w
    up = 235 / max(R, G, B, 1)
    out[stem] = ", ".join(str(round(min(255, x * up))) for x in (R, G, B))
p = os.path.join(ROOT, "src/components/items/fam-glow.json")
open(p, "w", encoding="utf-8").write(json.dumps(out, ensure_ascii=False, indent=1, sort_keys=True) + "\n")
print(len(files), "files ->", len(out))
