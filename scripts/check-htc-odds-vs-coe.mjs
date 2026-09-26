#!/usr/bin/env node
/**
 * check-htc-odds-vs-coe.mjs — シミュレーターの 1 回の確率を Craft of Exile の数え方と比べる (2026-09-26 精度上げ)
 *
 * オーナー:「精度上げおけ」。CoE と同じか、少しだけ厳しい (楽観しない) こと。見ること (狙い 1 つ × 打ち方 1 つごと):
 *   CoE   = その側 (カオスは空いている両側) の、ilvl と下限 (上級 35 / 完全 50) で出る段の重みのうち、狙いの段以上の割合。
 *           付いている系統 (固定済み・外れ) は抽選の元から外す。ここで独立に数える (アプリの tierWeight は使わない)
 *   アプリ = sim-route の roll の分布 (正確な値) と、apply を N 回打って狙いが付いた割合 (回した値)。
 *           参考に「直す前」(外れの系統を数えない = 2026-09-26 より前の数え方) も出す
 * 合格: アプリ ≤ CoE × 1.02 (楽観しない)、アプリ ≥ CoE × 0.8 (厳し過ぎない)、回した値が正確な値から 4σ 以内。
 * 取引所は叩かない。
 *   node scripts/check-htc-odds-vs-coe.mjs
 */
import { bundleEntry } from "./_bundle-ts.mjs";
import { prices } from "./_htc-test-prices.mjs";
const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
const data = M.loadPatchSync();
const N = 20000;
let failed = 0;

/** 開始の状態: fixed = 固定済み (消えない)、junk = 外れ (系統が分かっている) */
const ITEMS = [
  {
    name: "金の指輪 ilvl 79", base: "Gold Ring", ilvl: 79,
    slots: [["Rings/IncreasedLife", "fixed"], ["Rings/Strength", "junk"]],
    targets: ["Rings/IncreasedMana", "Rings/ColdDamage", "Rings/IncreasedChaosDamage", "Rings/IncreasedCastSpeed", "Rings/FireResistance", "Rings/ItemFoundRarityIncrease"],
  },
  {
    name: "不在のアミュレット ilvl 79", base: "Absent Amulet", ilvl: 79,
    slots: [["Amulets/GlobalIncreaseSpellSkillGemLevel", "fixed"], ["Amulets/IncreasedLife", "junk"]],
    // ミニオンのスキルレベルはスペルのレベルと同じ系統 (付かない = 両方 0 になること)
    targets: ["Amulets/MaximumManaIncreasePercent", "Amulets/BaseSpirit", "Amulets/SpellDamage", "Amulets/IncreasedCastSpeed", "Amulets/CriticalStrikeChance", "Amulets/GlobalIncreaseMinionSpellSkillGemLevel"],
  },
  {
    name: "プリズムの指輪 ilvl 82", base: "Prismatic Ring", ilvl: 82,
    slots: [["Rings/PhysicalDamage", "fixed"], ["Rings/Dexterity", "junk"]],
    targets: ["Rings/ColdDamage", "Rings/FireDamagePercentage", "Rings/ItemFoundRarityIncrease", "Rings/Strength", "Rings/FireResistance", "Rings/ChaosResistance"],
  },
];

const ACTIONS = [
  { label: "高貴", kind: "exalt", tier: "exalt", floor: 0 },
  { label: "上級", kind: "exalt", tier: "exalt_greater", floor: 35 },
  { label: "完全", kind: "exalt", tier: "exalt_perfect", floor: 50 },
  { label: "カオス", kind: "chaos", tier: "chaos", floor: 0 },
];

/** CoE の数え方 (ここで独立に書く): 段 i が minIdx 以上・ilvl 以下・下限以上の重みの合計 */
const coeW = (m, minIdx, ilvl, floor) => m.tiers.reduce((a, t, i) => a + (i >= minIdx && t.ilvl <= ilvl && t.ilvl >= floor ? t.weight : 0), 0);

