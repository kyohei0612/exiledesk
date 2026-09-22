#!/usr/bin/env node
/**
 * check-htc-budget.mjs — 予算の試算と出費の内訳を検算する (2026-09-22)
 *
 * **取引所も相場も叩かない** (同梱エンジンのデータと、手元の上流シートだけ)。
 * 見るのは「回した平均がソルバの期待費用と合うか」「分位点の並びが正しいか」
 * 「内訳の割合が 100% になるか」「種を固定すれば同じ数字が出るか」。
 *
 *   node scripts/check-htc-budget.mjs
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

const cls = data.bases.get("Amulets");
const prices = M.pricesForBase(M.indexPrices(sheet), cls);
const targets = [
  { modId: "Amulets/IncreasedMana" },
  { modId: "Amulets/BaseSpirit" },
  { modId: "Amulets/MaximumManaIncreasePercent" },
];
const res = M.markovFromItem(data, prices, M.whiteItem(cls, 82), targets, {});
const b = M.simulateBudget(prices, cls, res, { runs: 4000, budget: res.expectedCost, seed: 12345 });
if (!b) {
  fail("試算が返らない");
} else {
  console.log(`ソルバ ${res.expectedCost.toFixed(0)} ex / 回した平均 ${b.mean.toFixed(0)} ex (${b.runs} 本、打ち切り ${b.truncated})`);
  console.log(`  p50 ${b.p50.toFixed(0)} / p75 ${b.p75.toFixed(0)} / p90 ${b.p90.toFixed(0)} ex`);
  console.log(`  期待費用ちょうどを予算にした時に終わる割合 ${(b.withinBudget * 100).toFixed(0)}%`);

  // 1. 平均がソルバと合う (回しているのは同じ方策なので、ずれるなら辿り方がおかしい)
  const err = Math.abs(b.mean - res.expectedCost) / res.expectedCost;
  if (err > 0.05) fail(`平均がソルバと ${(err * 100).toFixed(1)}% ずれている`);
  // 2. 分位点は必ずこの並び
  if (!(b.p50 <= b.p75 && b.p75 <= b.p90)) fail("分位点の並びが逆");
  // 3. 「厳しめ」は平均より上でなければ意味が無い
  if (!(b.p75 > b.mean)) fail(`p75 (${b.p75.toFixed(0)}) が平均 (${b.mean.toFixed(0)}) 以下`);
  // 4. 平均は「半分くらい足が出る」額 — 予算にすると 4〜7 割で収まるはず
  if (b.withinBudget < 0.35 || b.withinBudget > 0.75) fail(`期待費用を予算にした時の成功率が ${(b.withinBudget * 100).toFixed(0)}% (4〜7 割のはず)`);
  // 5. 内訳の割合は 100% になる
  const share = b.spend.reduce((a, r) => a + r.share, 0);
  if (Math.abs(share - 1) > 0.01) fail(`内訳の割合が ${(share * 100).toFixed(1)}%`);
  // 6. 日本語になっている (キーが漏れていない)
  const raw = b.spend.find((r) => /^[a-z_]+$/.test(r.label));
  if (raw) fail(`内訳に英語のキーが出ている: ${raw.label}`);
  // 7. 種を固定すれば同じ数字
  const again = M.simulateBudget(prices, cls, res, { runs: 4000, budget: res.expectedCost, seed: 12345 });
  if (again.mean !== b.mean || again.p75 !== b.p75) fail("種を固定しても数字が変わる");

  console.log("  出費の内訳:");
  for (const r of b.spend.slice(0, 5)) console.log(`    ${(r.share * 100).toFixed(0).padStart(3)}%  ${r.uses.toFixed(1).padStart(7)} 回  ${r.label}`);
}

// ---- 即時の手順 (本家 poe2htc.com v1.1.0 の実測と突き合わせる) ----
//
// 2026-09-22 に本家へ同じ条件 (琥珀のアミュレット / ilvl 82 / 6 MOD 全部 T1) を入れた結果:
//   3 plans found · Likeliest 1 in 5.7 billion · checked 335,664 plans
//   1. Transmutation (Perfect) → 2. Augmentation (Perfect) → 3. Regal (Perfect)
//   4. Desecration + Omen of the Blackblooded → 5. Exalted (Perfect) + Omen of Greater Exaltation
// **同じ数字が出なくなったら、こちらのデータが本家とずれたということ。**
console.log("\n=== 即時の手順 (本家と突き合わせ) ===");
const IDS = [
  "Amulets/IncreasedMana",
  "Amulets/MaximumManaIncreasePercent",
  "Amulets/BaseSpirit",
  "Amulets/GlobalIncreaseSpellSkillGemLevel",
  "Amulets/CriticalStrikeMultiplier",
  "Amulets/Desecrated_GlobalSkillGemQuality",
];
const tiered = IDS.map((id) => ({ modId: id, minTierIndex: data.mods.get(id).tiers.length - 1 }));
const pv = M.planPreview(data, prices, cls, tiered, { level: 82 });
console.log(`  ${pv.ms} ミリ秒 / 案 ${pv.options.length} 件 / 数えた手順 ${pv.plansEvaluated.toLocaleString()}`);
for (const [i, o] of pv.options.entries()) console.log(`    案 ${i + 1}  ${o.oddsText}`);
if (pv.ms > 3000) fail(`即時のはずが ${pv.ms} ミリ秒かかっている`);
if (pv.options.length !== 3) fail(`案が ${pv.options.length} 件 (本家は 3 件)`);
if (pv.plansEvaluated !== 335664) fail(`数えた手順が ${pv.plansEvaluated} (本家は 335,664)`);
const odds = 1 / pv.options[0].probability;
if (!(odds > 5.0e9 && odds < 6.5e9)) fail(`一番当たりやすい案が 1 in ${odds.toExponential(1)} (本家は 1 in 5.7e9)`);
// 手順が日本語で、冒涜の段に骨とお告げが出ているか
const des = pv.options[0].steps.find((s) => s.modId?.includes("Desecrated"));
if (!des) fail("冒涜の段が無い");
else {
  console.log(`    冒涜の段: ${des.text}`);
  if (!des.text.includes("鎖骨")) fail(`冒涜の段に骨の名前が無い: ${des.text}`);
  if (!des.text.includes("ブラックブラッドのお告げ")) fail(`冒涜の段にボスのお告げが無い: ${des.text}`);
}

// ---- 途中まで出来ている物を買う ----
//
// オーナーの読み:「基本白から始めることはなさそう。3 MOD でも 4 MOD でも安いなら買うべき」。
// ここは列挙が即時に返ることと、買う物を引く条件が組めることだけ見る。**費用は見ない**
// (MDP なので 1 個買いは 1 分前後かかる。費用側は check-htc-partial-start.mjs)。
console.log("\n=== 途中まで出来ている物を買う ===");
{
  const t1 = Date.now();
  const parts = M.partialStarts(data, cls, tiered, { level: 82, maxBought: 4, baseType: "Amber Amulet" });
  const ms = Date.now() - t1;
  const byK = {};
  for (const o of parts) byK[o.bought.length] = (byK[o.bought.length] ?? 0) + 1;
  console.log(`  ${parts.length} 通り (${ms} ミリ秒)  ${Object.entries(byK).map(([k, n]) => `${k} 個 ${n}`).join(" / ")}`);
  if (ms > 500) fail(`列挙に ${ms} ミリ秒 (即時のはず)`);
  if (parts.length === 0) fail("1 通りも出ない");
  // 全部買う案は出さない (それは完成品を買う話)
  if (parts.some((o) => o.rest.length === 0)) fail("残り 0 個の案が出ている");
  // マジックは片側 1 個まで
  for (const o of parts) {
    const magicOk = o.prefixes <= 1 && o.suffixes <= 1;
    if ((o.rarity === "magic") !== magicOk) fail(`P${o.prefixes} S${o.suffixes} を ${o.rarity} にしている`);
    if (!o.buyQuery) fail(`${o.bought.map((t) => t.modId).join("+")} の検索が組めない`);
  }
  // 1 個買いはベース名 + その MOD 1 本で引く
  const one = parts.find((o) => o.bought.length === 1);
  if (!one) fail("1 個買いの案が無い");
  else if (one.buyQuery.filters.length !== 1) fail(`1 個買いの条件が ${one.buyQuery.filters.length} 本`);
  else if (one.buyQuery.query.query.type?.option !== "Amber Amulet") fail("1 個買いの type がベース名になっていない");
  console.log(`  1 個買いの検索: type ${one?.buyQuery.query.query.type?.option} / 条件 ${one?.buyQuery.filters.length} 本`);
}

// ---- フラクチャーで固定してから作る ----
//
// クライアントの説明:「4 個以上のモッドを持つレアアイテム上のランダムなモッド 1 個をフラクチャーし固定する」。
// 固定された MOD は消去で消えないので、engine は**固定済みの状態**なら正しく扱える。
// ここは「固定するとどれだけ楽になるか」を engine に解かせているだけで、確率の創作は無い。
console.log("\n=== フラクチャーで固定 ===");
const few = tiered.slice(0, 4);
const plain = M.markovFromItem(data, prices, M.whiteItem(cls, 82), few, {});
const fr = M.fractureOptions(data, prices, cls, few, { level: 82, plainCost: plain.expectedCost });
console.log(`  固定せずに作る ${plain.expectedCost.toFixed(0)} ex / ${fr.orbJa} は ${M.FRACTURE_MIN_MODS} MOD で 1/${M.FRACTURE_MIN_MODS}`);
for (const o of fr.options) {
  console.log(
    `    ${o.lockedModId.replace("Amulets/", "").padEnd(34)} 残り ${o.finishCost != null ? o.finishCost.toFixed(0) : "—"} ex  ${o.timesCheaper ? `1/${o.timesCheaper.toFixed(1)}` : ""}`,
  );
}
if (fr.options.length !== few.length) fail(`案が ${fr.options.length} 件 (目標と同じ ${few.length} 件のはず)`);
// 固定すれば必ず安くなる
for (const o of fr.options) if (!(o.timesCheaper > 1)) fail(`${o.lockedModId} を固定しても安くなっていない`);
// 当たる確率は 1 / MOD 数
if (Math.abs(fr.options[0].hitChance - 1 / M.FRACTURE_MIN_MODS) > 1e-9) fail(`当たる確率が ${fr.options[0].hitChance}`);
// 一番付きにくい MOD を固定するのが一番効く
if (!fr.options[0].lockedModId.includes("GlobalIncreaseSpellSkillGemLevel")) {
  fail(`先頭が ${fr.options[0].lockedModId} (一番付きにくいスペルレベルのはず)`);
}

// ---- ベースごとの枠 ----
//
// 同梱エンジンはクラス単位でしか枠を持っていないが、実際は**ベースの暗黙 MOD が増減させる**。
// 「不在のアミュレット」は -1P/-1S で 2/2 ── 4 MOD で満杯。アミュレットだけで 9 種類ある。
// `itemBaseFor` を通さずに `classOfBase` をソルバに渡すと、この制約が丸ごと落ちる。
console.log("\n=== ベースごとの枠 ===");
const threeP = ["Amulets/BaseSpirit", "Amulets/IncreasedMana", "Amulets/MaximumManaIncreasePercent"].map((modId) => ({ modId }));
for (const [name, wantP, wantS, feasible] of [
  ["Amber Amulet", 3, 3, true],
  ["Absent Amulet", 2, 2, false],
  ["Lament Amulet", 2, 3, false],
  ["Penumbra Amulet", 5, 1, true],
]) {
  const base = M.itemBaseFor(data, name);
  if (!base) {
    fail(`${name} が引けない`);
    continue;
  }
  const lim = base.limits ?? { prefixes: 3, suffixes: 3 };
  const p2 = M.pricesForBase(M.indexPrices(sheet), base);
  const r = M.markovFromItem(data, p2, M.whiteItem(base, 82), threeP, {});
  console.log(`  ${name.padEnd(18)} 枠 ${lim.prefixes}P/${lim.suffixes}S  プレフィックス 3 本狙い → ${r.feasible ? `${r.expectedCost.toFixed(0)} ex` : "作れない"}`);
  if (lim.prefixes !== wantP || lim.suffixes !== wantS) fail(`${name} の枠が ${lim.prefixes}/${lim.suffixes} (${wantP}/${wantS} のはず)`);
  if (r.feasible !== feasible) fail(`${name}: 作れる判定が逆 (枠 ${lim.prefixes}P に 3 本)`);
}

console.log(failed ? `\nNG: ${failed} 件` : "\n全部 OK");
process.exit(failed ? 1 : 0);
