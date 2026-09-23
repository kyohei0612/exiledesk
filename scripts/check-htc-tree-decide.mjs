#!/usr/bin/env node
/**
 * check-htc-tree-decide.mjs — 樹 MOD の固定を「どれを何個まで試すか」(2026-09-23)
 *
 * **取引所も相場も叩かない**。架空の出品を並べて、3 つ見る。
 *   1. 期待費用の式が、実際に順に試して回した平均と合うか
 *   2. 選んだ順が、他の並べ方より安いか (並べ方が最適か)
 *   3. 固定済み品より後ろは試さないか (打ち切り)
 *
 *   node scripts/check-htc-tree-decide.mjs
 */
import { bundleEntry } from "./_bundle-ts.mjs";

const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
let failed = 0;
const fail = (m) => { console.log(`   NG: ${m}`); failed++; };
const ok = (m) => console.log(`   ok: ${m}`);

// mulberry32 (Math.imul で 32 ビットに収める。素で掛けると 2^53 を超えて偏る)
let seed = 7;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// 実勢に近い値段 (神)
const P = { orb: 8.52, annul: 0.73, bone: 0.34, necro: 3, exalt: 0.002, dextralExalt: 0.04 };
const L = (source, price, prefixes, suffixes, label) => ({ source, price, prefixes, suffixes, label });
const listings = [
  L("fractured", 66, 1, 3, "固定済み 66"),
  L("fractured", 90, 2, 3, "固定済み 90"),
  L("strict", 2, 1, 2, "厳しい P1+S2 2 神"),
  L("strict", 1.5, 1, 3, "厳しい P1+S3 1.5 神"),
  L("strict", 1.8, 1, 1, "厳しい P1+S1 1.8 神"),
  L("loose", 0.6, 2, 2, "ゆるい 4MOD 0.6 神"),
  L("loose", 0.4, 3, 3, "ゆるい 6MOD 0.4 神"),
  L("loose", 0.3, 2, 3, "ゆるい 5MOD 0.3 神"),
  L("loose", 5, 1, 1, "ゆるい 2MOD (固定まで届かない)"),
];

const d = M.decide(listings, P);
console.log("   試す順:");
for (const c of d.order) console.log(`     ${c.listing.label.padEnd(22)} ${c.how.padEnd(16)} 1回 ${c.perTry.toFixed(2)} 神 / 成功率 ${(c.hit * 100).toFixed(1)}% / 成功1回あたり ${c.perSuccess.toFixed(2)} 神`);
console.log(`   全部外れたら: ${d.fallback ? d.fallback.listing.label : "無し"}`);
console.log(`   試さない: ${d.skipped.map((c) => c.listing.label).join(" / ") || "無し"}`);
console.log(`   期待費用 ${d.expected.toFixed(2)} 神 (最初から固定済みを買うと ${d.buyOutright} 神)`);

// ---- 1. 回した平均と合うか ----
console.log("1. 式と、順に試して回した平均");
const simulate = (order, fallback) => {
  let spent = 0;
  for (const c of order) {
    spent += c.perTry;
    if (rnd() < c.hit) return spent;
  }
  return spent + (fallback ? fallback.perTry : 0);
};
// perTry は期待値 (消去で途中で止まる分を含む) なので、回すのは「1 回分の期待額 + 成功率」で十分
const R = 400_000;
let sum = 0;
for (let i = 0; i < R; i++) sum += simulate(d.order, d.fallback);
const mean = sum / R;
if (Math.abs(mean - d.expected) / d.expected > 0.01) fail(`式 ${d.expected.toFixed(3)} / 回した平均 ${mean.toFixed(3)}`);
else ok(`式 ${d.expected.toFixed(3)} 神 / 回した平均 ${mean.toFixed(3)} 神`);

// ---- 2. 並べ方が最適か (候補を入れ替えた全順列と比べる) ----
console.log("2. 他の並べ方より安いか");
const cands = d.order;
const exp = (ord) => {
  let e = 0, miss = 1;
  for (const c of ord) { e += miss * c.perTry; miss *= 1 - c.hit; }
  return e + miss * (d.fallback ? d.fallback.perTry : 0);
};
let worse = 0, total = 0;
const perm = (arr, k = 0) => {
  if (k === arr.length) { total++; if (exp(arr) < d.expected - 1e-9) worse++; return; }
  for (let i = k; i < arr.length; i++) { [arr[k], arr[i]] = [arr[i], arr[k]]; perm(arr, k + 1); [arr[k], arr[i]] = [arr[i], arr[k]]; }
};
perm([...cands]);
if (worse > 0) fail(`${total} 通りの並べ方のうち ${worse} 通りがもっと安い`);
else ok(`${total} 通りの並べ方すべてより安いか同じ`);