const rows = [];
for (const it of ITEMS) {
  const cls = M.itemBaseFor(data, it.base);
  const limits = M.sideLimits(data, it.base);
  const ctx = { data, cls, prices, itemLevel: it.ilvl, limits, catalystOk: () => true, baseQuality: 20 };
  const start = {
    breach: false,
    slots: it.slots.map(([id, k]) => {
      const m = data.mods.get(id);
      return k === "fixed" ? { modId: id, side: m.type, fixed: true } : { modId: null, side: m.type, fixed: false, family: m.family };
    }),
  };
  for (const tid of it.targets) {
    const m = data.mods.get(tid);
    // 狙いの段: 上から 2 つ目以上 (段が 2 つ未満なら全部)
    const minTier = Math.max(0, m.tiers.length - 2);
    for (const a of ACTIONS) {
      const action = a.kind === "exalt" ? { kind: "exalt", tier: a.tier, side: m.type, catalyst: null } : { kind: "chaos", tier: a.tier };
      const node = { id: "x", action, targets: [{ modId: tid, minTier }], keep: [], clean: false, onHit: "done", onMiss: null };
      const h = M.simHelpers(ctx, [node]);
      // CoE: 付いている系統を除く。カオスは外れ (外せる唯一の物) が消えてから、空いている両側に付く
      const after = a.kind === "chaos" ? start.slots.filter((x) => x.fixed) : start.slots;
      const occ = new Set(after.map((x) => x.family ?? data.mods.get(x.modId).family));
      const count = (sd) => after.filter((x) => x.side === sd).length;
      const sides = a.kind === "chaos" ? ["prefix", "suffix"].filter((sd) => count(sd) < limits[sd]) : [m.type];
      const pool = sides.flatMap((sd) => cls.pools.normal[sd === "prefix" ? "prefixes" : "suffixes"]);
      const W = pool.reduce((acc, id) => { const x = data.mods.get(id); return x && !occ.has(x.family) ? acc + coeW(x, 0, it.ilvl, a.floor) : acc; }, 0);
      const coe = occ.has(m.family) || !sides.includes(m.type) || W === 0 ? 0 : coeW(m, minTier, it.ilvl, a.floor) / W;
      // アプリの正確な値 (roll の分布)
      const rs = { ...start, slots: after };
      const exact = h.roll(rs, sides, a.floor, null, 20).filter((o) => o.modId === tid).reduce((acc, o) => acc + o.p, 0);
      // 参考: 直す前 (外れの系統を数えない) の値
      const noFam = { ...rs, slots: rs.slots.map(({ family, ...x }) => x) };
      const before = h.roll(noFam, sides, a.floor, null, 20).filter((o) => o.modId === tid).reduce((acc, o) => acc + o.p, 0);
      // 回した値 (apply を N 回)
      const rnd = mulberry(20260926);
      let hits = 0;
      for (let i = 0; i < N; i++) if (h.targetsMet(h.apply(start, node, rnd), node)) hits++;
      const sim = hits / N;
      const sd = Math.sqrt(Math.max(exact * (1 - exact), 1 / N) / N);
      const ok = exact <= coe * 1.02 + 1e-12 && exact >= coe * 0.8 - 1e-12 && Math.abs(sim - exact) <= 4 * sd;
      if (!ok) failed++;
      rows.push({ item: it.name, target: tid.split("/")[1] + ` T${m.tiers.length - minTier}+`, act: a.label, coe, exact, sim, before, ok });
    }
  }
}

function mulberry(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pct = (x) => (x * 100).toFixed(3).padStart(7) + "%";
console.log(`${"アイテム".padEnd(16)} ${"狙い".padEnd(44)} ${"打ち方".padEnd(4)} ${"CoE".padStart(8)} ${"アプリ正確".padStart(8)} ${"回した".padStart(8)} ${"直す前".padStart(8)}  比`);
for (const r of rows) {
  const ratio = r.coe > 0 ? (r.exact / r.coe).toFixed(3) : r.exact === 0 ? "  -  " : "  ∞  ";
  console.log(`${r.item.padEnd(16)} ${r.target.padEnd(44)} ${r.act.padEnd(4)} ${pct(r.coe)} ${pct(r.exact)} ${pct(r.sim)} ${pct(r.before)}  ${ratio}${r.ok ? "" : "  NG"}`);
}
console.log(failed ? `\nNG: ${failed} 件` : "\n全部 OK (アプリ ≤ CoE × 1.02 かつ ≥ CoE × 0.8、回した値は正確な値から 4σ 以内)");
process.exit(failed ? 1 : 0);
