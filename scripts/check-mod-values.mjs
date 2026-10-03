#!/usr/bin/env node
/**
 * check-mod-values.mjs — MOD の数値の全数点検 (2026-10-03、オーナー「MOD をフルチェックしてくれ」)
 *
 * **取引所も相場も叩かない**。リポジトリの中のデータだけを突き合わせる。中身は src/services/mods/mod-values-check.ts。
 *   (a) 原本 (mods-bundle.json): stats の min/max を単位の決まり (stat-scale.ts) で画面の値にすると text_en の数字になるか
 *   (b) 計算機のエンジン (poe2htc mods.json + extra-bases.json の mods) の段の ranges が、画面の値にして原本と一致するか
 *   (c) 派生データ: 創生の樹の MOD の段 (extra-bases.json の dropOnly)、上位プレイヤーの MOD のティア表 (tiers.ts) の値
 *
 *   node scripts/check-mod-values.mjs            # 不一致を一覧 (MOD id / 文 / 期待 / 実際 / どのデータ)。0 件なら exit 0
 *   node scripts/check-mod-values.mjs --all      # 原本に対応が見つからず照合できなかった段も全部出す
 */
import { bundleEntry } from "./_bundle-ts.mjs";

const M = await bundleEntry("scripts/_mod-values-entry.ts");
const all = process.argv.includes("--all");
const keyOf = (t) => M.normalizeModTemplate(M.stripRichTextMarkers(t)).toLowerCase().replace(/\s+/g, " ");

const r = M.checkModValues({
  bundle: M.bundle,
  hidden: { hidden: new Set(M.hidden.hidden), partly: M.hidden.partly },
  htcMods: Object.values(M.htc.mods),
  extraMods: M.extra.mods ?? [],
  dropOnly: M.extra.dropOnly ?? {},
  sourceRanges: M.sourceRanges,
}, keyOf);

const c = r.counts;
console.log(`原本 ${c.bundleChecked} 件 / エンジンの段 ${c.htcTiers} (一致 ${c.htcMatched}、原本に対応無し ${c.htcNoReference}) / 樹の MOD の段 ${c.dropOnlyTiers} / ティア表 ${c.tiersChecked} 件`);
console.log(`単位の決まり: 換算する stat ${Object.keys(M.scaleTable.stats).length} 件 (stat-scale.json、元は csd の token)`);

if (r.issues.length) {
  const byWhere = {};
  for (const i of r.issues) (byWhere[i.where] ??= []).push(i);
  for (const [where, list] of Object.entries(byWhere)) {
    console.log(`\n[${where}] ${list.length} 件`);
    for (const i of list) console.log(`   NG ${i.id} | ${i.text.replace(/\r?\n/g, " / ")} | 期待 ${i.expected} | 実際 ${i.actual} | ${i.why}`);
  }
}
if (all && r.noReference.length) {
  console.log(`\n原本に対応が見つからなかった段 (照合できない。不一致ではない) ${r.noReference.length} 件`);
  for (const l of r.noReference) console.log(`   -- ${l}`);
}
if (all && r.notShown.length) {
  console.log(`\n原本で stat の値が文に出ない物 (画面に入れる数字が無い。不一致ではない) ${r.notShown.length} 件`);
  for (const l of r.notShown) console.log(`   -- ${l}`);
}
console.log(r.issues.length === 0 ? "\n通りました (不一致 0)" : `\n${r.issues.length} 件 NG`);
process.exit(r.issues.length === 0 ? 0 : 1);
