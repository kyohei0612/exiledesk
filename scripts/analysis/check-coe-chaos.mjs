/**
 * check-coe-chaos.mjs — カオス・消去の 1 手を Craft of Exile 自身の計算とエンジンで並べる (解析君、2026-10-23。check-coe-odds.mjs の続き)
 *
 *   node scripts/analysis/check-coe-chaos.mjs [K=50000] [SEED=7]
 *
 * CoE の処理 (写し data-cache/coe-beta-package_poe2.js の poe2_chaos・annul):
 *   消去 = フラクチャー以外の明示 MOD (右側・左側のお告げならその側だけ) から等しい確率で 1 つ消す (EmulatorManager.randomNumber)。
 *   カオス = 消去と同じく 1 つ消し → rollAffix (getFilteredModPool の重みで 1 つ足す)。上級 = 最低モッドレベル 35、完全 = 50 (getHandlerParameters)。
 *   なので正確な割合 = 消える MOD ごとに「それを外したアイテム」の getFilteredModPool の重みの割合を出し、等しく平均した物。重みは CoE のコードを vm で動かして取る (_coe-load.cjs)。
 * エンジン: 同じアイテムを startFrom で作り、applyCurrency (本物の打つ処理) で K 回打って数えた割合 (95% の幅つき)。
 * 場面: ドレイクスキンブーツ (CoE 3004) ilvl 82、移動速度 T1 フラクチャー (耐性の靴の見本と同じ形) と、金の指輪 (2592)。
 */
import { createRequire } from "node:module";
import { bundleEntry } from "../_bundle-ts.mjs";

const require = createRequire(import.meta.url);
const COE = require("./_coe-load.cjs");
const M = await bundleEntry("scripts/analysis/_coe-odds-entry.ts");
const K = Number(process.argv[2] ?? 50000);
const SEED = Number(process.argv[3] ?? 7);
const data = M.loadPatch();

COE.run(`var __keyOf = Object.fromEntries(coedata.mods.entries.map((m) => [m.key, m.id]));`);
/** CoE: アイテム (classId の id) に keys の MOD を付け、最低モッドレベル floor で付きうる重みのうち、targets の key の割合 (と、サフィックスの割合) */
function coePool(itemId, keys, floor, targets) {
  COE.said.length = 0;
  try {
    return COE.run(`(() => {
      const emu = new GameEmulator(true); Emulator = emu;
      const item = new GameItem(${itemId}, 82, 0);
      item.rarity = ItemRarity.RARE;
      emu.setItem(item);
      emu.setModpool(ModsManager.categorizeModpool(ModsManager.getModpool(item._classId, true, true)));
      for (const k of ${JSON.stringify(keys)}) item.addModifier(__keyOf[k]);
      const pool = ModsManager.getFilteredModPool(emu._modpool, null, item, ${floor ? `emu.minimumModifier(${floor})` : "new rollAffixParameters"});
      const want = new Set(${JSON.stringify(targets)}.map((k) => String(__keyOf[k])));
      const byId = Object.fromEntries(coedata.mods.entries.map((m) => [String(m.id), m]));
      let hit = 0, suf = 0;
      for (const [id, w] of Object.entries(pool.raw)) {
        if (want.has(String(id))) hit += w;
        if (DataManager.getEntryFromId(coedata.modgroups, byId[id].group)?.type == gameConstants.suffixType) suf += w;
      }
      return [hit / pool.totalWeight, suf / pool.totalWeight];
    })()`);
  } catch (e) { throw new Error(`CoE: ${e.message} / ${COE.said.join(" | ").slice(0, 300)}`); }
}
/** CoE のカオス: 消せる MOD (fixed 以外) を 1 つずつ外して平均 */
function coeChaos(c, floor) {
  const free = c.mods.filter((m) => !m.fractured);
  let hit = 0, suf = 0;
  for (const x of free) {
    const [h, s] = coePool(c.itemId, c.mods.filter((m) => m !== x).map((m) => m.coe), floor, c.coeT);
    hit += h / free.length; suf += s / free.length;
  }
  return { hit, suf };
}

