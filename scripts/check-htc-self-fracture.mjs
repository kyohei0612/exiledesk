#!/usr/bin/env node
/**
 * check-htc-self-fracture.mjs — 特殊 MOD を自前で固定する見積もり (2026-09-23)
 *
 * **取引所も相場も叩かない**。見るのは 3 つ。
 *   1. 式の成功率 1/N が、回した結果と合うか (減らす道もそのままの道も)
 *   2. 期待費用の式が、回した平均と合うか
 *   3. 「オーブが高いと減らすほうが得」が分かれ目の前後で入れ替わるか
 *
 *   node scripts/check-htc-self-fracture.mjs
 */
import { bundleEntry } from "./_bundle-ts.mjs";

const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
let failed = 0;
const fail = (m) => { console.log(`   NG: ${m}`); failed++; };
const ok = (m) => console.log(`   ok: ${m}`);

// 決まった乱数 (毎回同じ結果にする)。mulberry32。
// **`seed * 1103515245` を素で掛けないこと。**JS の数値は 2^53 を超えると下の桁が落ちて、
// 偏った乱数になります (最初そう書いて、単純な幾何分布が 3% ずれた)。Math.imul で 32 ビットに収める
let seed = 12345;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const P = { base: 0.6, orb: 5, annul: 0.69, bone: 0.43 };

/** 1 個成功するまで回して、使った額を返す */
function run(N, kind) {
  let spent = 0;
  for (;;) {
    spent += P.base;
    if (kind === "direct") {
      spent += P.orb;
      if (rnd() < 1 / N) return spent;
      continue;
    }
    let mods = N, alive = true;
    while (mods > 3) {
      spent += P.annul;
      if (rnd() < 1 / mods) { alive = false; break; }
      mods--;
    }
    if (!alive) continue;
    spent += P.bone + P.orb;
    if (rnd() < 1 / 3) return spent;
  }
}

const R = 400_000;
console.log("1. 成功率と期待費用を回した結果と突き合わせる");
for (const N of [4, 5, 6]) {
  const est = M.selfFracture(N, P);
  for (const r of est.routes) {
    let sum = 0;
    for (let i = 0; i < R; i++) sum += run(N, r.kind);
    const mean = sum / R;
    const err = Math.abs(mean - r.expected) / r.expected;
    const label = `${N} MOD / ${r.kind === "direct" ? "そのまま" : "減らす"}`;
    if (Math.abs(r.hit - 1 / N) > 1e-12) fail(`${label}: 成功率が 1/N ではありません (${r.hit})`);
    if (err > 0.01) fail(`${label}: 式 ${r.expected.toFixed(2)} 神 / 回した平均 ${mean.toFixed(2)} 神 (${(err * 100).toFixed(1)}% ずれ)`);
    else ok(`${label}: 式 ${r.expected.toFixed(2)} 神 / 回した平均 ${mean.toFixed(2)} 神`);
  }
}

console.log("2. 分かれ目の前後で得な方が入れ替わるか");
for (const N of [4, 5, 6]) {
  const be = M.selfFracture(N, P).breakEvenOrb;
  const lo = M.selfFracture(N, { ...P, orb: be * 0.9 }).best.kind;
  const hi = M.selfFracture(N, { ...P, orb: be * 1.1 }).best.kind;
  if (lo !== "direct" || hi !== "reduce") fail(`${N} MOD: 分かれ目 ${be.toFixed(2)} 神の手前 ${lo} / 先 ${hi}`);
  else ok(`${N} MOD: オーブ ${be.toFixed(2)} 神より安ければそのまま、高ければ減らす`);
}

console.log("3. 端の扱い");
if (M.selfFracture(3, P).routes.some((r) => r.kind === "direct")) fail("3 MOD でそのまま固定を出しています (オーブは 4 MOD 以上)");
else ok("3 MOD では「そのまま」を出さない (オーブの要求 4 に届かない)");
if (M.selfFracture(5, { ...P, orb: null }).best !== null) fail("オーブの値段が無いのに答えを出しています");
else ok("オーブの値段が無ければ答えを出さない");
const need90 = M.itemsFor(4, 0.9);
if (need90 !== 9) fail(`4 MOD で 90% に届く個数が ${need90} (9 のはず)`);
else ok("4 MOD で 90% に届くのは 9 個");

console.log(failed === 0 ? "\n通りました" : `\n${failed} 件 NG`);
process.exit(failed === 0 ? 0 : 1);
