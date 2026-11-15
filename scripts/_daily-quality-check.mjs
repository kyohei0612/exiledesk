#!/usr/bin/env node
/**
 * _daily-quality-check.mjs — 品質のお題 (D-03d) のセルフチェック (デイリー部長 25、11-15)。読むだけ・本番にも手元にも書かない。
 * 本番 D1 から 11-15 のお題 (不在のアミュレット) と提出のレシピ・相場の写しを読み、16:00 の検算と同じ runCost で
 *   ⑤ 品質なしのお題 = 提出の数と同じか / ①④ 品質 (キャスター 40%) つきで、カタリストを打っていない木は外れ (null) か / ②④ 打った木は通るか /
 *   ③ 通った木の費用にカタリストの分が入っているか (カタリストの値段を 0 にした時と比べる) を出す
 *   node scripts/_daily-quality-check.mjs [--tag caster] [--value 40]
 */
import { bundleEntry } from "./_bundle-ts.mjs";
import { remoteD1 } from "./_d1-shim.mjs";

globalThis.location ??= { hostname: "", href: "", search: "", hash: "", pathname: "/" };
globalThis.history ??= { state: null, replaceState() {}, pushState() {}, back() {} };
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const Q = { tag: opt("--tag", "caster"), value: Number(opt("--value", "40")) };
const DAY = "2026-11-15";
const M = await bundleEntry("scripts/_daily-quality-check-entry.ts");
const data = M.loadPatchSync();
const db = remoteD1();
const t = await db.prepare("SELECT base, ilvl, aims, seed, prices FROM daily_topics WHERE day = ?").bind(DAY).first();
const { results: tries } = await db.prepare("SELECT n.name, t.cost, t.rate, t.recipe FROM daily_tries t JOIN daily_nicks n ON n.id = t.nick_id WHERE t.topic_id = ? AND t.recipe IS NOT NULL").bind(`d${DAY}`).all();
const topic = { base: t.base, ilvl: t.ilvl, aims: JSON.parse(t.aims), seed: t.seed, perBox: true, day: DAY };
const price = M.topicPrice(data, { ...topic, prices: t.prices });
if (!price) { console.log("相場の写しが無い"); process.exit(1); }
const noCat = (k) => (/catalyst/i.test(k) ? 0 : price(k));
const show = (r) => (r ? `${r.cost} 神 / ${r.rate}%` : "外れ (完成の箱が完成形を満たさない)");
console.log(`お題 ${DAY} ${t.base}・品質 ${Q.tag} ${Q.value}% で見る・提出 ${tries.length} 件`);
for (const x of tries) {
  const plain = M.runCost(data, topic, x.recipe, price);
  const withQ = M.runCost(data, { ...topic, quality: Q }, x.recipe, price);
  const withQfree = withQ ? M.runCost(data, { ...topic, quality: Q }, x.recipe, noCat) : null;
  // 完成の箱の見本の品の品質 (何 % で着くか)
  const doc = M.rebuildTree(data, M.healRecipeV1({ ...JSON.parse(x.recipe), eleAny: 1 }));
  M.fillTopicDoc(doc, topic.aims, doc.memoAims?.find((a) => a.fractured)?.modId ?? "none", doc.start?.from === "four" ? "four" : "fractured", Q);
  const done = Object.values(doc.boxes).filter((b) => b.done === "main").map((b) => { try { const it = M.sampleOf(data, doc, b.id, 1).item; return `${b.id}=${it.qualityTag ?? "-"} ${it.catalystQuality ?? it.quality ?? 0}%`; } catch { return `${b.id}=?`; } });
  console.log(`- ${x.name}: 提出 ${x.cost} 神 / ${x.rate}%`);
  console.log(`    ⑤ 品質なし: ${show(plain)}${plain && Math.abs(plain.cost - x.cost) < 0.05 && plain.rate === Math.round(x.rate) ? " = 提出と同じ" : " ≠ 提出"}`);
  console.log(`    ①②④ 品質つき: ${show(withQ)}`);
  if (withQ) console.log(`    ③ カタリストを 0 神にすると: ${show(withQfree)} (差 ${withQfree ? Math.round((withQ.cost - withQfree.cost) * 10) / 10 : "?"} 神 = カタリストの分)`);
  console.log(`    完成の箱の見本の品質: ${done.join("・") || "完成の箱なし"}`);
}
console.log("済み");
