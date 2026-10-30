/**
 * cost-spread.mjs — 1 人ごとの費用 (神) の分かれ方を数える (計算係、2026-10-31)。ブログ「クラフトの費用と運」用。結果は docs/org/math/notes/2026-10-31-cost-spread.md
 *
 *   [EX=A,B] [BUDGET=2000] node scripts/analysis/cost-spread.mjs [N=10000] [SEED_A=1] [SEED_B=7]
 *
 * 打つのは全部エンジンの入口 (applyCurrency)。台本は次の手を決めるだけ。手の決め方は下の 2 本の写し (直す時は元と揃える)。
 *   例 A: gold-ring-midway-ev.mjs の FIRST=fresh (金の指輪のサフィックス 3 つ、打ち方 C、見本の始めから。値段 /boot.json 2026-10-21T17:00Z)。
 *   例 B: boots-res-ev.mjs の POLICY=full (靴の元素耐性 T1 × 2。値段 _ev-common.mjs の PRICES = /boot.json 2026-10-20 16:00Z)。
 * 出す物: 平均・分位 (25/50/75/90/95/99%)・一番高い人・打ち止めの人数・予算 (平均の 0.5〜3 倍) の中で完成する割合・費用の帯ごとの人数。
 */
import { bundleEntry } from "../_bundle-ts.mjs";
import { costOf as costIn, counter, mean, PRICES as PRICES_B, q } from "./_ev-common.mjs";

const M = await bundleEntry("scripts/analysis/_gold-ring-entry.ts");
const N = Number(process.argv[2] ?? 10000);
const SEED_A = Number(process.argv[3] ?? 1);
const SEED_B = Number(process.argv[4] ?? 7);
const BUDGET = Number(process.env.BUDGET ?? 2000);
const LIMIT = 20000;
const data = M.loadPatch();

// ---------- 例 A: 金の指輪 (gold-ring-midway-ev.mjs の写し、fresh + 打ち方 C) ----------
const PRICES_A = {
  divine: 807.074, chaos: 82.021, annul: 347.359, exalt: 1, exalt_greater: 13.380, exalt_perfect: 2297.037,
  OmenofDextralExaltation: 28.895, OmenofCatalysingExaltation: 31.261, OmenofDextralAnnulment: 10673.080, OmenofWhittling: 11035.036,
  catalyst_speed: 125.366, catalyst_cold: 15.305,
};
const SD = data.mods.get("Rings/Special_genesis_tree_caster_SpellDamage");
const ID = { R: "Rings/ItemFoundRarityIncrease", C: "Rings/IncreasedCastSpeed", A: "Rings/AllResistances" };
const DOWN = { R: 1, C: 2, A: 2 };
const CAT = { C: "catalyst_speed", A: "catalyst_cold" };
const need = (k, m) => m.modId === ID[k] && m.tierIndex >= data.mods.get(ID[k]).tiers.length - DOWN[k];
const has = (it, k) => it.suffixes.some((m) => need(k, m));
const isAim = (m) => ["R", "C", "A"].some((k) => need(k, m));
const blocked = (it, k) => it.suffixes.some((m) => m.modId === ID[k] && !need(k, m));

function freshRing(rng) {
  const it = M.startFrom(data, "Gold Ring", 82, { rarity: "rare" }, Math.floor(rng() * 2 ** 31));
  return M.applyCurrency(data, M.withMod(it, { ...M.makeStageMod(SD, "prefix", SD.tiers.length - 2, rng), fractured: true }), "exalt", rng).item;
}
function nextRing(it) {
  const got = ["R", "C", "A"].filter((k) => has(it, k));
  if (got.length === 3) return null;
  if (!got.length) return { kind: "chaos" };
  if (it.suffixes.length >= 3 || it.suffixes.some((m) => !isAim(m))) return { kind: "annul" };
  if (!has(it, "R") && !blocked(it, "R")) return { kind: "plain" };
  const open = ["C", "A"].filter((k) => !has(it, k) && !blocked(it, k));
  return open.length ? { kind: "cat", aim: open[0] } : { kind: "annul" };
}
function runRing(rng) {
  let it = freshRing(rng);
  const n = {};
  const apply = counter(M, data, n);
  const use = (cur, omens = [], hint = {}) => { it = apply(it, cur, rng, omens, hint).item; };
  let steps = 0;
  for (let mv = nextRing(it); mv; mv = nextRing(it)) {
    if (++steps > LIMIT || (BUDGET > 0 && costIn(n, PRICES_A) > BUDGET)) return { done: false, n };
    if (mv.kind === "chaos") use("chaos");
    else if (mv.kind === "annul") use("annul");
    else if (mv.kind === "plain") use("exalt_greater", ["OmenofDextralExaltation"]);
    else {
      const cat = CAT[mv.aim];
      while (!(it.qualityTag === cat.slice(9) && it.quality >= 20)) use(cat, [], { oneCatalyst: true });
      use("exalt_perfect", ["OmenofCatalysingExaltation", "OmenofDextralExaltation"]);
    }
  }
  return { done: true, n };
}

