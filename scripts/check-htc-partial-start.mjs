#!/usr/bin/env node
/**
 * check-htc-partial-start.mjs — 「途中まで出来ている物を買う」の検算 (2026-09-22)
 *
 * **取引所も相場も叩かない**。見るのは列挙が正しいか (枠・レアリティ)、残りの作成費が
 * 買った個数で単調に下がるか、予算の引き算が合うか。
 *
 *   node scripts/check-htc-partial-start.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bundleEntry } from "./_bundle-ts.mjs";

const SHEET = join(
  process.env.TEMP ?? "",
  "claude/C--Users-kyohei-ExileDesk/241820d2-847f-4544-9d65-4e36f70398cf/scratchpad/upstream-prices.json",
);
if (!existsSync(SHEET)) {
  console.log("値段のシートが手元にありません。この検算はスキップします。");
  process.exit(0);
}

const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
const data = M.loadPatchSync();
const sheet = JSON.parse(readFileSync(SHEET, "utf8"));
let failed = 0;
const fail = (m) => {
  console.log(`   NG: ${m}`);
  failed++;
};

const cls = M.itemBaseFor(data, "Aegis Quarterstaff");
const prices = M.pricesForBase(M.indexPrices(sheet), cls);
const DIV = sheet.prices?.divine ?? 465.3;
const LVL = 83;
const IDS = [
  "Quarterstaves/LocalFireDamage",
  "Quarterstaves/LocalLightningDamage",
  "Quarterstaves/IncreasedWeaponElementalDamagePercent",
  "Quarterstaves/GlobalIncreaseMeleeSkillGemLevelWeapon",
  "Quarterstaves/LifeGainedFromEnemyDeath",
  "Quarterstaves/PerfectEssence_Onslaught",
];
const targets = IDS.map((id) => ({ modId: id, minTierIndex: data.mods.get(id).tiers.length - 1 }));

// ---- 1. 列挙 ----
const t0 = Date.now();
const opts = M.partialStarts(data, cls, targets, { level: LVL, maxBought: 4 });
console.log(`列挙 ${opts.length} 通り (${Date.now() - t0} ミリ秒)`);
// プレ 3 / サフ 3 なので、1..4 個の部分集合 6+15+20+15 = 56 から枠外を引いた数
const byK = {};
for (const o of opts) byK[o.bought.length] = (byK[o.bought.length] ?? 0) + 1;
console.log(`  個数ごと: ${Object.entries(byK).map(([k, n]) => `${k} 個 ${n} 通り`).join(" / ")}`);
if (opts.length === 0) fail("1 通りも出ない");

for (const o of opts) {
  // 枠に収まっていること
  if (o.prefixes > 3 || o.suffixes > 3) fail(`枠を超えた: P${o.prefixes} S${o.suffixes}`);
  // マジックは片側 1 個まで。超えているのにマジックなら嘘
  const magicOk = o.prefixes <= 1 && o.suffixes <= 1;
  if (o.rarity === "magic" && !magicOk) fail(`P${o.prefixes} S${o.suffixes} をマジックにしている`);
  if (o.rarity === "rare" && magicOk) fail(`P${o.prefixes} S${o.suffixes} はマジックで持てるのにレアにしている`);
  // 買った分 + 残り = 全部
  if (o.bought.length + o.rest.length !== targets.length) fail(`${o.bought.length} + ${o.rest.length} が ${targets.length} にならない`);
  // 開始アイテムに買った MOD が乗っていること
  const placed = [...o.start.prefixes, ...o.start.suffixes].map((p) => p.modId).sort().join();
  if (placed !== o.bought.map((t) => t.modId).sort().join()) fail("開始アイテムと買った MOD が一致しない");
}
// 全部買う (= 完成品) は出さない
if (opts.some((o) => o.rest.length === 0)) fail("残り 0 個の案が出ている (それは完成品を買う話)");

// ---- 2. 残りの作成費 ----
// 速いものだけ回す (残り 5 個は 49 秒かかるので検算には入れない)
console.log("\n残りを仕上げる費用:");
const pick = (...ids) => targets.filter((t) => ids.some((i) => t.modId.endsWith(i)));
const cases = [
  ["レア 4 (火+雷+近接+ライフ)", pick("LocalFireDamage", "LocalLightningDamage", "GlobalIncreaseMeleeSkillGemLevelWeapon", "LifeGainedFromEnemyDeath")],
  ["レア 3 (火+雷+近接)", pick("LocalFireDamage", "LocalLightningDamage", "GlobalIncreaseMeleeSkillGemLevelWeapon")],
];
const costs = [];
for (const [name, bought] of cases) {
  const ids = new Set(bought.map((t) => t.modId));
  const o = opts.find((x) => x.bought.length === bought.length && x.bought.every((t) => ids.has(t.modId)));
  if (!o) { fail(`${name} が列挙に無い`); continue; }
  const r = M.solveFinish(data, prices, o);
  const div = r.expectedCost / DIV;
  console.log(`  ${name.padEnd(28)} 残り ${o.rest.length} 個  ${r.ms} ミリ秒  ${Math.round(div).toLocaleString()} 神`);
  if (!r.feasible) fail(`${name}: 作れない判定 (${r.reason ?? ""})`);
  costs.push({ n: bought.length, div });
}
// 買った数が多いほど残りは安い
if (costs.length === 2 && !(costs[0].div < costs[1].div)) {
  fail(`4 個買い (${costs[0].div.toFixed(0)}) が 3 個買い (${costs[1].div.toFixed(0)}) より高い`);
}

// ---- 3. 予算の引き算 ----
console.log("\n買値に出せる上限 (完成品 248 神を予算に):");
const listing = 248 * DIV;
for (const c of costs) {
  const left = M.budgetForBuy(listing, c.div * DIV);
  console.log(`  ${c.n} 個買い  残り ${Math.round(c.div)} 神  → 買値は ${left == null ? "いくらでも赤字" : Math.round(left / DIV).toLocaleString() + " 神"} まで`);
  if (left != null && Math.abs(left - (listing - c.div * DIV)) > 1e-6) fail(`${c.n} 個買い: 引き算が合わない`);
}
// 作成費が予算を食い切るなら null
if (M.budgetForBuy(100, 200) !== null) fail("作成費が予算を超えているのに上限を返している");
if (M.budgetForBuy(200, 100) !== 100) fail("引き算が合わない");

console.log(failed ? `\nNG: ${failed} 件` : "\n全部 OK");
process.exit(failed ? 1 : 0);
