/**
 * boots-res-ev.mjs — 移動速度 T1 をフラクチャーした靴に元素耐性 T1 を 2 つ (火・冷気・雷のどれか 2 つ) を、カオス・消去・高貴だけでエンジンに打たせる (解析君、2026-10-23)。
 * 結果は docs/org/math/notes/2026-10-23-boots-res.md。ツリーで同じ打ち方を組んだ物は check-tree-run.mjs boots
 *
 *   [POLICY=full|any] [BUDGET=2000] node scripts/analysis/boots-res-ev.mjs [N=300] [SEED=1]
 *
 * 打つのは全部エンジンの入口 (applyCurrency)。台本は次の手を決めるだけ (nextMove)。
 * ベース: ドレイクスキンブーツ (Drakeskin Boots、レベル 80・器用 108、回避の靴の一番上。置き場 Boots_dex)、ilvl 82。靴はカタリスト不可。
 * 始め: 移動速度 T1 (MovementVelocity の 6 段目、MOD レベル 82) をフラクチャー + 上級の高貴 1 個の乱数の MOD (費用 0)。
 * 狙い (サフィックス): 火・冷気・雷の耐性 T1 (MOD レベル 82) のどれか 2 つ。プレフィックスは何でもよい。
 * 打ち方: 狙いが無い → カオス。POLICY=full (既定): サフィックスが埋まって (外れ 2 つ) 狙いが 1 つ → 消去 (お告げ無し)。POLICY=any: 外れのサフィックスが 1 つでもあれば消去。
 *   それ以外 → 右側の高貴 + 上級の高貴。
 */
import { bundleEntry } from "../_bundle-ts.mjs";

const M = await bundleEntry("scripts/analysis/_tree-run-entry.ts");
const N = Number(process.argv[2] ?? 300);
const SEED = Number(process.argv[3] ?? 1);
const POLICY = process.env.POLICY ?? "full";
const BUDGET = Number(process.env.BUDGET ?? 2000);
const LIMIT = 20000;
const data = M.loadPatch();

// 自分のサーバーの /boot.json (2026-10-20 16:00Z、高貴建て、神 = 696.93)。check-tree-run.mjs と同じ値
const PRICES = { chaos: 71.892, annul: 313.204, exalt_greater: 13.383, OmenofDextralExaltation: 35.576, divine: 696.929 };
const DIV = PRICES.divine;
const BASE = "Drakeskin Boots";
const MS = "Boots_dex/MovementVelocity";
const RES = ["Boots_dex/FireResistance", "Boots_dex/ColdResistance", "Boots_dex/LightningResistance"];
const fam = (id) => data.mods.get(id).family;
const isTarget = (m) => RES.some((id) => (m.modId === id || m.family === fam(id)) && m.tierIndex === data.mods.get(m.modId).tiers.length - 1);
const held = (it) => it.suffixes.filter(isTarget).length;

function start(rng) {
  const it = M.startFrom(data, BASE, 82, { rarity: "rare", mods: [{ mod: MS, tier: "T1", fractured: true }] }, Math.floor(rng() * 2 ** 31));
  return M.applyCurrency(data, it, "exalt_greater", rng).item;
}

function nextMove(it) {
  const got = held(it);
  if (got >= 2) return null;
  if (!got) return { kind: "chaos" };
  const junk = it.suffixes.filter((m) => !m.fractured && !isTarget(m)).length;
  if (POLICY === "any" ? junk >= 1 : junk >= 2) return { kind: "annul" };
  return { kind: "exalt" };
}

const costOf = (n) => Object.entries(n).reduce((a, [k, v]) => a + (PRICES[k] ?? 0) * v, 0) / DIV;

function runOne(rng) {
  let it = start(rng);
  const n = {};
  let steps = 0, lostAll = 0;
  const use = (cur, omens = []) => {
    const r = M.applyCurrency(data, it, cur, rng, omens);
    if (!r.applied) throw new Error(`${cur} が打てない: ${r.reason}`);
    n[cur] = (n[cur] ?? 0) + 1;
    for (const o of r.omensUsed ?? []) n[o] = (n[o] ?? 0) + 1;
    it = r.item;
  };
  for (let mv = nextMove(it); mv; mv = nextMove(it)) {
    if (++steps > LIMIT || (BUDGET > 0 && costOf(n) > BUDGET)) return { done: false, n, lostAll };
    const before = held(it);
    if (mv.kind === "chaos") use("chaos");
    else if (mv.kind === "annul") use("annul");
    else use("exalt_greater", ["OmenofDextralExaltation"]);
    if (before > 0 && held(it) === 0) lostAll++;
  }
  return { done: true, n, lostAll };
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const q = (xs, p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
const t0 = Date.now();
const rng = M.mulberry32(SEED);
const rs = Array.from({ length: N }, () => runOne(rng));
const done = rs.filter((r) => r.done);
const costs = done.map((r) => costOf(r.n)).sort((a, b) => a - b);
const spent = rs.reduce((a, r) => a + costOf(r.n), 0);
const m = mean(costs), se = Math.sqrt(mean(costs.map((c) => (c - m) ** 2)) / (costs.length || 1));
console.log(`=== 靴 (移動速度 T1 フラクチャー) + 元素耐性 T1 × 2 / 消去 ${POLICY} (${N} 人, ${((Date.now() - t0) / 1000).toFixed(0)} 秒, 打ち止め ${BUDGET} 神)`);
console.log(`完成 ${(100 * done.length / N).toFixed(1)}%  1 個あたり ${(spent / (done.length || NaN)).toFixed(2)} 神  完成した人の平均 ${m.toFixed(2)} (±${(1.96 * se).toFixed(2)})  中央 ${q(costs, 0.5).toFixed(1)}  90% ${q(costs, 0.9).toFixed(1)}`);
for (const k of ["chaos", "annul", "exalt_greater", "OmenofDextralExaltation"]) {
  const c = mean(done.map((r) => r.n[k] ?? 0));
  console.log(`  ${k.padEnd(28)} ${c.toFixed(2).padStart(9)} 個  ${(c * PRICES[k] / DIV).toFixed(2).padStart(8)} 神`);
}
console.log(`  狙いが全部消えた ${mean(done.map((r) => r.lostAll)).toFixed(2)} 回`);
