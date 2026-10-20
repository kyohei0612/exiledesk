/**
 * mana-ring-ev.mjs — マナ系の金の指輪 (ilvl 82) を打ち方 C (外れはすぐ消去) でエンジンに打たせ、平均費用・完成率・個数を出す (解析君、2026-10-21)。
 * 結果は docs/org/math/notes/2026-10-21-mana-ring-ev.md。材料 docs/org/research/notes/2026-10-21-mana-ring-mods.md
 *
 *   [ROUTE=after|first] [ORB=exalt|exalt_greater|exalt_perfect] [BUDGET=2000] [PROBE=1] node scripts/analysis/mana-ring-ev.mjs [N=300] [SEED=1]
 *
 * 打つのは全部エンジンの入口 (applyCurrency)。台本は「次にどの手を打つか」(nextMove) だけ。
 * 始め: プレフィックスにスペルのマナコスト効率 T1 (計算高い、創生の樹、重み 0 → makeStageMod で置く) をフラクチャー + 高貴 1 個の乱数の MOD (費用 0)。
 * 狙い P: 最大マナ % (精神のパーフェクトエッセンス) E / 最大マナ T1 (藍色をした) MT。S: キャストスピード T2+ C / 全耐性 T1 A / マナ自動回復レート T1 N。
 * ROUTE=after (エッセンス後): 狙いが 1 つも無い → カオス。サフィックスを C → A → N の順に カタリスト 20% + 触媒の高貴 + 右側の高貴 + 完全の高貴。
 *   揃ったら E (餌 + 左側の結晶化 + 精神のパーフェクトエッセンス) → MT (神経 20% + 触媒の高貴 + 左側の高貴 + 完全の高貴)。
 * ROUTE=first (エッセンス先): E が無ければ何より先に E。あとは同じ (E があるのでカオスは打たない)。
 * 外れ (狙いでないサフィックス・プレフィックス、狙いの系統の低い段も) が付いたら、すぐ消去 (お告げ無し)。ただし E が無い時の外れのプレフィックスはエッセンスの餌に使う。
 * 消去は E も巻き込む (非固定の MOD から等しく 1 つ)。E が消えたら、その時の決まりで E を入れ直す (after はサフィックスが揃ってから)。
 */
import { bundleEntry } from "../_bundle-ts.mjs";

const M = await bundleEntry("scripts/analysis/_gold-ring-entry.ts");
const N = Number(process.argv[2] ?? 300);
const SEED = Number(process.argv[3] ?? 1);
const ROUTE = process.env.ROUTE ?? "after";
const BUDGET = Number(process.env.BUDGET ?? 2000);
/** ORB=exalt|exalt_greater|exalt_perfect: カタリスト無し版 (オーナー 10-21)。触媒の高貴・カタリストを使わず、素の右側 / 左側の高貴 + その高貴で狙う */
const ORB = process.env.ORB ?? null;
const LIMIT = 20000;
const data = M.loadPatch();

// 自分のサーバーの /boot.json (2026-10-20 16:00Z、Forbidden Rites、高貴建て。神 = 696.93)
const PRICES = {
  chaos: 71.892, annul: 313.204, exalt: 1, exalt_greater: 13.383, exalt_perfect: 2045.741, divine: 696.929,
  OmenofDextralExaltation: 35.576, OmenofSinistralExaltation: 85.830, OmenofCatalysingExaltation: 33.189, OmenofSinistralCrystallisation: 298.594,
  catalyst_speed: 152.338, catalyst_cold: 13.655, catalyst_mana: 12.102, ESS: 26.500,
};
const DIV = PRICES.divine;
const ESS = "essence:perfect:Rings/PerfectEssence_MaximumManaIncreasePercent";
const SMCE = data.mods.get("Rings/Special_genesis_tree_caster_SpellManaCostEfficiency");