// ---------- 例 B: 靴 (boots-res-ev.mjs の写し、POLICY=full) ----------
const MS = "Boots_dex/MovementVelocity";
const RES = ["Boots_dex/FireResistance", "Boots_dex/ColdResistance", "Boots_dex/LightningResistance"];
const fam = (id) => data.mods.get(id).family;
const isTarget = (m) => RES.some((id) => (m.modId === id || m.family === fam(id)) && m.tierIndex === data.mods.get(m.modId).tiers.length - 1);
const held = (it) => it.suffixes.filter(isTarget).length;
function startBoots(rng) {
  const it = M.startFrom(data, "Drakeskin Boots", 82, { rarity: "rare", mods: [{ mod: MS, tier: "T1", fractured: true }] }, Math.floor(rng() * 2 ** 31));
  return M.applyCurrency(data, it, "exalt_greater", rng).item;
}
function nextBoots(it) {
  const got = held(it);
  if (got >= 2) return null;
  if (!got) return { kind: "chaos" };
  const junk = it.suffixes.filter((m) => !m.fractured && !isTarget(m)).length;
  return junk >= 2 ? { kind: "annul" } : { kind: "exalt" };
}
function runBoots(rng) {
  let it = startBoots(rng);
  const n = {};
  const apply = counter(M, data, n);
  const use = (cur, omens = []) => { it = apply(it, cur, rng, omens).item; };
  let steps = 0;
  for (let mv = nextBoots(it); mv; mv = nextBoots(it)) {
    if (++steps > LIMIT || (BUDGET > 0 && costIn(n, PRICES_B) > BUDGET)) return { done: false, n };
    if (mv.kind === "chaos") use("chaos");
    else if (mv.kind === "annul") use("annul");
    else use("exalt_greater", ["OmenofDextralExaltation"]);
  }
  return { done: true, n };
}

// ---------- 集計 ----------
const pct = (a, b) => `${(100 * a / b).toFixed(1)}%`;
function report(name, rs, prices) {
  const all = rs.map((r) => costIn(r.n, prices)).sort((a, b) => a - b);
  const done = rs.filter((r) => r.done);
  const dc = done.map((r) => costIn(r.n, prices)).sort((a, b) => a - b);
  const m = mean(dc), sd = Math.sqrt(mean(dc.map((c) => (c - m) ** 2)));
  const perItem = all.reduce((a, b) => a + b, 0) / (done.length || NaN);
  console.log(`\n=== ${name}`);
  console.log(`完成 ${done.length} / ${rs.length} 人 (打ち止め ${rs.length - done.length} 人)  1 個あたり ${perItem.toFixed(2)} 神`);
  console.log(`完成した人: 平均 ${m.toFixed(2)} 神 (±${(1.96 * sd / Math.sqrt(dc.length)).toFixed(2)}、標準偏差 ${sd.toFixed(1)})  一番安い ${dc[0].toFixed(2)}  一番高い ${dc.at(-1).toFixed(1)}`);
  console.log(`分位 (完成した人): ${[0.25, 0.5, 0.75, 0.9, 0.95, 0.99].map((p) => `${p * 100}% ${q(dc, p).toFixed(1)} (${(q(dc, p) / m).toFixed(2)} 倍)`).join("  ")}`);
  // 予算の中で完成 = 完成していて、かかった額が予算以下 (分母は全員)
  console.log(`予算の中で完成 (全員が分母): ${[0.5, 1, 1.5, 2, 3].map((x) => `${x} 倍 (${(x * m).toFixed(0)} 神) ${pct(dc.filter((c) => c <= x * m).length, rs.length)}`).join("  ")}`);
  const bands = [[0, 0.5], [0.5, 1], [1, 2], [2, 3], [3, Infinity]];
  console.log(`帯 (完成した人、平均の倍): ${bands.map(([a, b]) => { const k = dc.filter((c) => c >= a * m && c < b * m).length; return `${a}〜${b === Infinity ? "" : b} ${k} 人 (${pct(k, dc.length)})`; }).join("  ")}`);
  console.log(`平均より安い人 ${pct(dc.filter((c) => c < m).length, dc.length)}`);
}

const t0 = Date.now();
console.log(`${N} 人・打ち止め ${BUDGET} 神・種 A ${SEED_A} / B ${SEED_B}`);
const EX = (process.env.EX ?? "A,B").split(",");
if (EX.includes("A")) {
  const rng = M.mulberry32(SEED_A);
  report(`例 A 金の指輪 サフィックス 3 つ / 打ち方 C / 見本の始めから (seed ${SEED_A})`, Array.from({ length: N }, () => runRing(rng)), PRICES_A);
}
if (EX.includes("B")) {
  const rng = M.mulberry32(SEED_B);
  report(`例 B 靴 移動速度 T1 フラクチャー + 元素耐性 T1 × 2 / POLICY=full (seed ${SEED_B})`, Array.from({ length: N }, () => runBoots(rng)), PRICES_B);
}
console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