/** エンジン: 同じ形のアイテムに K 回打って数える */
function engineRun(c, currency, omens = []) {
  const rng = M.mulberry32(SEED);
  const base = M.startFrom(data, c.base, 82, { rarity: "rare", mods: c.mods.map((m) => ({ mod: m.mod, tier: m.tier, ...(m.fractured ? { fractured: true } : {}) })) }, 3);
  const tgt = new Set(c.target);
  let hit = 0, suf = 0;
  const removed = {};
  for (let i = 0; i < K; i++) {
    const r = M.applyCurrency(data, base, currency, rng, omens);
    if (!r.applied) throw new Error(r.reason);
    const a = r.added?.[0];
    if (a) {
      if (tgt.has(`${a.modId}|${a.tierIndex}`)) hit++;
      if (a.side === "suffix") suf++;
    }
    for (const x of r.removed ?? []) removed[x.modId] = (removed[x.modId] ?? 0) + 1;
  }
  return { hit: hit / K, suf: suf / K, removed };
}

const ci = (p) => 1.96 * Math.sqrt(p * (1 - p) / K);
const row = (label, coe, eng) => {
  const d = coe ? (eng / coe - 1) * 100 : NaN;
  const inside = Math.abs(eng - coe) <= ci(eng) ? "幅の中" : "幅の外";
  console.log(`  ${label.padEnd(26)} CoE ${(100 * coe).toFixed(3)}%  エンジン ${(100 * eng).toFixed(3)}% (±${(100 * ci(eng)).toFixed(3)})  ずれ ${d >= 0 ? "+" : ""}${d.toFixed(1)}% ${inside}`);
};

/** CoE の置き場 (そのアイテムに付きうる key、ilvl 82) */
const poolKeys = {};
function keysOf(itemId) {
  return (poolKeys[itemId] ??= COE.run(`(() => {
    const emu = new GameEmulator(true); Emulator = emu;
    const item = new GameItem(${itemId}, 82, 0); item.rarity = ItemRarity.RARE; emu.setItem(item);
    emu.setModpool(ModsManager.categorizeModpool(ModsManager.getModpool(item._classId, true, true)));
    const byId = Object.fromEntries(coedata.mods.entries.map((m) => [String(m.id), m.key]));
    return Object.keys(ModsManager.getFilteredModPool(emu._modpool, null, item, new rollAffixParameters).raw).map((id) => byId[id]);
  })()`));
}
/** エンジンの MOD と CoE の key (その置き場の中で段の数が同じ事を確かめてから、T1 = 一番大きい番号) */
function mod(itemId, id, tier, coeGroup, opt = {}) {
  const n = data.mods.get(id).tiers.length;
  const t = Number(tier.slice(1));
  const keys = keysOf(itemId).filter((k) => new RegExp(`^${coeGroup}\\d+_?$`).test(k)).sort((a, b) => parseInt(a.slice(coeGroup.length)) - parseInt(b.slice(coeGroup.length)));
  if (keys.length !== n) throw new Error(`${id}: 段の数がエンジン ${n} / CoE ${keys.length}`);
  return { mod: id, tier, coe: keys[n - t], tierIndex: n - t, ...opt };
}

