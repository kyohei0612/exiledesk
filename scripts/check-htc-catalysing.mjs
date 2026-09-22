#!/usr/bin/env node
/**
 * check-htc-catalysing.mjs — 触媒の高貴のお告げの検算 (2026-09-23)
 *
 * **取引所も相場も叩かない**。見るのは 3 つだけ。
 *   1. 倍率を 1 にしたら本家 `exaltProbability` と一致するか (分岐を写した所のズレ検出)
 *   2. 実測 (42/100, 77/100) を倍率の式が再現するか
 *   3. タグ付きは上がり、タグ無しは**下がる**か
 *
 *   node scripts/check-htc-catalysing.mjs
 */
import { bundleEntry } from "./_bundle-ts.mjs";

const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
const data = M.loadPatchSync();
let failed = 0;
const fail = (m) => { console.log(`   NG: ${m}`); failed++; };
const ok = (m) => console.log(`   ok: ${m}`);

// ---- 1. 倍率 1 = 素の高貴。本家と突き合わせる ----
console.log("1. 倍率 1 のとき本家の exaltProbability と一致するか");
const base = M.itemBaseFor(data, "Sapphire Ring") ?? M.itemBaseFor(data, "Gold Ring");
if (!base) {
  console.log("   リングのベースが引けませんでした。この検算はスキップします。");
  process.exit(0);
}
const item = { ...M.whiteItem(base, 80), rarity: "rare" };
const pool = [...base.pools.normal.prefixes, ...base.pools.normal.suffixes];
let compared = 0;
let worst = 0;
for (const id of pool) {
  const mine = M.catalysingOdds(data, item, id, "attribute", 40, { multiplier: 1 }).omened;
  const theirs = M.exaltProbability(data, item, id);
  const d = Math.abs(mine - theirs);
  if (d > worst) worst = d;
  compared++;
}
if (compared === 0) fail("比べる MOD が 1 つもありませんでした");
else if (worst > 1e-12) fail(`最大ズレ ${worst} — 分岐の写しが本家と違います`);
else ok(`${compared} MOD すべて一致 (最大ズレ ${worst})`);

// ---- 2. 実測の再現 ----
console.log("2. 実測 (200 リング) を倍率の式が再現するか");
const BASE_ATTR = 30.5;
const BASE_NON = 69.5;
const hitRate = (m) => (m * BASE_ATTR) / (m * BASE_ATTR + BASE_NON);
for (const s of M.CATALYSING_SAMPLES) {
  const m = M.catalysingMultiplier(s.quality);
  const got = Math.round(hitRate(m) * 100);
  const want = Number(s.hits.split("/")[0]);
  if (Math.abs(got - want) > 1) fail(`品質 ${s.quality}% → ${got}/100、実測は ${s.hits}`);
  else ok(`品質 ${s.quality}% → 倍率 ${m.toFixed(2)}、${got}/100 (実測 ${s.hits})`);
}
// 単調でないと話にならない
const ms = [0, 1, 5, 10, 20, 40, 50].map((q) => M.catalysingMultiplier(q));
if (ms.some((v, i) => i > 0 && v < ms[i - 1])) fail(`品質を上げて倍率が下がりました: ${ms.join(", ")}`);
else ok(`品質 0/1/5/10/20/40/50% → ${ms.map((v) => v.toFixed(2)).join(" / ")}`);
// 品質 0 でお告げが効いてはいけない
if (M.catalysingMultiplier(0) !== 1) fail("品質 0 で倍率が 1 ではありません");
else ok("品質 0 なら倍率 1 (お告げを使う意味が無い)");
// 区間は中央を挟むこと
for (const q of [1.5, 20, 40]) {
  const b = M.catalysingBand(q);
  const c = M.catalysingMultiplier(q);
  if (!(b.lo <= c && c <= b.hi)) fail(`品質 ${q}% の区間 ${b.lo}-${b.hi} が中央 ${c} を挟んでいません`);
}
ok("95% 区間が中央値を挟んでいる");

// ---- 3. 向き: タグ付きは上がり、タグ無しは下がる ----
console.log("3. タグ付きは上がり、タグ無しは下がるか");
const TAG = "attribute";
let up = 0;
let down = 0;
let share = 0;
for (const id of pool) {
  const o = M.catalysingOdds(data, item, id, TAG, 40);
  if (o.plain === 0) continue;
  share = o.taggedShare;
  if (o.boosted) {
    if (o.omened > o.plain) up++;
    else fail(`${id}: タグ付きなのに上がっていません (${o.plain} → ${o.omened})`);
  } else if (o.omened < o.plain) down++;
  else fail(`${id}: タグ無しなのに下がっていません (${o.plain} → ${o.omened})`);
}
if (up === 0) fail(`タグ ${TAG} の MOD がプールに 1 つもありません`);
else ok(`上がった ${up} / 下がった ${down}、プールのタグ付き重み ${(share * 100).toFixed(1)}%`);

// 武器・防具にはカタリストが無いので、お告げを出してはいけない
const staff = M.itemBaseFor(data, "Aegis Quarterstaff");
if (staff) {
  const wp = { ...M.whiteItem(staff, 80), rarity: "rare" };
  const ids = [...staff.pools.normal.prefixes, ...staff.pools.normal.suffixes];
  const moved = ids.filter((id) => {
    const o = M.catalysingOdds(data, wp, id, "attribute", 40);
    return o.plain > 0 && Math.abs(o.omened - o.plain) > 1e-12;
  });
  if (moved.length > 0) fail(`クォータースタッフで確率が動きました (${moved.length} MOD) — カタリストは指輪と首飾りだけです`);
  else ok(`クォータースタッフでは何も動かない (${ids.length} MOD)`);
}

// 見本を 1 つ出す
const sample = pool.find((id) => M.catalysingOdds(data, item, id, TAG, 40).boosted);
if (sample) {
  for (const q of [0, 20, 40]) {
    const o = M.catalysingOdds(data, item, sample, TAG, q);
    console.log(`   ${sample} 品質 ${String(q).padStart(2)}%: ${(o.plain * 100).toFixed(2)}% → ${(o.omened * 100).toFixed(2)}% (倍率 ${o.multiplier.toFixed(2)})`);
  }
}

console.log(failed === 0 ? "\n通りました" : `\n${failed} 件 NG`);
process.exit(failed === 0 ? 0 : 1);
