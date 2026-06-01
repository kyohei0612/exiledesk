#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build-mod-text-ja.py  (2026-06-01, rev2: 公式トレードスタッツ方式)
--------------------------------------------------------------
RePoE fork が日本語を全廃したため、mods-bundle の未訳 MOD を
**GGG 公式トレード API のスタッツ一覧**で補完する。

ソース (無認証 GET、単発なのでレート制限内):
  - EN: https://www.pathofexile.com/api/trade2/data/stats
  - JA: https://jp.pathofexile.com/api/trade2/data/stats   (JP realm = 日本語)
  両者は同一 stat_id をキーに持つので、id で EN↔JA を結合できる。

出力: src/i18n/mod-text-ja.json = { common_norm(EN text): JA text }
  craft-discovery / extract-mods-bundle が common_norm(text_en) で引いて
  未訳 text_ja を上書きする。トレード stat text は "#" プレースホルダ形式
  ("最大ライフ #") で、craft 側の normalizeModTemplate と整合する。

カバレッジ実測 (2026-06-01): 行単位 89% (bundle既存636 + trade101 + 残89はニッチ0.5)。
旧 poe2db スクレイプ方式は trade に対し追加2件のみで非効率なため廃止。
"""
import io, json, re, sys, os, urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "data-cache")
BUNDLE = os.path.join(ROOT, "src", "i18n", "mods-bundle.json")
OUT = os.path.join(ROOT, "src", "i18n", "mod-text-ja.json")
UA = {"User-Agent": "ExileDesk/0.1 (POE2 personal tool, +https://github.com/kyohei0612/exiledesk)"}
EN_URL = "https://www.pathofexile.com/api/trade2/data/stats"
JA_URL = "https://jp.pathofexile.com/api/trade2/data/stats"
REFRESH = "--refresh" in sys.argv
WRITE = "--write" in sys.argv

def common_norm(text):
    s = text
    s = re.sub(r"\[([^\]|]+)\|([^\]]+)\]", r"\2", s)
    s = re.sub(r"\[([^\]]+)\]", r"\1", s)
    s = s.replace("—", "-").replace("–", "-")
    s = re.sub(r"\((?:\+|-)?\d+(?:\.\d+)?\s*-\s*(?:\+|-)?\d+(?:\.\d+)?\)", "#", s)
    s = re.sub(r"\((?:\+|-)?\d+(?:\.\d+)?\)", "#", s)
    s = re.sub(r"(?<![\w#])[-+]?\d+(?:\.\d+)?", "#", s)
    s = re.sub(r"#(\s*-\s*#)+", "#", s)
    s = re.sub(r"\+#", "#", s)  # "+(range)"→"+#" の先頭符号を除去 (GGGトレードは先頭+を付けない)
    return re.sub(r"\s+", " ", s).strip()

def fetch(url, cache_name):
    p = os.path.join(CACHE, cache_name)
    if not REFRESH and os.path.exists(p):
        return json.load(open(p, encoding="utf-8"))
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        data = json.loads(r.read().decode("utf-8", "replace"))
    os.makedirs(CACHE, exist_ok=True)
    json.dump(data, open(p, "w", encoding="utf-8"), ensure_ascii=False)
    return data

def flat(stats):
    """{stat_id: text}"""
    d = {}
    for g in stats.get("result", []):
        for e in g.get("entries", []):
            if e.get("id") and e.get("text"):
                d[e["id"]] = e["text"]
    return d

def main():
    en = flat(fetch(EN_URL, "trade2-stats-en.json"))
    ja = flat(fetch(JA_URL, "trade2-stats-jp.json"))
    common = set(en) & set(ja)
    dic = {}
    for sid in common:
        jt = ja[sid]
        if not jt or jt == en[sid]:
            continue
        dic[common_norm(en[sid])] = jt
    print(f"trade stats: EN={len(en)} JA={len(ja)} 共通id={len(common)} / common_norm(EN)->JA キー={len(dic)}")

    # カバレッジ実測 (bundle 行単位)
    b = json.load(open(BUNDLE, encoding="utf-8"))
    seen = set(); have = 0; un = []
    for k, e in b.items():
        if not e or not e.get("text_en"): continue
        en_t = str(e["text_en"]); ja_t = "" if e.get("text_ja") is None else str(e["text_ja"])
        enL = [x.strip() for x in en_t.split("\n") if x.strip()]
        jaL = [x.strip() for x in ja_t.split("\n") if x.strip()] if (ja_t and ja_t != en_t) else []
        jm = len(enL) == len(jaL)
        for i, line in enumerate(enL):
            key = common_norm(line)
            if key in seen: continue
            seen.add(key)
            hasB = jm and jaL[i] and jaL[i] != line
            if hasB or key in dic: have += 1
            elif len(un) < 12: un.append(line[:62])
    print(f"bundle 行ユニーク: {len(seen)} / JA有り(bundle既存+trade): {have} ({round(100*have/len(seen))}%) / 残: {len(seen)-have}")
    print("--- 残ニッチ (全ソースに無い) ---")
    for s in un: print("  " + s)

    if WRITE:
        ordered = {k: dic[k] for k in sorted(dic)}
        json.dump(ordered, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        open(OUT, "a", encoding="utf-8").write("\n")
        print(f"\nWROTE {OUT} ({len(ordered)} entries)")
    else:
        print("\n(--write 未指定: 出力なし)")

if __name__ == "__main__":
    main()
