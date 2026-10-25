# 分析用の記録の動向 (2026-10-10、2026-10-19 に来た・PV・流れ・チュートリアル・スパムシミュレーターを足した)
#   python scripts/analyze-logs.py data-cache/logs/2026-10-15.jsonl data-cache/logs/2026-10-16.jsonl ...   (data-cache/logs/*.jsonl でも可)
# 記録の取り出し: node scripts/pull-logs.mjs <日付> ... (鍵が無ければ wrangler で D1 を読む)。1 行 = 届いた 1 まとまり {at, country, b: {app, v, uid, sid, dev, recs}}
# 記録の中身はメモ analytics-logs (visit・screen・emu_use・aim_odds / aim_roll・emu_spam / emu_spam_share・routes_calc / routes_shared・tutorial・pwa・gem_corrupt・ブログの screen "blog:<slug>:<言語>"・blog_share)
import collections, glob, json, statistics, sys
from datetime import datetime, timedelta, timezone

sys.stdout.reconfigure(encoding="utf-8")
AS_JSON = "--json" in sys.argv  # 数字だけを JSON で (scripts/daily-summary.mjs が日ごとに比べる、2026-10-21)
if AS_JSON: print = lambda *a, **k: None
paths = [p for a in ([a for a in sys.argv[1:] if a != "--json"] or ["data-cache/logs/*.jsonl"]) for p in sorted(glob.glob(a))]
JST = timezone(timedelta(hours=9))
rows = []
for p in paths:
    for l in open(p, encoding="utf-8"):
        l = l.strip()
        if l:
            rows.append(json.loads(l))

def top(c, n=12): return ", ".join(f"{k} {v}" for k, v in c.most_common(n))
def pct(a, b): return f"{a / b * 100:.0f}%" if b else "—"
def avg(xs): return f"{statistics.mean(xs):.2f}" if xs else "—"
def med(xs): return statistics.median(xs) if xs else "—"
def ver(v):
    try: return int(str(v).split(".")[2])
    except Exception: return 0
cls = lambda m: m.split("/")[0]

# ---- 訪問 (sid) ごとにまとめる (同じ訪問が何回かに分けて届く) ----
recs = collections.defaultdict(list)  # 記録の種類 → [記録 + uid/sid/dev/v]
sess = {}
for x in rows:
    b = x["b"]
    if b.get("app") not in (None, "web"):
        continue
    sid = b.get("sid") or f"{b.get('uid')}:{x.get('at')}"
    s = sess.setdefault(sid, {"uid": b.get("uid"), "dev": b.get("dev"), "v": b.get("v"), "country": x.get("country"), "visit": None, "visits": 0, "screens": [], "uses": 0, "rare": False, "t0": None})
    for r in b.get("recs", []):
        r = {**r, "uid": b.get("uid"), "sid": sid, "dev": b.get("dev"), "v": b.get("v")}
        recs[r["k"]].append(r)
        s["t0"] = min(s["t0"] or r["t"], r["t"])
        if r["k"] == "visit": s["visit"] = r["d"]; s["visits"] += 1
        elif r["k"] == "screen": s["screens"].append(r["d"].get("to", ""))
        elif r["k"] == "emu_use":
            s["uses"] += 1
            if r["d"].get("rarity") == "rare" or "rare" in str(r["d"].get("useJa", "")): s["rare"] = s["rare"] or r["d"].get("rarity") == "rare"
sessions = [s for s in sess.values() if s["visit"] or s["screens"] or s["uses"]]
days = sorted({datetime.fromtimestamp(s["t0"] / 1000, JST).strftime("%m-%d") for s in sessions if s["t0"]})
print(f"読んだ: {len(paths)} ファイル・{len(rows)} まとまり / 訪問 {len(sessions)}・人 {len({s['uid'] for s in sessions})} / 日 {', '.join(days)}")

# ---- 来た (入口・どこから・初めてか・また来たか) ----
print("\n== 来た")
vis = [s["visit"] for s in sessions if s["visit"]]
print(f"訪問の記録 {len(vis)} / 初めて {pct(sum(1 for v in vis if v.get('first')), len(vis))}")
print("入口:", top(collections.Counter(v.get("entry") for v in vis), 10))
print("どこから (ref):", top(collections.Counter(v.get("ref") for v in vis), 10))
print("国:", top(collections.Counter(s["country"] for s in sessions), 8))
print("端末:", dict(collections.Counter(s["dev"] for s in sessions)))
uid_days = collections.defaultdict(set)
for s in sessions:
    if s["t0"]: uid_days[s["uid"]].add(datetime.fromtimestamp(s["t0"] / 1000, JST).date())
