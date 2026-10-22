/**
 * gold-ring-midway-ev.mjs — 金の指輪のサフィックスの途中の形 (オーナー 10-22 のスナップ) から、サフィックス 3 つ (レアリティ T1・キャストスピード T2+・全耐性 T2+) が揃うまでの費用を、
 * 次の手ごとに比べる (解析君、2026-10-22、ブラック 4 代目の頼み)。結果は docs/org/math/notes/2026-10-22-gold-ring-midway.md
 *
 *   node scripts/analysis/gold-ring-midway-ev.mjs [N=3000] [SEED=1]
 *
 * 今の形: 金の指輪 ilvl 82 レア、プレフィックス = スペルダメージ 33% (T2) のフラクチャーだけ、サフィックス = キャストスピード 19% (T2、狙い) + 外れ 1 つ (JUNK、既定は器用 T3)。
 * 2 手目からは見本の木 (tree-samples の gold-ring-suffix) と同じ打ち方 C: 狙い 0 → カオス、外れのサフィックス → すぐ消去 (お告げ無し)、
 *   レアリティが無い → 右側の高貴 + 上級の高貴、ある → 無い方を カタリスト 20% + 触媒の高貴 + 右側の高貴 + 完全の高貴 (キャスト = 軽快、全耐性 = トゥル)。
 * 1 手目: a = カオス (木の「始めに戻る」= 狙いが付くまでカオス)、b = 右側の消去のお告げ + 消去、b2 = 素の消去 (木の今の箱 jC の手)、
 *   c = 右側の高貴 + 上級で 3 つ目を先に付けてから外れを消す (付けた後も打ち方 C)。fresh = 新しいベースで見本の始まりから (ベース代は入れない)。
 */
import { bundleEntry } from "../_bundle-ts.mjs";
import { costOf as costIn, counter, headLine, mean, summarize } from "./_ev-common.mjs";

const M = await bundleEntry("scripts/analysis/_gold-ring-entry.ts");
const N = Number(process.argv[2] ?? 3000);
const SEED = Number(process.argv[3] ?? 1);
const BUDGET = Number(process.env.BUDGET ?? 2000);
const LIMIT = 20000;
const JUNK = process.env.JUNK ?? "Rings/Dexterity";
const data = M.loadPatch();

/** 自分のサーバーの /boot.json (2026-10-22 に取得、中の時刻 2026-10-21T17:00:49Z、高貴建て、神 = 807.07) */
const PRICES = {
  divine: 807.074, chaos: 82.021, annul: 347.359, exalt: 1, exalt_greater: 13.380, exalt_perfect: 2297.037,
  OmenofDextralExaltation: 28.895, OmenofCatalysingExaltation: 31.261, OmenofDextralAnnulment: 10673.080, OmenofWhittling: 11035.036,
  catalyst_speed: 125.366, catalyst_cold: 15.305,
};
const costOf = (n) => costIn(n, PRICES);

const SD = data.mods.get("Rings/Special_genesis_tree_caster_SpellDamage");
const ID = { R: "Rings/ItemFoundRarityIncrease", C: "Rings/IncreasedCastSpeed", A: "Rings/AllResistances" };
const DOWN = { R: 1, C: 2, A: 2 };
const CAT = { C: "catalyst_speed", A: "catalyst_cold" };
const need = (k, m) => m.modId === ID[k] && m.tierIndex >= data.mods.get(ID[k]).tiers.length - DOWN[k];
const has = (it, k) => it.suffixes.some((m) => need(k, m));
const isAim = (m) => ["R", "C", "A"].some((k) => need(k, m));
const blocked = (it, k) => it.suffixes.some((m) => m.modId === ID[k] && !need(k, m));