const MS = mod(3004, "Boots_dex/MovementVelocity", "T1", "MovementVelocity", { fractured: true });
const F1 = mod(3004, "Boots_dex/FireResistance", "T1", "FireResist");
const C1 = mod(3004, "Boots_dex/ColdResistance", "T1", "ColdResist");
const L1 = mod(3004, "Boots_dex/LightningResistance", "T1", "LightningResist");
const LIFE = mod(3004, "Boots_dex/IncreasedLife", "T3", "IncreasedLife");
const DEX = mod(3004, "Boots_dex/Dexterity", "T2", "Dexterity");
const SHOCK = mod(3004, "Boots_dex/ReducedShockDuration", "T1", "ReducedShockDuration");
const bootsT = { target: [C1, L1].map((m) => `${m.mod}|${m.tierIndex}`), coeT: [C1.coe, L1.coe] };
const CASES = [
  { name: "靴: 移動速度 T1 (固定)・火 T1・ライフ T3・器用 T2 → 冷気か雷の T1", itemId: 3004, base: "Drakeskin Boots", mods: [MS, F1, LIFE, DEX], ...bootsT },
  { name: "靴: サフィックス埋まり (火 T1・器用 T2・感電 T1) → 冷気か雷の T1", itemId: 3004, base: "Drakeskin Boots", mods: [MS, F1, LIFE, DEX, SHOCK], ...bootsT },
  { name: "靴: 移動速度 T1 (固定)・器用 T2 だけ → 火・冷気・雷の T1", itemId: 3004, base: "Drakeskin Boots", mods: [MS, DEX], target: [F1, C1, L1].map((m) => `${m.mod}|${m.tierIndex}`), coeT: [F1.coe, C1.coe, L1.coe] },
];
const R1 = mod(2592, "Rings/ItemFoundRarityIncrease", "T1", "ItemFoundRarityIncrease");
const CS1 = mod(2592, "Rings/IncreasedCastSpeed", "T1", "CastSpeedJewellery");
const AR = (t) => mod(2592, "Rings/AllResistances", t, "AllResistances");
CASES.push({ name: "金の指輪: レアリティ T1・キャストスピード T1 → 全耐性 T2+", itemId: 2592, base: "Gold Ring", mods: [R1, CS1], target: [AR("T1"), AR("T2")].map((m) => `${m.mod}|${m.tierIndex}`), coeT: [AR("T1").coe, AR("T2").coe] });

const t0 = Date.now();
console.log(`カオス: CoE = 消える MOD ごとの重みの割合の平均 (正確)、エンジン = ${K} 回打った割合 (± は 95% の幅)。「サフィ」= 足された MOD がサフィックスの割合`);
for (const c of CASES) {
  console.log(`\n=== ${c.name}`);
  for (const [label, cur, floor] of [["通常のカオス", "chaos", 0], ["上級のカオス", "chaos_greater", 35], ["完全のカオス", "chaos_perfect", 50]]) {
    const coe = coeChaos(c, floor);
    const eng = engineRun(c, cur);
    row(`${label} 狙い`, coe.hit, eng.hit);
    row(`${label} サフィ`, coe.suf, eng.suf);
  }
}
// 消去: CoE は消せる MOD (フラクチャー以外、お告げならその側) から等しく 1 つ。エンジンの消えた MOD の割合を並べる
console.log(`\n消去: CoE = 消せる MOD から等しく 1 つ (1/n)、エンジン = ${K} 回の消えた MOD の割合`);
for (const [label, omens, side] of [["素の消去", [], null], ["右側の消去のお告げ", ["OmenofDextralAnnulment"], "suffix"], ["左側の消去のお告げ", ["OmenofSinistralAnnulment"], "prefix"]]) {
  const c = CASES[1];
  const eng = engineRun(c, "annul", omens);
  const free = c.mods.filter((m) => !m.fractured && (!side || data.mods.get(m.mod).type === side));
  console.log(`=== ${label} (${c.mods.map((m) => m.mod.split("/")[1]).join("・")}、移動速度は固定)`);
  for (const m of free) row(m.mod.split("/")[1], 1 / free.length, (eng.removed[m.mod] ?? 0) / K);
  const other = Object.keys(eng.removed).filter((k) => !free.some((m) => m.mod === k));
  if (other.length) console.log(`  ⚠ 消えてはいけない MOD が消えた: ${other.join(", ")}`);
}
console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