multi = sum(1 for d in uid_days.values() if len(d) >= 2)
print(f"また来た (2 日以上来た人): {multi} / {len(uid_days)} ({pct(multi, len(uid_days))})")

# ---- PV (広告の枠を出し直すページ。来た 1 回 + ページを移った回数) ----
print("\n== PV (来た 1 回 + ページを移った回数)")
# 静的なページ (ブログ・コスメティック) は 1 ページ開くたびに visit + screen (scripts/_blog-client.js・_pv-client.js)
STATIC = ("blog:", "cosmetics:")
PAGE = lambda to: to in ("picker", "guide", "feedback", "routes", "craft", "spam") or to.startswith(("course:",) + STATIC)
# 静的なページは 1 ページ開くたびに visit + screen "blog:<slug>:<言語>" / "cosmetics:<まとめ>:<言語>"、溜めて送るので 1 つの sid に何ページも入る。その visit は screen の側で数える (2026-10-21、コスメは 10-25)
def pv(s):
    blog = sum(1 for t in s["screens"] if t.startswith(STATIC))
    return (1 if s["visits"] > blog or not blog else 0) + sum(1 for t in s["screens"] if PAGE(t))
for name, lo, hi in (("〜0.1.572 (ページの作りの前。参考: 前はページを移っても広告を出し直さない)", 0, 573), ("0.1.573〜579 (クラフトへ戻るは数えていない)", 573, 580), ("0.1.580〜", 580, 10**6)):
    xs = [s for s in sessions if lo <= ver(s["v"]) < hi]
    if not xs: continue
    per_user = collections.defaultdict(int)
    for s in xs: per_user[s["uid"]] += pv(s)
    print(f"{name}: 訪問 {len(xs)} / PV / 訪問 平均 {avg([pv(s) for s in xs])}・真ん中 {med([pv(s) for s in xs])} / PV / 人 {avg(list(per_user.values()))}"
          f" (PC {avg([pv(s) for s in xs if s['dev'] == 'pc'])}・スマホ {avg([pv(s) for s in xs if s['dev'] == 'mobile'])})")
print("画面の切り替え:", top(collections.Counter("course" if t.startswith("course:") else "blog" if t.startswith("blog:") else "cosmetics" if t.startswith("cosmetics:") else t for s in sessions for t in s["screens"]), 15))

# ---- コスメティックの静的なページ (2026-10-25〜。画面名 cosmetics:<まとめ>:<言語>、一覧は cosmetics:index:<言語>。アプリの一覧 ?page=skins は "skins") ----
cosm = [r for r in recs["screen"] if str(r["d"].get("to", "")).startswith("cosmetics:")]
if cosm:
    print(f"\n== コスメティック: PV {len(cosm)} / 人 {len({r['uid'] for r in cosm})}", top(collections.Counter(r["d"]["to"][10:] for r in cosm), 20))

# ---- ブログ (2026-10-21〜。画面名 blog:<slug>:<言語>、一覧は blog:index:<言語>) ----
blog = [r for r in recs["screen"] if str(r["d"].get("to", "")).startswith("blog:")]
if blog:
    print(f"\n== ブログ: PV {len(blog)} / 人 {len({r['uid'] for r in blog})} / 日本語 {sum(1 for r in blog if r['d']['to'].endswith(':ja'))}・英語 {sum(1 for r in blog if r['d']['to'].endswith(':en'))}")
    arts = collections.defaultdict(lambda: collections.Counter())
    for r in blog:
        slug, _, lang = r["d"]["to"][5:].rpartition(":")
        arts[slug][lang] += 1
    for slug, c in sorted(arts.items(), key=lambda kv: -sum(kv[1].values())):
        print(f"  {slug}: {sum(c.values())} (" + "・".join(f"{l} {n}" for l, n in sorted(c.items())) + ")")
    bv = [r["d"] for r in recs["visit"] if str(r["d"].get("entry", "")).startswith("path:/") and "/blog" in str(r["d"].get("path", ""))]
    print("ブログへどこから (ref):", top(collections.Counter(v.get("ref") for v in bv), 8))
    print(f"シェアを押した: {len(recs['blog_share'])}", top(collections.Counter(r["d"].get("to") for r in recs["blog_share"]), 5))

