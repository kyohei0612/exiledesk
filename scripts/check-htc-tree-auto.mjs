#!/usr/bin/env node
/**
 * check-htc-tree-auto.mjs — 貼った MOD から自動で組むツリー (tree-auto.ts) を実物 3 つで回す (2026-09-24)
 *
 * 取引所は叩かない (値段は check-htc-spam-plan の固定値)。**組み方の流れを見るので、狙いの段は問わない (T 何でも)**。
 * 貼り付けの段 (T1 など) のままだと、揃うまでに手数の上限を超える物がある (金の指輪の回避 T1 + レアリティ T1)。見ること:
 *   - 最後まで行ける (完成 95% 以上)
 *   - 触らない MOD (樹 MOD) が消えて止まる回が無い (側を選べる手だけで組んでいるので)
 *   node scripts/check-htc-tree-auto.mjs
 */
import { readFileSync } from "node:fs";
import { bundleEntry } from "./_bundle-ts.mjs";
const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
const data = M.loadPatchSync();
const D = 506;
const src = readFileSync("scripts/check-htc-spam-plan.mjs", "utf8");
const a = src.indexOf("const div = (v)"), b = src.indexOf("const it = M.parseJaItem");
const prices = new Function("D", src.slice(a, b) + "; return prices;")(D);
const NL = String.fromCharCode(10);
let failed = 0;

const RINGS = [
  { name: "死体の円環", lines: ["アイテムクラス: 指輪", "レアリティ: レア", "死体の円環", "ニーモニックリング", "--------", "品質 (マナモッド): +40%", "--------", "アイテムレベル: 80", "--------", "最大マナが8%増加する", "--------", "スペルのマナコスト効率が29%増加する", "最大マナ +247", "知性 +30", "全ての元素耐性 +13%", "最大マナが8%増加する", "キャストスピードが20%増加する"] },
  { name: "金の指輪", lines: ["Rarity: Rare", "Spirit Knuckle", "Gold Ring", "--------", "Quality (Minion Modifiers): +40% (augmented)", "--------", "Item Level: 80", "--------", "13% increased Rarity of Items found (implicit)", "--------", "+215 to Evasion Rating", "17% increased Rarity of Items found", "Minions have 50% increased Critical Hit Chance", "Minions have 25% increased Critical Damage Bonus", "Minions have 40% increased Cooldown Recovery Rate (desecrated)", "+20% to Maximum Quality (crafted)"] },
  { name: "プリズムの指輪", lines: ["Item Class: Rings", "Rarity: Rare", "Test Loop", "Prismatic Ring", "--------", "Item Level: 82", "--------", "Adds 17 to 25 Cold damage to Attacks", "19% increased Fire Damage", "17% increased Rarity of Items found", "+31 to Strength", "+37% to Fire Resistance", "+21% to Chaos Resistance"] },
];

for (const r of RINGS) {
  const it = M.parseJaItem(r.lines.join(NL));
  const g0 = M.targetsFor(data, it);
  const g = { ...g0, targets: g0.targets.map((t) => ({ ...t, minTierIndex: 0 })) };
  const cls = M.baseForSolving(data, it.baseType, g.skippedSides);
  const limits = M.sideLimits(data, it.baseType);
  const v = (x) => ({ value: x });
  const kind = M.startKindOf({ dropOnly: v(g.dropOnly), data: v(data), slotsUsed: v(g.skippedSides), targets: v(g.targets), item: v(it) });
  // 開始の指輪 (useCraftTree と同じ考え方): 重い側の樹 MOD 1 つは固定済み、他の買った時の MOD は触らない、外れ 1 つ
  const slots = [];
  let fixedDone = false;
  for (const [side, n, S] of [["prefix", g.skippedSides.prefixes, "P"], ["suffix", g.skippedSides.suffixes, "S"]]) {
    const treeOn = g.dropOnly.filter((x) => x.side === S).length;
    for (let i = 0; i < n; i++) {
      const fix = kind.kind === "fix" && kind.fixSide === S && i < treeOn && !fixedDone;
      if (fix) fixedDone = true;
      slots.push(fix ? { modId: null, side, fixed: true } : { modId: null, side, fixed: false, keep: true });
    }
  }
  const nP = slots.filter((x) => x.side === "prefix").length, nS = slots.filter((x) => x.side === "suffix").length;
  slots.push({ modId: null, side: limits.suffix - nS >= limits.prefix - nP ? "suffix" : "prefix", fixed: false });
  // 付きやすさ (craft-estimate の spawnChance と同じ: ベースの MOD 一覧の重みの割合、ilvl で出ない段は除く)
  const lv = it.itemLevel ?? 82;
  const w = (id, minIdx) => (data.mods.get(id)?.tiers ?? []).reduce((a2, t, i) => a2 + (i >= minIdx && t.ilvl <= lv ? t.weight : 0), 0);
  const chance = (t) => {
    const m = data.mods.get(t.modId);
    if (!m || m.source !== "normal") return null;
    const pool = (cls.pools.normal[m.type === "prefix" ? "prefixes" : "suffixes"] ?? []).reduce((a2, id) => a2 + w(id, 0), 0);
    return pool > 0 ? w(t.modId, t.minTierIndex ?? 0) / pool : null;
  };
  const chaosOk = !slots.some((x) => x.keep);
  const nodes = M.autoTree({ data, prices, targets: g.targets, fixedIds: [], qualityTag: it.catalystTag ?? null, chaosOk, chance });
  const ctx = { data, cls, prices, itemLevel: it.itemLevel ?? 82, limits, catalystOk: () => true, baseQuality: 20 };
  const res = M.simulateTree({ ctx, start: { slots, breach: false }, nodes, runs: 1500, budget: 1000 * D });
  const lost = res.stops.filter((x) => x.reason.includes("消えたら終わり")).reduce((a2, x) => a2 + x.p, 0);
  console.log(`${r.name} (${kind.kind}): 手 ${nodes.length} / 完成 ${(res.pDone * 100).toFixed(1)}% / 平均 ${(res.expected / D).toFixed(0)} 神 / 8 割 ${(res.p80 / D).toFixed(0)} 神 / 触らない MOD が消えた ${(lost * 100).toFixed(1)}%`);
  for (const s of res.stops) console.log(`   止まった ${(s.p * 100).toFixed(1)}%: ${s.reason}`);
  if (res.pDone < 0.95) { console.log("   NG: 完成が 95% 未満"); failed++; }
  if (lost > 0) { console.log("   NG: 触らない MOD が消えた"); failed++; }
}
console.log(failed ? `${NL}NG: ${failed} 件` : `${NL}全部 OK`);
process.exit(failed ? 1 : 0);
