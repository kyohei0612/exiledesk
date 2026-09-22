#!/usr/bin/env node
/**
 * check-htc-catalysing-mdp.mjs — 触媒の高貴を自動クラフトに入れた影響を測る (2026-09-23)
 *
 * **取引所も相場も叩かない**。手元の相場シートを使い、シートに無いキー
 * (カタリスト / 触媒の高貴のお告げ) だけ**仮の値段**を入れて仕組みを確かめる。
 * 出てくる金額は仕組みの確認用で、**実勢ではない**。実際の判断はアプリ側の
 * カレンシーランキングから引いた値段で行う。
 *
 *   node scripts/check-htc-catalysing-mdp.mjs
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

const raw = JSON.parse(readFileSync(SHEET, "utf8"));
// シートに無い分を仮で埋める。**実勢ではない**ので、ここで出る金額は比較にしか使わない
const FAKE_OMEN = 30;
const FAKE_CATALYST = 0.5;
let faked = [];
if (raw.omens.OmenofCatalysingExaltation === undefined) {
  raw.omens.OmenofCatalysingExaltation = FAKE_OMEN;
  faked.push(`触媒の高貴のお告げ ${FAKE_OMEN} 高貴`);
}
const base = M.itemBaseFor(data, "Sapphire Ring");
const item = { ...M.whiteItem(base, 80), rarity: "rare" };
// 狙い: 属性タグの MOD 1 つ + 適当な別 MOD 1 つ
const poolIds = [...base.pools.normal.prefixes, ...base.pools.normal.suffixes];
const attrId = poolIds.find((id) => M.catalysingOdds(data, item, id, "attribute", 40).boosted);
const otherId = poolIds.find((id) => id !== attrId && !M.catalysingOdds(data, item, id, "attribute", 40).boosted);
if (!attrId || !otherId) {
  console.log("   属性タグの MOD が引けませんでした。スキップします。");
  process.exit(0);
}
const targets = [{ modId: attrId, minTierIndex: 0 }, { modId: otherId, minTierIndex: 0 }];
const setup = M.catalysingSetup(base, [attrId, otherId], data);
if (!setup) fail("指輪なのに catalysing の設定が作られませんでした");
else ok(`タグ ${setup.tags.join(", ")} / 品質 ${setup.qualities.join(", ")}% / カタリスト ${setup.catalystCount(setup.qualities[0])} 個`);

for (const tag of setup?.tags ?? []) {
  const key = M.catalystPriceKey(tag);
  if (raw.prices[key] === undefined) {
    raw.prices[key] = FAKE_CATALYST;
    faked.push(`${key} ${FAKE_CATALYST} 高貴`);
  }
}
if (faked.length) console.log(`   ※ 仮の値段を使用: ${faked.join(" / ")}`);
const prices = M.indexPrices(raw);

// ---- 1. 値段: お告げ + カタリストの両方が乗っているか ----
console.log("1. 手順 1 つの値段にカタリスト代まで乗っているか");
const q = setup.qualities[0];
const n = setup.catalystCount(q);
const plainStep = { currency: "exalt", tier: "base" };
const omenStep = { currency: "exalt", tier: "base", catalysing: { tag: setup.tags[0], quality: q, catalysts: n } };
const cPlain = M.stepCost(prices, plainStep);
const cOmen = M.stepCost(prices, omenStep);
const want = cPlain + (raw.omens.OmenofCatalysingExaltation ?? 0) + n * raw.prices[M.catalystPriceKey(setup.tags[0])];
if (Math.abs(cOmen - want) > 1e-9) fail(`触媒高貴 ${cOmen} 高貴、内訳の合計は ${want} 高貴`);
else ok(`素 ${cPlain} 高貴 → 触媒高貴 ${cOmen.toFixed(2)} 高貴 (お告げ + カタリスト ${n} 個)`);
if (M.stepOmenIds(omenStep).join() !== "OmenofCatalysingExaltation") fail("お告げの引き当てが違います");
else ok("左右のお告げとは排他 (お告げは 1 個)");

// ---- 2. 解いて比べる ----
console.log("2. 自動クラフトが触媒高貴を選ぶか / 解く時間はどうか");
const solve = (catalysing) => {
  const t0 = Date.now();
  const r = M.markovFromItem(data, prices, item, targets, catalysing ? { catalysing } : {});
  return { r, ms: Date.now() - t0 };
};
const off = solve(null);
const on = solve(setup);
const label = (res) => `${res.r.expectedCost.toFixed(2)} 高貴 / ${res.ms} ms`;
console.log(`   お告げ無し: ${label(off)}`);
console.log(`   お告げ有り: ${label(on)}`);
if (!off.r.feasible || !on.r.feasible) fail("解けませんでした");
else if (on.r.expectedCost > off.r.expectedCost + 1e-6) {
  fail(`お告げを足したのに高くなりました (${off.r.expectedCost} → ${on.r.expectedCost}) — 選ばない自由があるはず`);
} else {
  const cut = (1 - on.r.expectedCost / off.r.expectedCost) * 100;
  ok(`${cut.toFixed(1)}% 安くなった (この値段でなら選ぶ価値がある)`);
}
// 方針の中に本当に出てくるか
let used = 0;
for (const [, a] of on.r.policy) if (a?.currency === "exalt" && a.catalysing) used++;
console.log(`   方針の中で触媒高貴を打つ状態: ${used} / ${on.r.policy.size}`);

// ---- 3. 値段を吊り上げたら使わなくなるか ----
console.log("3. カタリストを高くしたら使わなくなるか");
const dear = JSON.parse(JSON.stringify(raw));
for (const tag of setup.tags) dear.prices[M.catalystPriceKey(tag)] = 500;
const dearRes = M.markovFromItem(data, M.indexPrices(dear), item, targets, { catalysing: setup });
let dearUsed = 0;
for (const [, a] of dearRes.policy) if (a?.currency === "exalt" && a.catalysing) dearUsed++;
if (dearUsed > 0) fail(`カタリスト 500 高貴でもまだ ${dearUsed} 状態で使っています`);
else ok("カタリストを 500 高貴にしたら一切使わなくなった (値段で判断できている)");
if (Math.abs(dearRes.expectedCost - off.r.expectedCost) > 1e-6) {
  fail(`使わないはずなのに金額がお告げ無しと違います (${dearRes.expectedCost} vs ${off.r.expectedCost})`);
} else ok("その時の金額はお告げ無しと一致");

console.log(failed === 0 ? "\n通りました" : `\n${failed} 件 NG`);
process.exit(failed === 0 ? 0 : 1);