const T = {
  E: { id: "Rings/PerfectEssence_MaximumManaIncreasePercent", side: "prefix", down: 1 },
  MT: { id: "Rings/IncreasedMana", side: "prefix", down: 1, cat: "catalyst_mana" },
  C: { id: "Rings/IncreasedCastSpeed", side: "suffix", down: 2, cat: "catalyst_speed" },
  A: { id: "Rings/AllResistances", side: "suffix", down: 1, cat: "catalyst_cold" },
  N: { id: "Rings/ManaRegeneration", side: "suffix", down: 1, cat: "catalyst_mana" },
};
const KEYS = Object.keys(T);
const SUF = ["C", "A", "N"];
const need = (k, m) => m.modId === T[k].id && m.tierIndex >= data.mods.get(m.modId).tiers.length - T[k].down;
const isTarget = (m) => KEYS.some((k) => need(k, m));
const has = (it, k) => [...it.prefixes, ...it.suffixes].some((m) => need(k, m));
const nonF = (it) => [...it.prefixes, ...it.suffixes].filter((m) => !m.fractured);

function start(rng) {
  let it = M.startFrom(data, "Gold Ring", 82, { rarity: "rare" }, Math.floor(rng() * 2 ** 31));
  it = M.withMod(it, { ...M.makeStageMod(SMCE, "prefix", SMCE.tiers.length - 1, rng), fractured: true });
  return M.applyCurrency(data, it, "exalt_greater", rng).item;
}

function nextMove(it) {
  const got = KEYS.filter((k) => has(it, k));
  if (got.length === KEYS.length) return null;
  if (ROUTE === "first" && !has(it, "E")) return { kind: "ess" };
  if (!got.length) return { kind: "chaos" };
  if (it.suffixes.some((m) => !isTarget(m))) return { kind: "annul" };
  const sMiss = SUF.filter((k) => !has(it, k));
  if (sMiss.length) return { kind: "cat", aim: sMiss[0] };
  if (!has(it, "E")) return { kind: "ess" };
  if (it.prefixes.some((m) => !m.fractured && !isTarget(m))) return { kind: "annul" };
  return { kind: "cat", aim: "MT" };
}

function runOne(rng) {
  let it = start(rng);
  const n = {};
  let steps = 0, lostAll = 0, eLost = 0;
  const use = (cur, omens = [], hint = {}) => {
    const r = M.applyCurrency(data, it, cur, rng, omens, hint);
    if (!r.applied) throw new Error(`${cur} が打てない: ${r.reason}`);
    const key = cur === ESS ? "ESS" : cur;
    n[key] = (n[key] ?? 0) + 1;
    for (const o of r.omensUsed ?? []) n[o] = (n[o] ?? 0) + 1;
    it = r.item;
    return r;
  };
  for (let mv = nextMove(it); mv; mv = nextMove(it)) {
    if (++steps > LIMIT || (BUDGET > 0 && costOf(n) > BUDGET)) return { done: false, n, lostAll, eLost };
    const before = KEYS.filter((k) => has(it, k)).length, hadE = has(it, "E");
    if (mv.kind === "chaos") use("chaos");
    else if (mv.kind === "annul") use("annul");
    else if (mv.kind === "ess") {
      const free = nonF(it);
      // 非固定の MOD が外れ 1 つだけなら素で打つ (それが消える)。それ以外は左側の結晶化でプレフィックスだけ消す。消してよいプレフィックスが無ければ餌を足す
      if (free.length === 1 && !isTarget(free[0])) use(ESS);
      else {
        const bait = it.prefixes.filter((m) => !m.fractured && !need("MT", m));
        if (!bait.length) use("exalt_greater", ["OmenofSinistralExaltation"]);
        use(ESS, ["OmenofSinistralCrystallisation"]);
      }
    } else {
      const t = T[mv.aim];
      const sideOmen = t.side === "prefix" ? "OmenofSinistralExaltation" : "OmenofDextralExaltation";
      if (ORB) use(ORB, [sideOmen]);
      else {
        while (!(it.qualityTag === t.cat.slice(9) && it.quality >= 20)) use(t.cat, [], { oneCatalyst: true });
        use("exalt_perfect", ["OmenofCatalysingExaltation", sideOmen]);
      }
    }
    const after = KEYS.filter((k) => has(it, k)).length;
    if (before > 0 && after === 0) lostAll++;
    if (hadE && !has(it, "E")) eLost++;
  }
  return { done: true, n, lostAll, eLost };
}

