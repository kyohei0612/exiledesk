#!/usr/bin/env node
/**
 * check-htc-mod-text.mjs — MOD を日本語 1 行にできているか (2026-09-23)
 *
 * **取引所も相場も叩かない**。ベースから選んで組む道で出る文面が、
 * クライアントの表記で出せているかだけを見る。
 *
 *   node scripts/check-htc-mod-text.mjs
 */
import { bundleEntry } from "./_bundle-ts.mjs";

const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
const data = M.loadPatchSync();
let failed = 0;
const fail = (m) => { console.log(`   NG: ${m}`); failed++; };
const ok = (m) => console.log(`   ok: ${m}`);

// 主要なベースのプールが、どれだけ日本語で出せるか
const BASES = ["Sapphire Ring", "Gold Ring", "Stellar Amulet", "Aegis Quarterstaff", "Expert Laminated Vest"];
let total = 0;
let english = 0;
const left = [];
for (const name of BASES) {
  const base = M.itemBaseFor(data, name);
  if (!base) continue;
  const ids = [...base.pools.normal.prefixes, ...base.pools.normal.suffixes];
  let en = 0;
  for (const id of ids) {
    const mod = data.mods.get(id);
    if (!mod) continue;
    total++;
    const ja = M.jaOfMod(mod);
    // 英語のまま残っている = 表に無い。落とさず数える
    if (/[A-Za-z]{4,}/.test(ja)) { en++; left.push(`${id}: ${ja}`); }
  }
  console.log(`   ${name}: ${ids.length} MOD、英語のまま ${en}`);
  english += en;
}
if (total === 0) fail("ベースが 1 つも引けませんでした");
const rate = total ? (1 - english / total) * 100 : 0;
if (rate < 95) fail(`日本語で出せたのが ${rate.toFixed(1)}% しかありません (95% は欲しい)`);
else ok(`日本語で出せた ${rate.toFixed(1)}% (${total - english}/${total})`);
if (left.length) {
  console.log("   表に無くて英語のまま残した物:");
  for (const l of left.slice(0, 10)) console.log(`     ${l}`);
}

// 引けない行を勝手に訳していないこと (英語が残るのが正しい)
if (M.jaOfModLine("This Is Not A Real Modifier Line") !== null) {
  fail("表に無い行に何か返しています (null のはず)");
} else ok("表に無い行には null を返す (勝手に訳さない)");

// 符号と埋まった数字の吸収
for (const [line, want] of [["+# to maximum Life", "最大ライフ"], ["Adds # to 3 Physical Damage to Attacks", "物理"]]) {
  const got = M.jaOfModLine(line);
  if (!got || !got.includes(want)) fail(`「${line}」→ ${got}`);
  else ok(`「${line}」→ ${got}`);
}

console.log(failed === 0 ? "\n通りました" : `\n${failed} 件 NG`);
process.exit(failed === 0 ? 0 : 1);