# ---- 流れ (訪問のうち、どこまで進んだか) ----
print("\n== 流れ (訪問のうち。段はそれぞれ別に数える: 少ない手でレアになる人もいる)")
n = len(sessions)
steps = [
    ("来た", n),
    ("1 手打った", sum(1 for s in sessions if s["uses"] >= 1)),
    ("レアまで", sum(1 for s in sessions if s["rare"])),
    ("10 手以上", sum(1 for s in sessions if s["uses"] >= 10)),
    ("50 手以上", sum(1 for s in sessions if s["uses"] >= 50)),
]
print(" → ".join(f"{k} {v} ({pct(v, n)})" for k, v in steps))
for dev in ("pc", "mobile"):
    xs = [s for s in sessions if s["dev"] == dev]
    print(f"  {dev}: 訪問 {len(xs)} / 1 手打った {pct(sum(1 for s in xs if s['uses'] >= 1), len(xs))} / 1 訪問の手 (真ん中) {med([s['uses'] for s in xs])}")
nouse = [s for s in sessions if s["uses"] == 0]
print("打たずに帰った訪問の画面:", top(collections.Counter("(なし)" if not s["screens"] else ">".join(s["screens"][:3]) for s in nouse), 8))

# ---- 1 手 (エミュレーター) ----
uses = recs["emu_use"]
print(f"\n== 1 手 (エミュレーター): {len(uses)} 手 / 人 {len({u['uid'] for u in uses})} / 訪問 {len({u['sid'] for u in uses})}")
if uses:
    per_uid = collections.Counter(u["uid"] for u in uses)
    v = sorted(collections.Counter(u["sid"] for u in uses).values())
    print(f"1 訪問あたりの手: 中央値 {statistics.median(v)}・上位 1 割 {v[int(len(v) * .9)]}・最大 {v[-1]}")
    print("1 人あたりの手の分布:", {k: sum(1 for x in per_uid.values() if lo <= x < hi) for k, (lo, hi) in {"1-9": (1, 10), "10-49": (10, 50), "50-199": (50, 200), "200-999": (200, 1000), "1000+": (1000, 10**9)}.items()})
    print("端末 (手の数):", dict(collections.Counter(u["dev"] for u in uses)))
    hours = collections.Counter(datetime.fromtimestamp(u["t"] / 1000, JST).hour for u in uses)
    print("時間帯 (JST):", " ".join(f"{h}時{hours.get(h, 0)}" for h in range(24) if hours.get(h)))
    base_cls = collections.Counter()
    for u in uses:
        mods = (u["d"].get("before") or []) + (u["d"].get("added") or [])
        base_cls[cls(mods[0]) if mods else "?"] += 1
    print("部位 (手の数):", top(base_cls))
    print("ベース (人数):", top(collections.Counter(b for b, _ in {(u['d'].get('base'), u['uid']) for u in uses})))
    print("アイテムレベル:", top(collections.Counter(u["d"].get("ilvl") for u in uses), 6))
    print("打った物 (手):", top(collections.Counter(u["d"].get("use") for u in uses), 20))
    print("打った物 (人数):", top(collections.Counter(k for k, _ in {(u["d"].get("use"), u["uid"]) for u in uses}), 20))
    print("お告げ (手):", top(collections.Counter(o for u in uses for o in (u["d"].get("omens") or [])), 15))
    print(f"お告げを使った手: {pct(sum(1 for u in uses if u['d'].get('omens')), len(uses))}")
    fail = [u for u in uses if not u["d"].get("ok")]
    print(f"打てなかった手: {len(fail)} ({pct(len(fail), len(uses))})", top(collections.Counter(u["d"].get("use") for u in fail), 8))
    # 理由は 2026-10-19 の朝の出し直し (v0.1.581、版は上げていない) から記録に入る。前は空
    print("打てなかった理由 (10-19 の朝〜):", top(collections.Counter(str(u["d"].get("reason"))[:40] for u in fail if u["d"].get("reason")), 8) or "(まだ無い)")
    first = {}
    for u in sorted(uses, key=lambda u: u["t"]): first.setdefault(u["sid"], u["d"].get("use"))
    print("訪問の最初の 1 手:", top(collections.Counter(first.values()), 10))
    last = {}
    for u in sorted(uses, key=lambda u: u["t"]): last[u["sid"]] = u["d"]
    print("訪問の最後のレアリティ:", dict(collections.Counter(d.get("rarity") for d in last.values())))
    print("訪問の最後の MOD の数:", dict(sorted(collections.Counter(len((d.get("before") or [])) + len(d.get("added") or []) - len(d.get("removed") or []) for d in last.values()).items())))
    per_sid_cost = collections.defaultdict(float)
    for u in uses: per_sid_cost[u["sid"]] += u["d"].get("cost") or 0
    c = sorted(per_sid_cost.values())
    print(f"1 訪問で使った額 (高貴): 中央値 {statistics.median(c):.0f}・上位 1 割 {c[int(len(c) * .9)]:.0f}・最大 {c[-1]:.0f}")