/** HAVE=C (スナップ) | RC | RA | CA (狙い 2 つ + 外れ 1 つでサフィックス満杯、ブラック 10-22)。JUNKT = 外れの段 (既定 T3、器用 T3 は MOD レベル 55) */
const HAVE = process.env.HAVE ?? "C";
const AIM_T = { R: "T1", C: "T2", A: "T2" };
function midway(rng) {
  const mods = [...HAVE].map((k) => ({ mod: ID[k], tier: AIM_T[k] }));
  const it = M.startFrom(data, "Gold Ring", 82, { rarity: "rare", mods: [...mods, { mod: JUNK, tier: process.env.JUNKT ?? "T3" }] }, Math.floor(rng() * 2 ** 31));
  return M.withMod(it, { ...M.makeStageMod(SD, "prefix", SD.tiers.length - 2, rng), fractured: true });
}
function fresh(rng) {
  const it = M.startFrom(data, "Gold Ring", 82, { rarity: "rare" }, Math.floor(rng() * 2 ** 31));
  return M.applyCurrency(data, M.withMod(it, { ...M.makeStageMod(SD, "prefix", SD.tiers.length - 2, rng), fractured: true }), "exalt", rng).item;
}

/** 打ち方 C (gold-ring-suffix-ev.mjs の POLICY=C、触媒に完全・素に上級) */
function nextMove(it) {
  const got = ["R", "C", "A"].filter((k) => has(it, k));
  if (got.length === 3) return null;
  if (!got.length) return { kind: "chaos" };
  if (it.suffixes.length >= 3 || it.suffixes.some((m) => !isAim(m))) return { kind: "annul" };
  if (!has(it, "R") && !blocked(it, "R")) return { kind: "plain" };
  const open = ["C", "A"].filter((k) => !has(it, k) && !blocked(it, k));
  return open.length ? { kind: "cat", aim: open[0] } : { kind: "annul" };
}

const FIRST = { a: { kind: "chaos" }, b: { kind: "dannul" }, b2: { kind: "annul" }, c: { kind: "plain" }, w: { kind: "whittle" }, fresh: null };

function runOne(rng, key) {
  let it = key === "fresh" ? fresh(rng) : midway(rng);
  const n = {};
  const apply = counter(M, data, n);
  const use = (cur, omens = [], hint = {}) => { it = apply(it, cur, rng, omens, hint).item; };
  let steps = 0;
  for (let mv = FIRST[key] ?? nextMove(it); mv; mv = nextMove(it)) {
    if (++steps > LIMIT || (BUDGET > 0 && costOf(n) > BUDGET)) return { done: false, n };
    if (mv.kind === "chaos") use("chaos");
    else if (mv.kind === "annul") use("annul");
    else if (mv.kind === "dannul") use("annul", ["OmenofDextralAnnulment"]);
    else if (mv.kind === "whittle") use("chaos", ["OmenofWhittling"]);
    else if (mv.kind === "plain") use("exalt_greater", ["OmenofDextralExaltation"]);
    else {
      const cat = CAT[mv.aim];
      while (!(it.qualityTag === cat.slice(9) && it.quality >= 20)) use(cat, [], { oneCatalyst: true });
      use("exalt_perfect", ["OmenofCatalysingExaltation", "OmenofDextralExaltation"]);
    }
  }
  return { done: true, n };
}

const t0 = Date.now();
console.log(`今の形: スペルダメージ T2 (固定) / 狙い ${HAVE} + 外れ ${JUNK} ${process.env.JUNKT ?? "T3"}。${N} 人・seed ${SEED}・打ち止め ${BUDGET} 神`);
for (const key of (process.env.FIRST ?? "a,b,b2,c,fresh").split(",")) {
  const rs = Array.from({ length: N }, ((rng) => () => runOne(rng, key))(M.mulberry32(SEED)));
  const s = summarize(rs, costOf);
  console.log(`\n=== ${key}`);
  console.log(headLine(s, N));
  const avg = (k) => mean(s.done.map((r) => r.n[k] ?? 0));
  console.log(`  カオス ${avg("chaos").toFixed(1)}  消去 ${avg("annul").toFixed(2)}  右側の消去 ${avg("OmenofDextralAnnulment").toFixed(2)}  上級 ${avg("exalt_greater").toFixed(2)}  完全 ${avg("exalt_perfect").toFixed(2)}  軽快 ${avg("catalyst_speed").toFixed(1)}  トゥル ${avg("catalyst_cold").toFixed(1)}`);
}
console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
