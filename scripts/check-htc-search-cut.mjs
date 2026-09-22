#!/usr/bin/env node
/**
 * check-htc-search-cut.mjs — 投げる前に削れているか (2026-09-23)
 *
 * **取引所も相場も叩かない**。数えるだけ。見るのは 3 つ。
 *   1. 落とした組が、投げる検索で本当に肩代わりされているか (上位集合の関係にあるか)
 *   2. 削った結果が 5 分の枠に収まるか
 *   3. 一番高い MOD が乗った組は落ちていないか
 *
 *   node scripts/check-htc-search-cut.mjs
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
let failed = 0;
const fail = (m) => { console.log(`   NG: ${m}`); failed++; };
const ok = (m) => console.log(`   ok: ${m}`);

const prices = M.indexPrices(JSON.parse(readFileSync(SHEET, "utf8")));
const cls = M.itemBaseFor(data, "Sapphire Ring");
const p = M.pricesForBase(prices, cls);
const poolIds = [...cls.pools.normal.prefixes, ...cls.pools.normal.suffixes];
const targets = poolIds.slice(0, 5).map((id) => ({ modId: id, minTierIndex: 0 }));

const solo = M.soloCosts(data, p, cls, targets, { level: 80 });
console.log("   1 個ずつの費用:");
for (const s of [...solo].sort((a, b) => b.expectedCost - a.expectedCost)) {
  console.log(`     ${s.modId}: ${s.expectedCost.toFixed(1)} 高貴`);
}
const combos = M.partialStarts(data, cls, targets, { level: 80 }).map((x) => x.bought);
const cut = M.searchCut(combos, solo);
console.log(`   組み合わせ ${cut.before} 通り → 投げる ${cut.signals} 本 (${cut.seconds} 秒)、落とした ${cut.dropped.length}`);
for (const f of cut.fire) {
  console.log(`     ${f.rank}. ${f.bought.map((b) => b.modId).join(" + ")}  肩代わり ${f.covers} 通り / 価値 ${f.worth.toFixed(0)} 高貴`);
}

// 1. 落とした組は、投げる検索の上位集合になっているか (枠切れ / 安すぎ を除く)
const idsOf = (ts) => new Set(ts.map((t) => t.modId));
const isSubset = (a, b) => [...a].every((x) => b.has(x));
let bad = 0;
for (const d of cut.dropped) {
  if (!d.coveredBy) continue;
  if (!isSubset(idsOf(d.coveredBy), idsOf(d.bought))) bad++;
}
if (bad) fail(`肩代わりの関係になっていない組が ${bad} 件`);
else ok("肩代わりと書いた組は、全部その検索の上位集合になっている");

// 2. 枠
if (!cut.withinBudget) fail(`${cut.signals} 本は 5 分の枠 (30 本) を超えます`);
else ok(`${cut.signals} 本 = ${cut.seconds} 秒、5 分 30 回の枠に収まる`);
if (cut.signals >= cut.before) fail("削れていません");
else ok(`${cut.before} → ${cut.signals} 本 (${Math.round((1 - cut.signals / cut.before) * 100)}% 減)`);

// 3. 一番高い MOD が乗った組が 1 本も投げられていない、はあり得ない
const top = [...solo].sort((a, b) => b.expectedCost - a.expectedCost)[0];
if (!cut.fire.some((f) => f.bought.some((b) => b.modId === top.modId))) {
  fail(`一番高い ${top.modId} を含む検索が 1 本も投げられていません`);
} else ok(`一番高い ${top.modId} を含む検索がある`);

// 4. 投げる本は互いに上位集合でない (極小元のはず)
for (const a of cut.fire) {
  for (const b of cut.fire) {
    if (a === b) continue;
    if (isSubset(idsOf(b.bought), idsOf(a.bought))) fail(`${a.rank} 本目は ${b.rank} 本目の上位集合です (投げる意味がない)`);
  }
}
ok("投げる本どうしが上位集合になっていない");

console.log(failed === 0 ? "\n通りました" : `\n${failed} 件 NG`);
process.exit(failed === 0 ? 0 : 1);
