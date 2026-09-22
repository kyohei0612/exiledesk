#!/usr/bin/env node
/**
 * check-htc-route-steps.mjs — 「うまく行った時の並び」が出るか (2026-09-23)
 *
 * **取引所も相場も叩かない**。手元の相場シートで、方策から手順が 1 本抜けることだけ見る。
 *
 *   node scripts/check-htc-route-steps.mjs
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
const item = { ...M.whiteItem(cls, 80), rarity: "rare" };
const poolIds = [...cls.pools.normal.prefixes, ...cls.pools.normal.suffixes];
const pick = poolIds.slice(0, 3).map((id) => ({ modId: id, minTierIndex: 0 }));

const t0 = Date.now();
const r = M.markovFromItem(data, M.pricesForBase(prices, cls), item, pick, { keepRoutes: true });
console.log(`   解いた: ${r.expectedCost.toFixed(2)} 高貴 / ${Date.now() - t0} ms / 収束 ${r.converged}`);
if (!r.routes) { fail("keepRoutes を渡したのに routes が返っていません"); process.exit(1); }

const walk = M.routeSteps(r.routes, cls);
console.log(`   手順 ${walk.steps.length} 段 / ゴールまで届いた: ${walk.reachedGoal}${walk.stoppedWhy ? " (" + walk.stoppedWhy + ")" : ""}`);
for (const s of walk.steps) {
  console.log(`     ${String(s.no).padStart(2)}. ${s.text}  当たり ${(s.prob * 100).toFixed(1)}% / この手 ${s.cost.toFixed(2)} 高貴 / 残り ${s.remaining.toFixed(0)} 高貴${s.onMiss ? "  外したら → " + s.onMiss : ""}`);
}
if (walk.steps.length === 0) fail("手順が 1 段も出ていません");
else ok(`${walk.steps.length} 段`);
if (!walk.reachedGoal) fail(`ゴールまで届いていません (${walk.stoppedWhy})`);
else ok("ゴールまで届いた");
// 埋まった数は減らないはず (当たりの枝しか辿っていないので)
let prev = -1;
for (const s of walk.steps) {
  if (s.filled < prev) fail(`${s.no} 段目で埋まった数が減りました (${prev} → ${s.filled})`);
  prev = s.filled;
}
ok("埋まった目標の数が減らない");
// 残りの期待費用は段を追うごとに減るはず
for (let i = 1; i < walk.steps.length; i++) {
  if (walk.steps[i].remaining > walk.steps[i - 1].remaining + 1e-6) {
    fail(`${i + 1} 段目で残りが増えました (${walk.steps[i - 1].remaining} → ${walk.steps[i].remaining})`);
  }
}
ok("残りの期待費用が段ごとに減る");
// 1 段目の残りは全体の期待費用と一致するはず
if (walk.steps.length && Math.abs(walk.steps[0].remaining - r.expectedCost) > 1e-6) {
  fail(`1 段目の残り ${walk.steps[0].remaining} が期待費用 ${r.expectedCost} と違います`);
} else ok("1 段目の残り = 全体の期待費用");

console.log(failed === 0 ? "\n通りました" : `\n${failed} 件 NG`);
process.exit(failed === 0 ? 0 : 1);
