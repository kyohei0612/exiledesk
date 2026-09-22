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

console.log(failed ? `\nNG: ${failed} 件` : "\n全部 OK");
process.exit(failed ? 1 : 0);