# ---- 次の手で狙う ----
aims_o, aims_r = recs["aim_odds"], recs["aim_roll"]
print(f"\n== 次の手で狙う: 確率を見た {len(aims_o)} 回 ({len({a['uid'] for a in aims_o})} 人)、そのまま回した {len(aims_r)} 回 ({len({a['uid'] for a in aims_r})} 人)")
if aims_r: print("狙った打ち方:", top(collections.Counter(a["d"].get("combo") for a in aims_r), 6))

# ---- スパムシミュレーター (0.1.578〜。旧カオススパム計算機の記録は route が無い) ----
print("\n== スパムシミュレーター")
opened = [s for s in sessions if "routes" in s["screens"]]
print(f"開いた訪問 {len(opened)} ({len({s['uid'] for s in opened})} 人)")
calc = recs["routes_calc"]
if calc:
    print(f"計算: {len(calc)} 回 (最後まで {sum(1 for c in calc if c['d'].get('done'))}・中止 {sum(1 for c in calc if not c['d'].get('done'))})、人数 {top(collections.Counter(c['d'].get('n') for c in calc), 3)}")
    print("一番安かった道:", top(collections.Counter(c["d"].get("best") for c in calc), 9))
    print("ルーンを嵌めた計算:", sum(1 for c in calc if c["d"].get("runes")))
spam = recs["emu_spam"]
new = [x for x in spam if x["d"].get("route")]
print(f"運試しで付いた / 止めた: {len(new)} 回 ({len({x['uid'] for x in new})} 人)、道 {top(collections.Counter(x['d'].get('route') for x in new), 3)} (旧計算機 {len(spam) - len(new)} 回)")
print(f"シェアを押した: {len(recs['emu_spam_share'])} / シェアから開いた: {len(recs['routes_shared'])}")

# ---- チュートリアル・そのほか ----
tut = recs["tutorial"]
if tut:
    st = collections.Counter(t["d"].get("c") for t in tut if t["d"].get("e") == "start")
    # 終えたの記録は "topic:<id>"、始めたは "<id>" (craft-lesson.ts と craft-topic.ts で付け方が違う)。頭を外して合わせる
    cl = collections.Counter(str(t["d"].get("c")).removeprefix("topic:") for t in tut if t["d"].get("e") == "clear")
    print("\n== チュートリアル (始めた / 終えた):", ", ".join(f"{c} {st[c]}/{cl.get(c, 0)}" for c, _ in st.most_common(12)))
print(f"\nPWA の記録 {len(recs['pwa'])} / ジェムコラプト {len(recs['gem_corrupt'])} / シミュレーション (開発版だけ) {len(recs['sim_run'])}")

if AS_JSON:
    scr = collections.Counter("course" if t.startswith("course:") else t for s in sessions for t in s["screens"] if not t.startswith(STATIC))
    sys.stdout.write(json.dumps({
        "visits": len(sessions), "people": len({s["uid"] for s in sessions}),
        "pv": sum(pv(s) for s in sessions), "pv_pc": sum(pv(s) for s in sessions if s["dev"] == "pc"), "pv_mobile": sum(pv(s) for s in sessions if s["dev"] == "mobile"),
        "first": sum(1 for s in sessions if (s["visit"] or {}).get("first")), "ref": dict(collections.Counter(v.get("ref") for v in vis).most_common(8)),
        "screens": dict(scr.most_common()), "blog": dict(collections.Counter(r["d"]["to"][5:] for r in blog).most_common()),
        "cosmetics": dict(collections.Counter(r["d"]["to"][10:] for r in cosm).most_common()),
        "uses": len(uses), "users": len({u["uid"] for u in uses}), "used_visits": sum(1 for s in sessions if s["uses"]),
    }, ensure_ascii=False) + "\n")