// ---- 3. 打ち切り ----
console.log("3. 固定済みより後ろは試さないか");
const after = d.skipped.filter((c) => c.perSuccess < (d.buyOutright ?? Infinity));
if (after.length) fail(`固定済みより安いのに試さない候補がある: ${after.map((c) => c.listing.label).join(", ")}`);
else ok("試さない候補は全部、固定済みを買うより成功 1 回あたりが高い");
if (d.order.some((c) => c.perSuccess > (d.buyOutright ?? Infinity))) fail("固定済みより高い候補を試しています");
else ok("試す候補は全部、固定済みを買うより成功 1 回あたりが安い");
if (listings.some((l) => l.label.includes("届かない")) && d.order.concat(d.skipped).some((c) => c.listing.label.includes("届かない"))) {
  fail("2 MOD の物を候補に入れています (冒涜 1 回で 4 MOD に届かない)");
} else ok("2 MOD の物は候補から外した");
const strictGamble = d.order.concat(d.skipped).filter((c) => c.listing.source === "strict" && c.how === "reduce");
if (strictGamble.length) fail(`厳しい検索の物を消去ガチャで試しています: ${strictGamble.map((c) => c.listing.label).join(", ")}`);
else ok("厳しい検索の物は消去ガチャを使わない (そのまま固定 / 右側の高貴で足してネクロ冒涜のどちらか)");
const s3 = d.order.concat(d.skipped).find((c) => c.listing.label.includes("P1+S3"));
if (!s3 || s3.how !== "necro-desecrate" || Math.abs(s3.hit - 1 / 3) > 1e-12) fail(`P1+S3 の扱いが ${s3 ? s3.how + " " + s3.hit : "候補に無い"} (ネクロ冒涜で 1/3 のはず)`);
else ok("P1+S3 は右側ネクロ冒涜がサフィを 1 個置き換えて 1/3");
if (d.order.concat(d.skipped).some((c) => c.how === "safe-reduce")) fail("消去のお告げを使う道が残っています (オーナーは使わない)");
else ok("消去のお告げを使う道は無い");
if (!(d.expected <= (d.buyOutright ?? Infinity))) fail("期待費用が、最初から固定済みを買うより高い");
else ok(`最初から固定済みを買うより ${((d.buyOutright ?? 0) - d.expected).toFixed(2)} 神安い`);

// ---- 4. 厳しい検索の条件 ----
console.log("4. 厳しい検索の条件");
const data = M.loadPatchSync();
const cls = M.itemBaseFor(data, "Mnemonic Ring");
const table = M.htcDropOnly();
const k = Object.keys(table).find((x) => x.includes("mana cost efficiency of spells"));
const buys = M.treeBuys([{ text: k, ...table[k] }]);
const q = M.treeBuyQuery(cls, buys, { baseType: "Mnemonic Ring", ilvlMin: 80, fractured: false, strict: true });
const f = q.query.stats[0].filters;
const pre = f.find((x) => x.id === M.STRICT_PREFIX), suf = f.find((x) => x.id === M.STRICT_SUFFIX);
if (!pre || pre.value.max !== 1 || pre.value.min !== undefined) fail(`プレフィックスの条件が ${JSON.stringify(pre)}`);
else ok("プレフィックスモッド #個: 上限 1");
if (suf) fail(`サフィックスの条件が入っています ${JSON.stringify(suf)} (数は問わない)`);
else ok("サフィックスモッド #個: 条件なし (右側の高貴で足せるので)");
const s1 = d.order.concat(d.skipped).find((c) => c.listing.label.includes("P1+S1"));
if (!s1 || s1.how !== "necro-desecrate" || Math.abs(s1.hit - 1 / 3) > 1e-12) fail(`P1+S1 の扱いが ${s1 ? s1.how + " " + s1.hit : "候補に無い"}`);
else ok(`P1+S1 は右側の高貴で 1 個足してから冒涜 → 1/3 (1 回 ${s1.perTry.toFixed(2)} 神)`);
if (!f.some((x) => x.id.startsWith("explicit."))) fail("樹 MOD が explicit で入っていません");
else ok("樹 MOD は explicit (固定無し)");
const fq = M.treeBuyQuery(cls, buys, { baseType: "Mnemonic Ring", ilvlMin: 80, fractured: true, strict: true });
if (fq.query.stats[0].filters.some((x) => x.id.startsWith("pseudo."))) fail("固定済みの検索に数の条件が入っています");
else ok("固定済みの検索には数の条件を入れない");

console.log(failed === 0 ? "\n通りました" : `\n${failed} 件 NG`);
process.exit(failed === 0 ? 0 : 1);
