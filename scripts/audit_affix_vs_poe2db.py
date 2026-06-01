#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
audit_affix_vs_poe2db.py  (2026-06-01)
--------------------------------------------------------------
我々の prefix/suffix 分類 (RePoE 由来 mods-bundle.json の多数決) を、
poe2db の権威ラベル (ModGenerationTypeID: 1=Prefix / 2=Suffix) と全件突合し、
不一致を報告 + 修正用の override を出力する。

出力:
  src/i18n/affix-overrides.json = { "<normalizeModTemplate キー>": "P"|"S", ... }
    poe2db が単一確定している全テンプレについて、bundle と同じ nm キーで poe2db の
    affix を記録。craft-discovery-v2 が多数決より先にこれを参照して上書きする。
    (現データでは 17 件だけ我々と食い違う = それが実際の修正点。残りは no-op だが
     将来 bundle に増えた MOD も poe2db gen に追従できる)

poe2db データ源: 各カテゴリページ /us/<Cat> の埋め込み JSON。各 MOD は
  {"ModGenerationTypeID":"1|2","str":"<html>"} を normal/corrupted/... 配列に持つ。

突合キー = common_norm (両者を「表示テキスト+数値#化」へ)。
出力キー = normalize_mod_template (TS craft-discovery-v2 と完全一致、[Tag|表示] 保持)。
"""
import io, json, re, sys, os, time, urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "data-cache")
BUNDLE = os.path.join(ROOT, "src", "i18n", "mods-bundle.json")
OUT = os.path.join(ROOT, "src", "i18n", "affix-overrides.json")
BASE = "https://poe2db.tw"
UA = {"User-Agent": "ExileDesk/0.1 affix-audit (+https://github.com/kyohei0612/exiledesk)"}
DELAY = 1.0
REFRESH = "--refresh" in sys.argv
WRITE = "--write" in sys.argv
GROUPS = ["normal", "corrupted", "desecrated", "delve", "essence", "veiled"]
CATEGORIES = ["Rings","Amulets","Belts","Quivers","Shields","Bucklers","Helmets","Boots",
    "Gloves","Body_Armours","Foci","Jewels","Charms","Relics","Life_Flasks","Mana_Flasks",
    "Two_Hand_Swords","One_Hand_Swords","Two_Hand_Maces","One_Hand_Maces","Two_Hand_Axes",
    "One_Hand_Axes","Daggers","Claws","Sceptres","Staves","Quarterstaves","Wands","Bows",
    "Crossbows","Spears","Flails"]

def strip_html(s):
    s = re.sub(r"<br\s*/?>", " ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = (s.replace("&nbsp;"," ").replace("&amp;","&").replace("&lt;","<").replace("&gt;",">")
           .replace("&#39;","'").replace("&quot;",'"'))
    return s

def normalize_mod_template(text):
    """craft-discovery-v2.ts の normalizeModTemplate と完全一致 ([Tag|表示] は保持)。"""
    s = text
    s = re.sub(r"[—–]", "-", s)
    s = re.sub(r"\(-?\d+(?:\.\d+)?-{1}-?\d+(?:\.\d+)?\)", "#", s)
    s = re.sub(r"\(-?\d+(?:\.\d+)?\)", "#", s)
    s = re.sub(r"-?\d+(?:\.\d+)?", "#", s)
    return s.strip()

def common_norm(text):
    """poe2db(表示テキスト) と bundle([Tag|表示]) を同じ比較キーへ落とす。"""
    s = text
    s = re.sub(r"\[([^\]|]+)\|([^\]]+)\]", r"\2", s)   # [Tag|表示] -> 表示
    s = re.sub(r"\[([^\]]+)\]", r"\1", s)               # [単独] -> 単独
    s = s.replace("—", "-").replace("–", "-")
    s = re.sub(r"\((?:\+|-)?\d+(?:\.\d+)?\s*-\s*(?:\+|-)?\d+(?:\.\d+)?\)", "#", s)
    s = re.sub(r"\((?:\+|-)?\d+(?:\.\d+)?\)", "#", s)
    s = re.sub(r"(?<![\w#])[-+]?\d+(?:\.\d+)?", "#", s)
    s = re.sub(r"#(\s*-\s*#)+", "#", s)
    s = re.sub(r"\+#", "#", s)  # 先頭符号除去 (common_norm を3スクリプトで一致させる)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def fetch(cat):
    p = os.path.join(CACHE, f"poe2db_{cat}_us.html")
    if not REFRESH and os.path.exists(p):
        return open(p, encoding="utf-8", errors="replace").read()
    url = f"{BASE}/us/{cat}"
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=30) as r:
            html = r.read().decode("utf-8", "replace")
        os.makedirs(CACHE, exist_ok=True)
        open(p, "w", encoding="utf-8").write(html)
        time.sleep(DELAY)
        return html
    except Exception as e:
        print(f"  fetch fail {cat}: {e}", file=sys.stderr)
        return open(p, encoding="utf-8", errors="replace").read() if os.path.exists(p) else None

def parse_poe2db(html):
    """{common_norm key: set('P'/'S')}"""
    dec = json.JSONDecoder()
    out = {}
    for grp in GROUPS:
        for m in re.finditer(r'"%s"\s*:\s*\[' % grp, html):
            try:
                arr, _ = dec.raw_decode(html, m.end() - 1)
            except Exception:
                continue
            for mod in arr:
                if not isinstance(mod, dict): continue
                aff = {"1": "P", "2": "S"}.get(str(mod.get("ModGenerationTypeID", "")))
                if not aff: continue
                key = common_norm(strip_html(mod.get("str") or ""))
                if key:
                    out.setdefault(key, set()).add(aff)
    return out

def our_index():
    """mods-bundle を nm キーで集計 (_modBundleIndex と同等)。
    returns (our_by_nm:{nm:'P'/'S'}, nm_to_cm:{nm:cm})"""
    b = json.load(open(BUNDLE, encoding="utf-8"))
    tally, nm2cm = {}, {}
    for k, e in b.items():
        if not e or not e.get("text_en") or not e.get("type"): continue
        typ = "P" if e["type"] == "prefix" else "S"
        for line in str(e["text_en"]).split("\n"):
            line = line.strip()
            if not line: continue
            nm = normalize_mod_template(line)
            if not nm: continue
            t = tally.setdefault(nm, {"P": 0, "S": 0}); t[typ] += 1
            nm2cm.setdefault(nm, common_norm(line))
    return {nm: ("P" if t["P"] >= t["S"] else "S") for nm, t in tally.items()}, nm2cm

def main():
    print(f"=== affix 監査 + override 生成 (refresh={REFRESH}, write={WRITE}) ===")
    poe = {}
    for cat in CATEGORIES:
        html = fetch(cat)
        if html:
            for k, affs in parse_poe2db(html).items():
                poe.setdefault(k, set()).update(affs)
    ours, nm2cm = our_index()
    print(f"poe2db keys: {len(poe)} / our nm keys: {len(ours)}")

    overrides, mismatches, ambiguous = {}, [], 0
    for nm, our_aff in ours.items():
        cm = nm2cm.get(nm)
        affs = poe.get(cm)
        if not affs: continue
        if len(affs) > 1:
            ambiguous += 1; continue
        poe_aff = next(iter(affs))
        overrides[nm] = poe_aff          # poe2db 権威層 (一致分は no-op)
        if poe_aff != our_aff:
            mismatches.append((nm, our_aff, poe_aff))

    print(f"override対象(poe2db単一確定 ∩ bundle): {len(overrides)} / 曖昧(両刀): {ambiguous}")
    print(f"★ 実際に分類が変わる不一致: {len(mismatches)} 件")
    for nm, o, p in sorted(mismatches):
        print(f"  我々={o}→poe2db={p}  | {nm[:75]}")

    if WRITE:
        ordered = {k: overrides[k] for k in sorted(overrides)}
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        open(OUT, "w", encoding="utf-8").write(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n")
        print(f"\nWROTE {OUT} ({len(ordered)} entries, {len(mismatches)} が現データを修正)")
    else:
        print("\n(--write 未指定: ファイル出力なし)")

if __name__ == "__main__":
    main()
