/**
 * check-coe-odds.mjs — 1 手の確率を Craft of Exile 自身の計算とエンジンで並べる (解析君、2026-10-23。外の正解との突き合わせ ④)
 *
 *   node scripts/analysis/check-coe-odds.mjs [K=50000]
 *
 * CoE: 手元の写し (data-cache/coe-beta-package_poe2.js・coe-beta-data.json、2026-10-09〜16) を vm で読み込み (_coe-load.cjs)、
 *   GameItem を作って MOD を足し、GameEmulator.exaltedParams (お告げ・最低モッドレベル・触媒の品質) → ModsManager.getFilteredModPool で
 *   「その時点で付きうる段と重み」を取り、狙いの段の重み ÷ 合計 = 正確な割合 (CoE の rollRandomAffix がこの重みで引く)。
 * エンジン: 同じアイテムを startFrom で作り、applyCurrency (本物の打つ処理) で K 回打って数えた割合 (95% の幅つき)。
 * 場面: 金の指輪 ilvl 82、右側の高貴のお告げ (+ 触媒の高貴・カタリスト 20%) + 高貴 (通常 / 上級 / 完全)。
 */
import { createRequire } from "node:module";
import { bundleEntry } from "../_bundle-ts.mjs";

const require = createRequire(import.meta.url);
const COE = require("./_coe-load.cjs");
const M = await bundleEntry("scripts/analysis/_coe-odds-entry.ts");
const K = Number(process.argv[2] ?? 50000);
const data = M.loadPatch();

// CoE の MOD の key → id
COE.run(`var __keyOf = Object.fromEntries(coedata.mods.entries.map((m) => [m.key, m.id]));`);
/** CoE: 金の指輪 (2592) に MOD (key) を足し、右側の高貴 (+ 触媒) + 高貴で付きうる重みから、狙いの key の割合 */
function coeShare(hasKeys, floor, quality, qualityType, targetKeys) {
  COE.said.length = 0;
  try { return coeRun(hasKeys, floor, quality, qualityType, targetKeys); } catch (e) { throw new Error(`CoE: ${e.message} / ${COE.said.join(" | ").slice(0, 300)}`); }
}
function coeRun(hasKeys, floor, quality, qualityType, targetKeys) {
  return COE.run(`(() => {
    const emu = new GameEmulator(true); Emulator = emu;
    const item = new GameItem(2592, 82, ${quality || 0});
    item.rarity = 3;
    ${qualityType ? `item._qualityType = ${JSON.stringify(qualityType)};` : ""}
    emu.setItem(item);
    emu.setModpool(ModsManager.categorizeModpool(ModsManager.getModpool(item._classId, true, true)));
    for (const k of ${JSON.stringify(hasKeys)}) item.addModifier(__keyOf[k]);
    const omens = ["OmenOnExaltAddSuffixes"${qualityType ? ', "OmenOnExaltConsumeQuality"' : ""}];
    const p = emu.exaltedParams(omens, ${floor ? `emu.minimumModifier(${floor})` : "new rollAffixParameters"});
    const pool = ModsManager.getFilteredModPool(emu._modpool, null, item, p);
    const want = new Set(${JSON.stringify(targetKeys)}.map((k) => String(__keyOf[k])));
    let hit = 0; for (const [id, w] of Object.entries(pool.raw)) if (want.has(String(id))) hit += w;
    return hit / pool.totalWeight;
  })()`);
}
/** エンジン: 同じ形のアイテムに打って K 回数える */
function engineShare(has, currency, catalyst, target) {
  const rng = M.mulberry32(7);
  let base = M.startFrom(data, "Gold Ring", 82, { rarity: "rare", mods: has.map((h) => ({ mod: h.mod, tier: h.tier })) }, 3);
  if (catalyst) for (let i = 0; i < 20; i++) base = M.applyCurrency(data, base, catalyst, rng, [], { oneCatalyst: true }).item;
  const omens = ["OmenofDextralExaltation", ...(catalyst ? ["OmenofCatalysingExaltation"] : [])];
  const tiers = data.mods.get(target.mod).tiers.length;
  let hit = 0;
  for (let i = 0; i < K; i++) {
    const r = M.applyCurrency(data, base, currency, rng, omens);
    if (!r.applied) throw new Error(r.reason);
    const a = r.added[0];
    if (a.modId === target.mod && a.tierIndex >= tiers - target.top) hit++;
  }
  return hit / K;
}

const R1 = { mod: "Rings/ItemFoundRarityIncrease", tier: "T1" }, C1 = { mod: "Rings/IncreasedCastSpeed", tier: "T1" };
const ORBS = [["通常", "exalt", 0], ["上級", "exalt_greater", 35], ["完全", "exalt_perfect", 50]];
const CASES = [
  { name: "キャストスピード T2+ (レアリティ T1 付き)", has: [R1], coeHas: ["ItemFoundRarityIncrease3"], target: { mod: "Rings/IncreasedCastSpeed", top: 2 }, coeT: ["CastSpeedJewellery4", "CastSpeedJewellery5"] },
  { name: "キャストスピード T2+ + 軽快 20% + 触媒の高貴", has: [R1], coeHas: ["ItemFoundRarityIncrease3"], target: { mod: "Rings/IncreasedCastSpeed", top: 2 }, coeT: ["CastSpeedJewellery4", "CastSpeedJewellery5"], cat: ["catalyst_speed", "speed"] },
  { name: "全耐性 T2+ (レアリティ T1 付き)", has: [R1], coeHas: ["ItemFoundRarityIncrease3"], target: { mod: "Rings/AllResistances", top: 2 }, coeT: ["AllResistances4", "AllResistances5"] },
  { name: "全耐性 T2+ + トゥル 20% + 触媒の高貴", has: [R1], coeHas: ["ItemFoundRarityIncrease3"], target: { mod: "Rings/AllResistances", top: 2 }, coeT: ["AllResistances4", "AllResistances5"], cat: ["catalyst_cold", "cold"] },
  { name: "レアリティ T1 (キャストスピード T1 付き)", has: [C1], coeHas: ["CastSpeedJewellery5"], target: { mod: "Rings/ItemFoundRarityIncrease", top: 1 }, coeT: ["ItemFoundRarityIncrease3"] },
];
const t0 = Date.now();
console.log(`金の指輪 ilvl 82・右側の高貴のお告げ。CoE = 重みからの正確な割合、エンジン = ${K} 回打った割合 (± は 95% の幅)`);
for (const c of CASES) {
  for (const [label, cur, floor] of ORBS) {
    const coe = coeShare(c.coeHas, floor, c.cat ? 20 : 0, c.cat?.[1] ?? null, c.coeT);
    const eng = engineShare(c.has, cur, c.cat?.[0] ?? null, c.target);
    const ci = 1.96 * Math.sqrt(eng * (1 - eng) / K);
    const d = coe ? (eng / coe - 1) * 100 : NaN;
    const inside = Math.abs(eng - coe) <= ci ? "幅の中" : "幅の外";
    console.log(`${c.name.padEnd(28)} ${label}: CoE ${(100 * coe).toFixed(3)}%  エンジン ${(100 * eng).toFixed(3)}% (±${(100 * ci).toFixed(3)})  ずれ ${d >= 0 ? "+" : ""}${d.toFixed(1)}% ${inside}`);
  }
}
console.log(`${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