function costOf(n) {
  return Object.entries(n).reduce((a, [k, v]) => a + (PRICES[k] ?? 0) * v, 0) / DIV;
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const q = (xs, p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];

/** PROBE=1: 1 手の当たりの割合 (フラクチャー + 最大マナ % だけの状態から、カタリスト 20% + 触媒の高貴 + 側の高貴 + 完全の高貴を N 回) */
if (process.env.PROBE) {
  const rng = M.mulberry32(SEED);
  const base = () => { let it = start(rng); it = { ...it, prefixes: it.prefixes.filter((m) => m.fractured), suffixes: [] }; return M.applyCurrency(data, M.withMod(it, M.makeStageMod(data.mods.get(T.MT.id), "prefix", 0, rng)), ESS, rng).item; };
  for (const k of ["C", "A", "N", "MT"]) {
    let hit = 0;
    for (let i = 0; i < N; i++) {
      let it = base();
      for (let j = 0; j < 20; j++) it = M.applyCurrency(data, it, T[k].cat, rng, [], { oneCatalyst: true }).item;
      const r = M.applyCurrency(data, it, "exalt_perfect", rng, ["OmenofCatalysingExaltation", T[k].side === "prefix" ? "OmenofSinistralExaltation" : "OmenofDextralExaltation"]);
      if (!r.applied) throw new Error(r.reason);
      if (has(r.item, k)) hit++;
    }
    console.log(`${k}: ${(100 * hit / N).toFixed(2)}%`);
  }
  process.exit(0);
}

const t0 = Date.now();
const rng = M.mulberry32(SEED);
const rs = Array.from({ length: N }, () => runOne(rng));
const done = rs.filter((r) => r.done);
const costs = done.map((r) => costOf(r.n)).sort((a, b) => a - b);
const spent = rs.reduce((a, r) => a + costOf(r.n), 0);
const m = mean(costs), se = Math.sqrt(mean(costs.map((c) => (c - m) ** 2)) / (costs.length || 1));
console.log(`=== ROUTE ${ROUTE} / ${ORB ? `カタリスト無し ${ORB}` : "カタリストあり 完全"} (${N} 人, ${((Date.now() - t0) / 1000).toFixed(0)} 秒, 打ち止め ${BUDGET} 神)`);
console.log(`完成 ${(100 * done.length / N).toFixed(1)}%  1 個あたり ${(spent / (done.length || NaN)).toFixed(2)} 神  完成した人の平均 ${m.toFixed(2)} (±${(1.96 * se).toFixed(2)})  中央 ${q(costs, 0.5).toFixed(1)}  90% ${q(costs, 0.9).toFixed(1)}`);
const keys = ["chaos", "annul", "exalt", "exalt_perfect", "exalt_greater", "ESS", "OmenofDextralExaltation", "OmenofSinistralExaltation", "OmenofCatalysingExaltation", "OmenofSinistralCrystallisation", "catalyst_speed", "catalyst_cold", "catalyst_mana"];
for (const k of keys) {
  const c = mean(done.map((r) => r.n[k] ?? 0));
  console.log(`  ${k.padEnd(32)} ${c.toFixed(2).padStart(9)} 個  ${(c * (PRICES[k] ?? 0) / DIV).toFixed(2).padStart(8)} 神`);
}
console.log(`  狙いが全部消えた ${mean(done.map((r) => r.lostAll)).toFixed(2)} 回  最大マナ % が消えた (消去・結晶化で) ${mean(done.map((r) => r.eLost)).toFixed(2)} 回`);
