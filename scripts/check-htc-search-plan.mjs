#!/usr/bin/env node
/**
 * check-htc-search-plan.mjs — トレードに何回投げるかの計画 (2026-09-23)
 *
 * オーナー指示:「トレード制限かからんように仕組化してからトレードでテストしよう。
 * テスト指示までトレードは使わんように。なんこ信号送らないといけないのか整理しなきゃ」。
 *
 * **この検算は 1 回もトレードに投げません。**組み立てた計画の形だけ見ます。
 *
 *   node scripts/check-htc-search-plan.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bundleEntry } from "./_bundle-ts.mjs";

const SHEET = join(process.env.TEMP ?? "", "claude/C--Users-kyohei-ExileDesk/241820d2-847f-4544-9d65-4e36f70398cf/scratchpad/upstream-prices.json");
if (!existsSync(SHEET)) { console.log("値段のシートが手元にありません。この検算はスキップします。"); process.exit(0); }
const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
const data = M.loadPatchSync();
const raw = JSON.parse(readFileSync(SHEET, "utf8"));
let failed = 0;
const fail = (m) => { console.log("   NG: " + m); failed++; };
const NLC = String.fromCharCode(10);

const RING = [
  "Rarity: Rare", "Rage Grip", "Mnemonic Ring", "--------",
  "Quality (Mana Modifiers): +40% (augmented)", "--------", "Item Level: 82", "--------",
  "8% increased maximum Mana (implicit)", "--------",
  "36% increased Mana Cost Efficiency of Spells (fractured)",
  "+235 to maximum Mana", "+29 to Intelligence", "+14% to all Elemental Resistances",
  "24% increased Cast Speed (desecrated)", "8% increased maximum Mana (crafted)",
].join(NLC);
const it = M.parseJaItem(RING);
const got = M.targetsFor(data, it);
const cls = M.baseForSolving(data, it.baseType, got.skippedSides);
const prices = M.pricesForBase(M.indexPrices(raw), cls);
const solo = M.soloCosts(data, prices, cls, got.targets, { level: it.itemLevel });
const order = solo.map((s) => got.targets.find((t) => t.modId === s.modId));

const plan = M.searchPlan(data, cls, order, {
  baseType: it.baseType, ilvlMin: it.itemLevel, mustBuy: got.skipped, max: 6,
});
console.log("投げる計画:");
console.log("  " + plan.note);
plan.searches.forEach((p, i) => console.log("  " + (i + 1) + ". [" + (p.fractured ? "固定済み" : "普通") + "] " + p.label));

// 1. 枠を超えない (超えると 30 分の罰則)
if (plan.overBudget) fail("5 分の枠を超える計画になっている");
if (plan.searches.length > M.SEARCH_BUDGET_PER_5MIN) fail("本数が枠を超えている");
// 2. 一番つきにくい MOD の固定済みが先頭。**ここが律速**なので他を先に投げてはいけない
const first = plan.searches[0];
if (!first?.fractured) fail("先頭が固定済みの検索になっていない");
if (first?.modIds?.[0] !== order[0].modId) fail("先頭が一番つきにくい MOD を狙っていない");
// 3. 固定済みの検索は stat の頭が fractured. になっている
const f = first.query.query.stats[0].filters[0];
if (!String(f.id).startsWith("fractured.")) fail("固定済みの検索なのに頭が " + f.id);
// 4. 普通の検索は explicit. のまま (取り違えていない)
const plain = plan.searches.find((p) => !p.fractured);
if (!plain) fail("普通の検索が 1 本も無い");
else if (!String(plain.query.query.stats[0].filters[0].id).startsWith("explicit.")) fail("普通の検索の頭が explicit. でない");
// 5. ベース名で絞っている (カテゴリ当てずっぽうを避ける)
if (first.query.query.type?.option !== it.baseType) fail("ベース名で絞っていない");
// 6. **買うしかない MOD は計画に出さない。**組めない検索を出すと 0 件で枠を捨てる
if (plan.mustBuy.total !== 1) fail("買うしかない MOD の数が " + plan.mustBuy.total + " (1 のはず)");
if (plan.mustBuy.searchable !== 0) fail("組めないはずの検索を組めた扱いにしている");
if (!plan.note.includes("手で探して")) fail("手で探す必要があることを断っていない");
// 7. 時間の見積もりが間隔どおり
const want = Math.max(0, (plan.searches.length - 1) * M.SEARCH_INTERVAL_SEC);
if (Math.abs(plan.seconds - want) > 1e-6) fail("所要時間が " + plan.seconds + " 秒 (" + want + " のはず)");
console.log("  所要 " + Math.ceil(plan.seconds) + " 秒 / 枠 " + M.SEARCH_BUDGET_PER_5MIN + " 回中 " + plan.searches.length + " 回");

// ---- 固定済みを探す価値が無いなら外す ----
//
// オーナー指摘:「安全に決定論クラフトなら完成品ができる場合もあるだろうから、その場合は別に
// フラクチャー品探さなくていいよね」。検索 1 回は 10.5 秒で、枠は 5 分で 30 回しかない。
//
// **「壊す手 (消去 / カオス) を使うか」では判定できない** ── 1 個狙いでも「外したら消して
// 振り直す」のが最安なので、ほぼ全部当たる。**固定したらいくら安くなるか**で見る
// (実測 2026-09-23 / Rage Grip 5 目標: キャストスピードは 1% まで落ちるが、
//  全元素耐性と知性は 60% 止まり)。
//
// 2026-09-23 追記: 上の実測はキャストスピードの重みが**仮置きの 1** だった時の物で、
// Craft of Exile の推定値 (1 段 1,000) で埋めた今はキャスピは一番つきにくい MOD ではない
// ([[weight-overrides.ts]])。**どの MOD が律速かに依らない**よう、その時点で一番費用が高い
// MOD を「固定する価値がある 1 件」として渡す。
console.log(NLC + "固定済みを探す価値で絞る:");
{
  const hardest = [...solo].sort((a, b) => b.expectedCost - a.expectedCost)[0];
  const worth = hardest ? [hardest.modId] : [];
  console.log("  一番費用が高い MOD: " + (hardest ? hardest.modId + " (" + Math.round(hardest.expectedCost) + " 高貴)" : "無し"));
  const wide = M.searchPlan(data, cls, order, { baseType: it.baseType, ilvlMin: it.itemLevel, mustBuy: got.skipped, max: 6 });
  const narrow = M.searchPlan(data, cls, order, { baseType: it.baseType, ilvlMin: it.itemLevel, mustBuy: got.skipped, max: 6, fractureWorth: worth });
  const fxOf = (p) => p.searches.filter((x) => x.fractured).length;
  console.log("  絞る前 " + wide.searches.length + " 回 (固定済み " + fxOf(wide) + ") = " + Math.ceil(wide.seconds) + " 秒");
  console.log("  絞った後 " + narrow.searches.length + " 回 (固定済み " + fxOf(narrow) + ") = " + Math.ceil(narrow.seconds) + " 秒");
  if (fxOf(narrow) !== 1) fail("価値のある 1 件だけにならない (固定済み " + fxOf(narrow) + " 回)");
  if (narrow.searches.length >= wide.searches.length) fail("絞っても本数が減っていない");
  if (narrow.seconds >= wide.seconds) fail("絞っても時間が減っていない");
  // 絞っても先頭は「一番つきにくい MOD の固定済み」のまま (そこが律速)
  if (!narrow.searches[0]?.fractured) fail("絞ったら先頭が固定済みでなくなった");
  // 何も渡さなければ今まで通り全部出る
  if (fxOf(wide) < 2) fail("絞る前なのに固定済みが 1 件しか出ていない");
}

console.log(failed ? (NLC + "NG: " + failed + " 件") : (NLC + "全部 OK (トレードには 1 回も投げていません)"));
process.exit(failed ? 1 : 0);
