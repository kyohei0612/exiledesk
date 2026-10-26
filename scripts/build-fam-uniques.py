"""
今日のユニーク (ベース選びの部位のタイル、2026-10-26 夜オーナー「ランダムにしようか、それぞれのユニーク。飽きるでしょ」「1 日ごとに変える、9 時」) の表を作る。
src/components/items/fam-uniques.json = { 部位: [[ユニークの英語名, "R,G,B" (色の取れない絵は "")], …] }
  - 部位ごとの候補 = BaseCatalog.vue の FAM_UNIQUE の 1 つと同じ種類 (vaal-enchants.json の cls) のユニークで、絵 (public/unique-art) のある物
  - 光の色は build-fam-glow.py と同じ計算 (24px に縮めて、明るく色の濃い画素の重み付き平均 → 明るく持ち上げる)。画面では色を計算しない
ユニークの絵・FAM_UNIQUE が変わったら回し直す: python scripts/build-fam-uniques.py
"""
import json, os, re
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
vue = open(os.path.join(ROOT, "src/components/items/BaseCatalog.vue"), encoding="utf-8").read()
body = re.search(r"const FAM_UNIQUE: Record<string, string> = \{(.*?)\};", vue, re.S).group(1)
seed = dict(re.findall(r'(\S+?):\s*"([^"]+)"', body))
uni = json.load(open(os.path.join(ROOT, "src/i18n/vaal-enchants.json"), encoding="utf-8"))["uniques"]
art = json.load(open(os.path.join(ROOT, "src/services/assets/unique-art.json"), encoding="utf-8"))


def glow(stem):
    im = Image.open(os.path.join(ROOT, "public/unique-art", stem + ".webp")).convert("RGBA").resize((24, 24), Image.BILINEAR)
    r = g = b = w = 0.0
    for R, G, B, A in im.getdata():
        if A < 128: continue
        mx, mn = max(R, G, B), min(R, G, B)
        sat = (mx - mn) / mx if mx else 0
        if mx < 60 or sat < 0.25: continue
        k = sat * (mx / 255)
        r += R * k; g += G * k; b += B * k; w += k
    if w < 1: return None
    R, G, B = r / w, g / w, b / w
    up = 235 / max(R, G, B, 1)
    return ", ".join(str(round(min(255, x * up))) for x in (R, G, B))


fams, colors = {}, {}
for fam, en in seed.items():
    cls = uni.get(en, {}).get("cls")
    names = sorted(n for n, v in uni.items() if v.get("cls") == cls and n in art) if cls else []
    if en in art and en not in names: names.append(en)
    for n in names:
        if n not in colors: colors[n] = (glow(art[n]) or "").replace(" ", "")
    fams[fam] = [[n, colors[n]] for n in names]
p = os.path.join(ROOT, "src/components/items/fam-uniques.json")
open(p, "w", encoding="utf-8").write(json.dumps(fams, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n")
print(sum(len(v) for v in fams.values()), "件 大きさ", os.path.getsize(p))
