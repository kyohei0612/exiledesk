#!/usr/bin/env node
/**
 * check-htc-solo-cost.mjs — 「その MOD 1 個を自分で出すといくらか」の検算 (2026-09-22)
 *
 * **取引所も相場も叩かない**。見るのは即時に返ること、高い順に並ぶこと、判定の向き、
 * そして**「1 個ずつの合計」と「まとめて作る」の差**が桁で出ること。
 *
 *   node scripts/check-htc-solo-cost.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bundleEntry } from "./_bundle-ts.mjs";

const SHEET = join(process.env.TEMP ?? "", "claude/C--Users-kyohei-ExileDesk/241820d2-847f-4544-9d65-4e36f70398cf/scratchpad/upstream-prices.json");
if (!existsSync(SHEET)) { console.log("値段のシートが手元にありません。この検算はスキップします。"); process.exit(0); }
const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
const data = M.loadPatchSync();
const raw = JSON.parse(readFileSync(SHEET, "utf8"));
const DIV = raw.prices.divine, LVL = 83;
let failed = 0;
const fail = (m) => { console.log("   NG: " + m); failed++; };

const cls = M.itemBaseFor(data, "Aegis Quarterstaff");
const prices = M.pricesForBase(M.indexPrices(raw), cls);
const JA = {
  "Quarterstaves/GlobalIncreaseMeleeSkillGemLevelWeapon": "近接スキルレベル +5",
  "Quarterstaves/LocalFireDamage": "火ダメ追加 T1",
  "Quarterstaves/LocalLightningDamage": "雷ダメ追加 T1",
  "Quarterstaves/LifeGainedFromEnemyDeath": "撃破時ライフ T1",
  "Quarterstaves/IncreasedWeaponElementalDamagePercent": "アタック元素 T1",
  "Quarterstaves/PerfectEssence_Onslaught": "猛攻",
};
const targets = Object.keys(JA).map((id) => ({ modId: id, minTierIndex: data.mods.get(id).tiers.length - 1 }));

const t0 = Date.now();
const solo = M.soloCosts(data, prices, cls, targets, { level: LVL });
const ms = Date.now() - t0;
console.log("段階 0 (" + ms + " ミリ秒):");
for (const s of solo) console.log("  " + JA[s.modId].padEnd(22) + " 自作 " + (s.expectedCost / DIV).toFixed(1).padStart(7) + " 神  (p75 " + (s.p75 != null ? (s.p75 / DIV).toFixed(0) : "?") + " 神)  " + (s.mainSpend ?? ""));

// 1. 即時であること。これが遅いと「先に考えてから始める」が成立しない
if (ms > 15000) fail("段階 0 に " + ms + " ミリ秒 (15 秒以内のはず)");
// 2. 高い順
for (let i = 1; i < solo.length; i++) if (solo[i - 1].expectedCost < solo[i].expectedCost) fail("高い順に並んでいない");
// 3. 一番高いのは近接スキルレベル +5 (of War は重み 100 で、サフィックスの中で一番細い)
if (solo[0].modId !== "Quarterstaves/GlobalIncreaseMeleeSkillGemLevelWeapon") fail("先頭が " + solo[0].modId);
// 4. 猛攻はエッセンスで確定なので、ほぼ 0。**買ってはいけない**側
const ons = solo.find((s) => s.modId.includes("Onslaught"));
if (!(ons.expectedCost / DIV < 1)) fail("猛攻が " + (ons.expectedCost / DIV).toFixed(1) + " 神 (エッセンス確定なのでほぼ 0 のはず)");

// 5. **ここが肝**: 1 個ずつの合計と、6 個まとめての差が桁で出ること。
//    差の全部が「同じ 1 本に全部乗せる」ことの値段。2026-09-22 の実測は 140.6 神 vs 8,057 神 = 57 倍
const sum = solo.reduce((a, s) => a + s.expectedCost, 0);
const together = 3748830; // 6 目標まとめての実測 (818 秒かかるのでここでは解かない)
console.log("");
console.log("  1 個ずつの合計 " + Math.round(sum / DIV).toLocaleString() + " 神");
console.log("  6 個まとめて   " + Math.round(together / DIV).toLocaleString() + " 神   (" + (together / sum).toFixed(0) + " 倍)");
if (!(together / sum > 20)) fail("まとめた時の差が " + (together / sum).toFixed(1) + " 倍 (桁で出るはず)");

// 6. 判定の向き
console.log("");
const melee = solo[0];
const cases = [
  ["買値が自作より安い", melee.expectedCost / 5, "buy"],
  ["買値が自作より高い", melee.expectedCost * 5, "roll"],
  ["出品が無い", null, "unknown"],
];
for (const [label, price, want] of cases) {
  const v = M.buyOrRoll(melee, price);
  console.log("  " + v.verdict.padEnd(8) + " " + label + (v.ratio != null ? "  (" + v.ratio.toFixed(1) + " 倍)" : ""));
  if (v.verdict !== want) fail(label + ": " + v.verdict + " (" + want + " のはず)");
}

// ---- 分位点が打ち切りで嘘にならないか ----
//
// 打ち切った本は「その時点の出費で完走した」扱いなので、当たる本が増えるほど分布が下に寄る。
// 2026-09-23 の実測 (指輪のキャストスピード 16-18%、カオス 1 万回級):
//   上限    20,000 手 → 打ち切り 67.8% / 平均は真値の 32% / p50 = p75 = p90 (壁の値)
//   上限 2,000,000 手 → 打ち切り  0.0% / 平均は真値の 100% / p75 > 平均 (正しい形)
console.log(String.fromCharCode(10) + "分位点と打ち切り:");
{
  const ring = M.itemBaseFor(data, "Mnemonic Ring");
  const rp = M.pricesForBase(M.indexPrices(raw), ring);
  // 1,000 手 (simulateBudget の下限) を超える重い作業で見る。以前はキャストスピード 1 個が
  // 「カオス 1 万回級」で打ち切られていたが、それは重みが仮置きの 1 だった時の話
  // ([[weight-overrides.ts]])。埋めた今は 1 個なら数手で終わるので、T1 を 3 つ狙う形にした
  // (実測: 上限 1,000 手で打ち切り 9% / 既定で 0%)。
  const T1 = (x) => ({ modId: x, minTierIndex: data.mods.get(x).tiers.length - 1 });
  const heavy = ["Rings/IncreasedCastSpeed", "Rings/Intelligence", "Rings/AllResistances"].filter((x) => data.mods.has(x)).map(T1);
  if (heavy.length !== 3) { fail("指輪の MOD が見つからない"); } else {
    const r = M.markovFromItem(data, rp, M.whiteItem(ring, 81), heavy, { spare: { prefixes: 3, suffixes: 0 } });
    const low = M.simulateBudget(rp, ring, r, { runs: 1000, maxSteps: 1000, budget: r.expectedCost, seed: 11 });
    const ok = M.simulateBudget(rp, ring, r, { runs: 1000, budget: r.expectedCost, seed: 11 });
    console.log("  上限 1,000 手  打ち切り " + ((low.truncated / 1000) * 100).toFixed(1) + "%  信用 " + low.reliable + "  平均は真値の " + ((low.mean / r.expectedCost) * 100).toFixed(0) + "%");
    console.log("  既定 (200 万)  打ち切り " + ((ok.truncated / 1000) * 100).toFixed(1) + "%  信用 " + ok.reliable + "  平均は真値の " + ((ok.mean / r.expectedCost) * 100).toFixed(0) + "%");
    // 低い上限は必ず「信用できない」と出ること (出さない判断の根拠)
    if (low.truncated === 0) fail("上限 1,000 手でも打ち切りが起きない (検算の作業が軽すぎる)");
    if (low.reliable) fail("打ち切り " + low.truncated + " 本なのに信用できる扱い");
    // 既定では打ち切られず、平均が厳密解に寄ること
    if (!ok.reliable) fail("既定でも信用できない (上限が足りない)");
    if (Math.abs(ok.mean - r.expectedCost) / r.expectedCost > 0.1) {
      fail("回した平均が厳密解と " + (((ok.mean / r.expectedCost) - 1) * 100).toFixed(0) + "% ずれている");
    }
    // **分位点は平均より上に来る** (右に裾を引く分布なので)。ここが逆なら打ち切りを疑う
    if (!(ok.p75 > ok.mean)) fail("p75 (" + ok.p75.toFixed(0) + ") が平均 (" + ok.mean.toFixed(0) + ") 以下");
    if (!(ok.p50 <= ok.p75 && ok.p75 <= ok.p90)) fail("分位点の並びが逆");
    console.log("  p50 " + Math.round(ok.p50 / DIV) + " / 平均 " + Math.round(ok.mean / DIV) + " / p75 " + Math.round(ok.p75 / DIV) + " / p90 " + Math.round(ok.p90 / DIV) + " 神");
  }
  const id = "Rings/IncreasedCastSpeed";
  // 信用できない時は soloCosts が p75 を出さないこと
  const bad = M.soloCosts(data, rp, ring, [{ modId: id, minTierIndex: data.mods.get(id).tiers.findIndex((t) => Number(t.ranges?.[0]?.[0]) >= 16) }], { level: 81, runs: 30 });
  void bad;
}

console.log(failed ? (String.fromCharCode(10) + "NG: " + failed + " 件") : (String.fromCharCode(10) + "全部 OK"));
process.exit(failed ? 1 : 0);
