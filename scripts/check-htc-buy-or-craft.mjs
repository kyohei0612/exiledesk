#!/usr/bin/env node
/**
 * check-htc-buy-or-craft.mjs — 「作る vs 買う」の突き合わせを検算する (2026-09-22)
 *
 * **取引所は叩かない。**値段は与えた物で判定だけ見る。見るのは 2 つ:
 *   1. 狙う MOD が取引所の条件に変わるか (何割引けるか)
 *   2. 下限が**素の抽選値**になっているか (底上げ後の値を入れていないか)
 *
 *   node scripts/check-htc-buy-or-craft.mjs
 */
import { bundleEntry } from "./_bundle-ts.mjs";

const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
const data = M.loadPatchSync();
let failed = 0;
const fail = (m) => { console.log(`   NG: ${m}`); failed++; };

// ---- 1. クラスごとに、通常プールの MOD が何割 条件にできるか ----
console.log("クラスごとの引ける割合 (通常プール):");
let tot = 0, ok = 0;
for (const cls of data.bases.values()) {
  const ids = [...cls.pools.normal.prefixes, ...cls.pools.normal.suffixes];
  if (!ids.length) continue;
  const { filters, unmatched } = M.tradeFiltersFor(data, ids.map((id) => ({ modId: id })));
  tot += ids.length; ok += ids.length - unmatched.length;
  if (M.tradeCategoryOf(cls)) {
    console.log(`  ${cls.id.padEnd(26)} ${String(ids.length - unmatched.length).padStart(3)}/${String(ids.length).padStart(3)} 本  条件 ${filters.length} 個`);
  }
}
console.log(`合計 ${ok}/${tot} = ${((ok / tot) * 100).toFixed(1)}%`);
if (ok / tot < 0.9) fail("引ける割合が 90% を切った");

// ---- 2. オーナーのアミュレットで組んでみる ----
const cls = data.bases.get("Amulets");
const targets = [
  { modId: "Amulets/IncreasedMana" },
  { modId: "Amulets/MaximumManaIncreasePercent" },
  { modId: "Amulets/BaseSpirit" },
  { modId: "Amulets/GlobalIncreaseSpellSkillGemLevel" },
  { modId: "Amulets/CriticalStrikeMultiplier" },
];
const built = M.buildFinishedQuery(data, cls, targets, { ilvlMin: 82 });
console.log("\n琥珀のアミュレット (5 個、T1 狙い) の検索:");
if (!built) { fail("カテゴリが引けない"); } else {
  for (const f of built.filters) console.log(`  ${f.modId.padEnd(40)} ${f.id}  下限 ${f.min}`);
  if (built.unmatched.length) console.log(`  条件にできない: ${built.unmatched.join(" / ")}`);
  // 素の値であること: 最大マナ T1 の下限は 180 (表示値 218 ではない)
  const mana = built.filters.find((f) => f.modId === "Amulets/IncreasedMana");
  if (!mana) fail("最大マナの条件が無い");
  else if (mana.min !== 180) fail(`最大マナの下限が ${mana.min} (素の T1 下限 180 のはず。表示値を入れていないか)`);
  if (built.query.query.filters.type_filters.filters.category.option !== "accessory.amulet") fail("カテゴリが違う");
}

// ---- 3. 判定 ----
console.log("\n判定:");
const cases = [
  { name: "作ると 13 倍 (オーナーの実物)", i: { craftExpected: 3755489, listingPrice: 279180 }, want: "buy" },
  { name: "作るほうが安い", i: { craftExpected: 40400, listingPrice: 279180 }, want: "craft" },
  { name: "出品が無い", i: { craftExpected: 40400, listingPrice: null }, want: "craft" },
  { name: "作れない", i: { craftExpected: Infinity, listingPrice: 279180 }, want: "buy" },
  { name: "条件が抜けている", i: { craftExpected: 100, listingPrice: 200, unmatched: ["x"] }, want: "unknown" },
];
for (const c of cases) {
  const r = M.buyOrCraft(c.i);
  console.log(`  ${r.verdict.padEnd(8)} ${c.name} … ${r.note}`);
  if (r.verdict !== c.want) fail(`${c.name}: ${r.verdict} になった (${c.want} のはず)`);
}

console.log(failed ? `\nNG: ${failed} 件` : "\n全部 OK");
process.exit(failed ? 1 : 0);
