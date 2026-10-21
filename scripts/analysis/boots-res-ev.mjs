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
import { costOf, counter, headLine, mean, PRICES, summarize } from "./_ev-common.mjs";

const M = await bundleEntry("scripts/analysis/_tree-run-entry.ts");
const N = Number(process.argv[2] ?? 300);
const SEED = Number(process.argv[3] ?? 1);
const POLICY = process.env.POLICY ?? "full";
const BUDGET = Number(process.env.BUDGET ?? 2000);
const LIMIT = 20000;
const data = M.loadPatch();

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

function runOne(rng) {
  let it = start(rng);
  const n = {};
  let steps = 0, lostAll = 0;
  const apply = counter(M, data, n);
  const use = (cur, omens = []) => { it = apply(it, cur, rng, omens).item; };
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

const t0 = Date.now();
const rng = M.mulberry32(SEED);
const rs = Array.from({ length: N }, () => runOne(rng));
const s = summarize(rs), { done } = s;
console.log(`=== 靴 (移動速度 T1 フラクチャー) + 元素耐性 T1 × 2 / 消去 ${POLICY} (${N} 人, ${((Date.now() - t0) / 1000).toFixed(0)} 秒, 打ち止め ${BUDGET} 神)`);
console.log(headLine(s, N));
for (const k of ["chaos", "annul", "exalt_greater", "OmenofDextralExaltation"]) {
  const c = mean(done.map((r) => r.n[k] ?? 0));
  console.log(`  ${k.padEnd(28)} ${c.toFixed(2).padStart(9)} 個  ${(c * PRICES[k] / PRICES.divine).toFixed(2).padStart(8)} 神`);
}
console.log(`  狙いが全部消えた ${mean(done.map((r) => r.lostAll)).toFixed(2)} 回`);
