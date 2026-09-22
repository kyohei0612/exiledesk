#!/usr/bin/env node
/**
 * check-htc-essence-route.mjs — 「エッセンスでも付くなら安いほうで」の検算 (2026-09-22)
 *
 * **取引所も相場も叩かない**。見るのは繋ぐ / 繋がないの判定と、値段で route が切り替わること。
 *
 *   node scripts/check-htc-essence-route.mjs
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
const raw = JSON.parse(readFileSync(SHEET, "utf8"));
let failed = 0;
const fail = (m) => { console.log(`   NG: ${m}`); failed++; };

const cls = M.itemBaseFor(data, "Aegis Quarterstaff");
const LVL = 83;

// ---- 1. 繋ぐ / 繋がない ----
console.log("繋ぐかどうか:");
const cases = [
  // 同じ文言 + エッセンスが下限を満たす → 繋ぐ
  ["Quarterstaves/LocalIncreasedAttackSpeed", 6, "Greater Essence of Haste", "アタック速度 23-25"],
  // T1 はエッセンスが届かない → 繋がない
  ["Quarterstaves/LocalIncreasedAttackSpeed", 7, null, "アタック速度 26-28 (T1)"],
  ["Quarterstaves/LocalFireDamage", 9, null, "火ダメージ T1"],
  ["Quarterstaves/LocalLightningDamage", 9, null, "雷ダメージ T1"],
  // 低いティアなら届く
  ["Quarterstaves/LocalFireDamage", 3, "Essence of Flames", "火ダメージ 19-27/30-42"],
  // **同じ family でも別の MOD** (近接スキル vs アタックスキル) → 繋いではいけない
  ["Quarterstaves/GlobalIncreaseMeleeSkillGemLevelWeapon", 3, null, "近接スキルレベル (family は同じだがアタックスキルは別物)"],
];
for (const [modId, idx, want, label] of cases) {
  const alts = M.essenceAlternativesFor(data, cls, { modId, minTierIndex: idx }, LVL);
  const got = alts[0]?.tierName ?? null;
  const ok = want === null ? alts.length === 0 : got === want;
  console.log(`  ${ok ? "○" : "×"} ${label.padEnd(46)} → ${got ?? "繋がない"}`);
  if (!ok) fail(`${label}: ${got ?? "繋がない"} (${want ?? "繋がないはず"})`);
}

// ---- 2. 繋いだ物は同じ枠に入る ----
const plain = [
  { modId: "Quarterstaves/LocalIncreasedAttackSpeed", minTierIndex: 6 },
  { modId: "Quarterstaves/LifeGainedFromEnemyDeath", minTierIndex: 7 },
];
const wide = M.withEssenceAlternatives(data, cls, plain, LVL);
console.log(`\n目標 ${plain.length} → ${wide.length} 件`);
const slots = wide.filter((t) => t.slot != null);
if (slots.length !== 2) fail(`枠が付いた目標が ${slots.length} 件 (通常 + エッセンスの 2 件のはず)`);
else if (slots[0].slot !== slots[1].slot) fail("通常とエッセンスが別の枠に入っている");
// 候補が無い目標は素通し (今まで通りの挙動を壊さない)
const life = wide.find((t) => t.modId.endsWith("LifeGainedFromEnemyDeath"));
if (life?.slot != null) fail("候補が無い目標にも枠が付いている");

// ---- 3. 値段で route が切り替わる ----
//
// ここが本体。エンジンはエッセンスを行動として持っていて値段も見るが、**同じ枠に入れて
// 初めて**「通常ロールとエッセンスのどちらか」を選べる。入れる前は値段を 1000 倍にしても
// 期待費用が 1 高貴も動かなかった (= 候補に入っていなかった)。
const KEY = "essence:greater:Quarterstaves/Essence_IncreasedAttackSpeed";
console.log("\nエッセンスの値段を動かした時:");
const solve = (targets, price) => {
  const sheet = { ...raw, prices: { ...raw.prices, [KEY]: price } };
  const prices = M.pricesForBase(M.indexPrices(sheet), cls);
  return M.markovFromItem(data, prices, M.whiteItem(cls, LVL), targets, {}).expectedCost;
};
const cheap = solve(wide, 0.05);
const normal = solve(wide, raw.prices[KEY]);
const dear = solve(wide, 300000);
console.log(`  激安 0.05      ${cheap.toFixed(0).padStart(7)} 高貴`);
console.log(`  相場 ${String(raw.prices[KEY]).padStart(9)} ${normal.toFixed(0).padStart(7)} 高貴`);
console.log(`  高騰 300000    ${dear.toFixed(0).padStart(7)} 高貴  (通常ロールに戻る)`);
if (!(cheap <= normal)) fail("激安のほうが高い");
if (!(dear > normal * 5)) fail(`高騰しても費用が ${dear.toFixed(0)} (通常ロールに戻って跳ね上がるはず)`);
// 繋ぐ前は値段を動かしても変わらない = 候補に入っていなかった、の裏取り
const before = [solve(plain, 0.05), solve(plain, 300000)];
if (before[0] !== before[1]) fail("枠に入れる前なのにエッセンスの値段で費用が動いた");
console.log(`  (枠に入れる前は値段を動かしても ${before[0].toFixed(0)} 高貴のまま = 候補に入っていなかった)`);
if (!(normal < before[0] / 5)) fail(`繋いでも安くなっていない (${normal.toFixed(0)} vs ${before[0].toFixed(0)})`);

// ---- 4. T1 狙いでは何も変わらない ----
//
// エッセンスは固定ティアで T1 には届かないので、全部 T1 の craft は今までと同じ数字が出る。
const ids = ["Quarterstaves/LocalFireDamage", "Quarterstaves/LocalLightningDamage", "Quarterstaves/GlobalIncreaseMeleeSkillGemLevelWeapon"];
const t1 = ids.map((id) => ({ modId: id, minTierIndex: data.mods.get(id).tiers.length - 1 }));
const t1wide = M.withEssenceAlternatives(data, cls, t1, LVL);
console.log(`\nT1 だけの craft: 目標 ${t1.length} → ${t1wide.length} 件 (増えないのが正しい)`);
if (t1wide.length !== t1.length) fail(`T1 狙いなのに候補が ${t1wide.length - t1.length} 件増えた`);

console.log(failed ? `\nNG: ${failed} 件` : "\n全部 OK");
process.exit(failed ? 1 : 0);
