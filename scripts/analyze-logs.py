# 分析用の記録 (data-cache/logs/*.jsonl) の動向 (2026-10-10)。python scripts/analyze-logs.py [ファイル]
# 記録の取り出し: server/live の D1 (exiledesk-logs) を wrangler d1 execute で書き出した物 / scripts/pull-logs.mjs の物
import collections, json, statistics, sys
from datetime import datetime, timedelta, timezone

sys.stdout.reconfigure(encoding="utf-8")
path = sys.argv[1] if len(sys.argv) > 1 else "data-cache/logs/all-2026-10-10.jsonl"
JST = timezone(timedelta(hours=9))
rows = [json.loads(l) for l in open(path, encoding="utf-8")]
uses, aims_o, aims_r, sims = [], [], [], []
for x in rows:
    b = x["b"]
    for r in b.get("recs", []):
        r = {**r, "uid": b.get("uid"), "sid": b.get("sid"), "dev": b.get("dev")}
        {"emu_use": uses, "aim_odds": aims_o, "aim_roll": aims_r, "sim_run": sims}.get(r["k"], []).append(r)

def top(c, n=12): return ", ".join(f"{k} {v}" for k, v in c.most_common(n))
def pct(a, b): return f"{a / b * 100:.0f}%" if b else "—"
cls = lambda m: m.split("/")[0]

print(f"記録 {len(uses)} 手 / 人 {len({u['uid'] for u in uses})} / 訪問 {len({u['sid'] for u in uses})}")
per_uid = collections.Counter(u["uid"] for u in uses)
per_sid = collections.Counter(u["sid"] for u in uses)
v = sorted(per_sid.values())
print(f"1 訪問あたりの手: 中央値 {statistics.median(v)}・上位 1 割 {v[int(len(v) * .9)]}・最大 {v[-1]}")
print("1 人あたりの手の分布:", {k: sum(1 for x in per_uid.values() if lo <= x < hi) for k, (lo, hi) in {"1-9": (1, 10), "10-49": (10, 50), "50-199": (50, 200), "200-999": (200, 1000), "1000+": (1000, 10**9)}.items()})
dev = collections.Counter(u["dev"] for u in uses)
print("端末 (手の数):", dict(dev))

# 時間帯 (日本時間、手の数)
hours = collections.Counter(datetime.fromtimestamp(u["t"] / 1000, JST).hour for u in uses)
print("時間帯 (JST):", " ".join(f"{h}時{hours.get(h, 0)}" for h in range(24) if hours.get(h)))

# 何を作っているか
base_cls = collections.Counter()
for u in uses:
    mods = (u["d"].get("before") or []) + (u["d"].get("added") or [])
    base_cls[cls(mods[0]) if mods else "?"] += 1
print("部位 (手の数):", top(base_cls))
print("ベース (人数):", top(collections.Counter(b for b, _ in {(u['d'].get('base'), u['uid']) for u in uses})))
print("アイテムレベル:", top(collections.Counter(u["d"].get("ilvl") for u in uses), 6))

# 何を打っているか
use = collections.Counter(u["d"].get("use") for u in uses)
print("打った物 (手):", top(use, 20))
users_by_use = collections.Counter(k for k, _ in {(u["d"].get("use"), u["uid"]) for u in uses})
print("打った物 (人数):", top(users_by_use, 20))
om = collections.Counter(o for u in uses for o in (u["d"].get("omens") or []))
print("お告げ (手):", top(om, 15))
print(f"お告げを使った手: {pct(sum(1 for u in uses if u['d'].get('omens')), len(uses))}")
fail = [u for u in uses if not u["d"].get("ok")]
print(f"打てなかった手: {len(fail)} ({pct(len(fail), len(uses))})", top(collections.Counter(u["d"].get("use") for u in fail), 8))
print("打てなかった理由:", top(collections.Counter(str(u["d"].get("reason", ""))[:40] for u in fail), 8))

# 最初の 1 手 (訪問ごと) と、どこまで進んだか
first = {}
for u in sorted(uses, key=lambda u: u["t"]): first.setdefault(u["sid"], u["d"].get("use"))
print("訪問の最初の 1 手:", top(collections.Counter(first.values()), 10))
rar = collections.Counter()
last = {}
for u in sorted(uses, key=lambda u: u["t"]): last[u["sid"]] = u["d"]
for d in last.values(): rar[d.get("rarity")] += 1
print("訪問の最後のレアリティ:", dict(rar))
nmods = collections.Counter(len((d.get("before") or [])) + len(d.get("added") or []) - len(d.get("removed") or []) for d in last.values())
print("訪問の最後の MOD の数:", dict(sorted(nmods.items())))
cor = sum(1 for u in uses if u["d"].get("use") in ("vaal",))
print(f"ヴァール (コラプト): {cor} 手、{len({u['uid'] for u in uses if u['d'].get('use') == 'vaal'})} 人")

# 費用 (cost は高貴建て)
costs = [u["d"].get("cost") or 0 for u in uses]
per_sid_cost = collections.defaultdict(float)
for u in uses: per_sid_cost[u["sid"]] += u["d"].get("cost") or 0
c = sorted(per_sid_cost.values())
print(f"1 訪問で使った額 (高貴): 中央値 {statistics.median(c):.0f}・上位 1 割 {c[int(len(c) * .9)]:.0f}・最大 {c[-1]:.0f}")

# 狙う機能・シミュレーション
print(f"次の手で狙う: 確率を見た {len(aims_o)} 回 ({len({a['uid'] for a in aims_o})} 人)、そのまま回した {len(aims_r)} 回 ({len({a['uid'] for a in aims_r})} 人)")
print("狙った打ち方:", top(collections.Counter(a["d"].get("combo") for a in aims_r), 6))
print(f"シミュレーション: 回した {len(sims)} 回 ({len({s['uid'] for s in sims})} 人)")
