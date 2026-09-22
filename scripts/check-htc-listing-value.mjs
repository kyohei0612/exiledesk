#!/usr/bin/env node
/**
 * check-htc-listing-value.mjs — 出品 1 件の値踏み (2026-09-23)
 *
 * **取引所も相場も叩かない**。オーナーの例をそのまま組んで、3 つ見る。
 *   1. 狙いでない固定済みが「枠を潰す物」として扱われ、ゴミ扱いより安くなるか
 *   2. その側のお告げ付き消去が確定と判定されるか
 *   3. 確定でも値段が高ければ、それは値段として返るか (確定 = 使うべき、ではない)
 *
 *   node scripts/check-htc-listing-value.mjs
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
const suf = cls.pools.normal.suffixes;
// 狙い: サフィックス 3 個
const targets = suf.slice(0, 3).map((id) => ({ modId: id, minTierIndex: 0 }));

// オーナーの例: プレフィックスに「固定済み (エンジンが知らない)」1 + ゴミ 1、サフィに狙い 2
const listing = [
  { modId: null, side: "prefix", fractured: true },
  { modId: null, side: "prefix" },
  { modId: suf[0], side: "suffix" },
  { modId: suf[1], side: "suffix" },
];
const v = M.listingValue(data, p, cls, targets, listing, { level: 80 });
console.log(`   固定済みで潰れた枠 P${v.locked.prefixes}/S${v.locked.suffixes} / ゴミ P${v.junk.prefixes}/S${v.junk.suffixes} / 既に乗っている狙い ${v.held}`);
console.log(`   仕上げ費用 ${v.finish.toFixed(1)} 高貴`);
for (const s of v.sides) {
  console.log(`   ${s.side === "prefix" ? "左側" : "右側"}: ゴミ ${s.junk} / 飛ぶと困る狙い ${s.riskyTargets} → ${s.deterministic ? "お告げ付き消去は確定" : "確定ではない"} (お告げ ${s.omenPrice == null ? "相場に無い" : s.omenPrice.toFixed(0) + " 高貴"})`);
}

// 1. 枠扱い vs ゴミ扱い
const asJunk = M.listingValue(data, p, cls, targets, listing.map((m) => ({ ...m, fractured: false })), { level: 80 });
console.log(`   比較: 枠扱い ${v.finish.toFixed(1)} 高貴 / ゴミ扱い ${asJunk.finish.toFixed(1)} 高貴`);
if (!(v.finish < asJunk.finish)) fail("固定済みを枠扱いしても安くなっていません (消えない物を消す前提のままです)");
else ok(`枠扱いのほうが ${(asJunk.finish - v.finish).toFixed(0)} 高貴安い`);
if (v.locked.prefixes !== 1) fail(`潰れた枠が ${v.locked.prefixes} 個 (1 のはず)`);
else ok("固定済み 1 個ぶん枠が潰れている");

// 2. 確定判定
const pre = v.sides.find((s) => s.side === "prefix");
if (!pre.deterministic) fail("左側のゴミしか無いのに、確定と判定されていません");
else ok("左側は確定 (消せるのがゴミだけ)");
const suffixSide = v.sides.find((s) => s.side === "suffix");
if (suffixSide.deterministic) fail("右側は狙いが乗っているので確定であってはいけません");
else ok("右側は確定ではない (狙いが飛ぶ)");

// 3. 狙いが両側に散っている時は、どちらも確定にならない
const messy = [
  { modId: null, side: "prefix", fractured: true },
  { modId: null, side: "prefix" },
  { modId: suf[0], side: "suffix" },
  { modId: null, side: "suffix" },
];
const v2 = M.listingValue(data, p, cls, targets, messy, { level: 80 });
const s2 = v2.sides.find((s) => s.side === "suffix");
if (s2.deterministic) fail("右側に狙いとゴミが混ざっているのに確定と出ました");
else ok("狙いとゴミが同じ側に混ざれば確定ではない");

// 4. 買値の上限
const withPrice = M.listingValue(data, p, cls, targets, listing, { level: 80, listingDivineAsExalted: v.finish * 3 });
if (withPrice.budget == null || !(withPrice.budget > 0)) fail(`買値の上限が出ていません (${withPrice.budget})`);
else ok(`売値を ${(v.finish * 3).toFixed(0)} 高貴とした時、この出品に出せるのは ${withPrice.budget.toFixed(0)} 高貴まで`);

console.log(failed === 0 ? "\n通りました" : `\n${failed} 件 NG`);
process.exit(failed === 0 ? 0 : 1);
