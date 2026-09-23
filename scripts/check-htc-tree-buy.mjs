#!/usr/bin/env node
/**
 * check-htc-tree-buy.mjs — 創生の樹の MOD を「固定済みで探す」条件が組めるか (2026-09-23)
 *
 * **取引所も相場も叩かない**。組み立てるだけ。
 *   1. 27 件すべてに stat id があり、取引所の条件に直せるか
 *   2. 条件が `fractured.` になっているか (explicit のままだと固定されていない物が返る)
 *   3. 実物 (死体の円環) の「作れないと断った行」から条件が出るか
 *
 *   node scripts/check-htc-tree-buy.mjs
 */
import { bundleEntry } from "./_bundle-ts.mjs";

const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
const data = M.loadPatchSync();
let failed = 0;
const fail = (m) => { console.log(`   NG: ${m}`); failed++; };
const ok = (m) => console.log(`   ok: ${m}`);

// ---- 1. 27 件ぜんぶ ----
const table = M.htcDropOnly();
const texts = Object.keys(table);
const buys = M.treeBuys(texts.map((t) => ({ text: t, ...table[t] })));
const bad = buys.filter((b) => !b.searchable);
console.log(`   創生の樹からしか出ない MOD ${texts.length} 件`);
if (bad.length) {
  console.log(`   条件を組めない ${bad.length} 件:`);
  for (const b of bad.slice(0, 6)) console.log(`     ${b.text} — ${b.why}`);
}
if (bad.length > 0) fail(`${bad.length} 件は手で探すしかありません`);
else ok("27 件すべて取引所の条件に直せる");

// ---- 2. fractured になっているか ----
const notFractured = buys.flatMap((b) => b.filters).filter((f) => !f.id.startsWith("fractured."));
if (notFractured.length) fail(`${notFractured.length} 本が explicit のままです (固定されていない物が返ります)`);
else ok("条件はすべて fractured. (固定済みだけが返る)");

// ---- 3. 実物から ----
const NL = String.fromCharCode(10);
const TEXT = [
  "アイテムクラス: 指輪", "レアリティ: レア", "死体の円環", "ニーモニックリング", "--------",
  "品質 (マナモッド): +40%", "--------", "アイテムレベル: 80", "--------",
  "最大マナが8%増加する", "--------",
  "スペルのマナコスト効率が29%増加する", "最大マナ +247", "知性 +30",
  "全ての元素耐性 +13%", "最大マナが8%増加する", "キャストスピードが20%増加する",
].join(NL);
const it = M.parseJaItem(TEXT);
const got = M.targetsFor(data, it);
console.log(`\n   死体の円環 の「作れない」行: ${got.skipped.join(" / ")}`);
const real = M.treeBuys(got.dropOnly);
for (const b of real) {
  console.log(`     ${b.text}  (${b.tag} / ${b.side === "P" ? "プレフィックス" : "サフィックス"})`);
  for (const f of b.filters) console.log(`       条件: ${f.id}`);
  if (!b.searchable) console.log(`       ${b.why}`);
}
if (real.length !== got.dropOnly.length) fail(`断った行 ${got.dropOnly.length} 件に対し ${real.length} 件しか出ていません`);
else if (real.some((b) => !b.searchable)) fail("実物の行から条件を組めませんでした");
else ok("実物の「作れない」行から条件が出た");

const cls = M.itemBaseFor(data, it.baseType);
const q = M.treeBuyQuery(cls, real, { ilvlMin: it.itemLevel ?? 80, baseType: it.baseType });
if (!q) fail("クエリが組めませんでした");
else {
  console.log(`\n   組んだクエリ: ${JSON.stringify(q.query).slice(0, 260)}`);
  const ids = q.query.stats[0].filters.map((f) => f.id);
  if (!ids.every((i) => i.startsWith("fractured."))) fail("クエリの条件が fractured. になっていません");
  else ok(`1 本の検索で済む (条件 ${ids.length} 本)`);
  if (q.query.status.option !== "securable") fail(`status が ${q.query.status.option} (securable のはず)`);
  else ok("status は securable");
}

// ---- 4. 固定無しの検索 (自前で固定するベース) ----
// オーナー指示: 固定済みでも固定無しでも、stat は作れない MOD だけ。他は規定通り
const plain = M.treeBuyQuery(cls, real, { ilvlMin: it.itemLevel ?? 80, baseType: it.baseType, fractured: false });
if (!plain) fail("固定無しのクエリが組めませんでした");
else {
  const ids = plain.query.stats[0].filters.map((f) => f.id);
  const q2 = M.treeBuyQuery(cls, real, { ilvlMin: it.itemLevel ?? 80, baseType: it.baseType, fractured: true });
  const ids2 = q2.query.stats[0].filters.map((f) => f.id);
  if (!ids.every((i) => i.startsWith("explicit."))) fail(`固定無しの条件が explicit. になっていません: ${ids.join(",")}`);
  else ok(`固定無し: ${ids.join(" + ")}`);
  // stat は作れない MOD の分だけ (狙う 5 個は入れない)
  if (ids.length !== real.flatMap((b) => b.filters).length || ids2.length !== ids.length) {
    fail(`stat が作れない MOD 以外まで入っています (固定無し ${ids.length} 本 / 固定済み ${ids2.length} 本)`);
  } else ok(`stat は作れない MOD の ${ids.length} 本だけ (固定済みも固定無しも同じ)`);
  // 他は規定通り
  const tf = plain.query.filters.type_filters.filters;
  if (plain.query.filters.misc_filters.filters.corrupted?.option !== "false") fail("コラプト無しが入っていません");
  else if (tf.ilvl?.min !== (it.itemLevel ?? 80)) fail(`ilvl が ${tf.ilvl?.min}`);
  else if (plain.query.type?.option !== it.baseType) fail(`ベースが ${plain.query.type?.option}`);
  else if (plain.query.status.option !== "securable") fail("status が securable ではありません");
  else if (plain.query.filters.misc_filters.filters.fractured_item?.option !== "false") fail("固定無しの検索に「フラクチャー: いいえ」が入っていません");
  else ok(`他は規定通り (ベース ${it.baseType} / ilvl ${tf.ilvl.min} 以上 / ${tf.rarity.option} / コラプト無し / フラクチャー無し / securable)`);
}

console.log(failed === 0 ? "\n通りました" : `\n${failed} 件 NG`);
process.exit(failed === 0 ? 0 : 1);
