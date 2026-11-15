#!/usr/bin/env node
/**
 * _daily-quality-verify.mjs — 品質のお題 (D-03d) のセルフチェック ④ (デイリー部長 25、11-15)。読むだけ。
 * 手元の D1 (EXILEDESK_D1_LOCAL=<置き場> を付けて呼ぶ。付けないと止める) のお題と提出を、16:00 の検算 (makeVerify) と同じ runCost・同じ比べ方で回し直し、
 * 1 = 合う / -1 = 外れ を出す。束は 1 つだけ読む (2 つ読むと値段の引きが読み込んでいない方を見て NaN になる)
 *   EXILEDESK_D1_LOCAL=<置き場> node scripts/_daily-quality-verify.mjs [--day 2026-11-15]
 */
import { bundleEntry } from "./_bundle-ts.mjs";
import { remoteD1, target } from "./_d1-shim.mjs";

if (!process.env.EXILEDESK_D1_LOCAL) { console.log("手元の置き場 (EXILEDESK_D1_LOCAL) が無い。本番は読まない形にしてあるので止める"); process.exit(1); }
globalThis.location ??= { hostname: "", href: "", search: "", hash: "", pathname: "/" };
globalThis.history ??= { state: null, replaceState() {}, pushState() {}, back() {} };
const args = process.argv.slice(2);
const day = args.includes("--day") ? args[args.indexOf("--day") + 1] : "2026-11-15";
const B = await bundleEntry("scripts/_daily-quality-check-entry.ts");
const data = B.loadPatchSync();
const db = remoteD1();
const t = await db.prepare("SELECT base, ilvl, aims, seed, prices, type_snap FROM daily_topics WHERE day = ?").bind(day).first();
const { results: tries } = await db.prepare("SELECT n.name, t.cost, t.rate, t.recipe FROM daily_tries t JOIN daily_nicks n ON n.id = t.nick_id WHERE t.topic_id = ? AND t.submitted_at IS NOT NULL").bind(`d${day}`).all();
console.log(`${target()}・お題 ${day} ${t.base}・品質 ${t.type_snap ?? "なし"}・提出 ${tries.length} 件`);
const topic = { base: t.base, ilvl: Number(t.ilvl), aims: JSON.parse(t.aims), seed: Number(t.seed), perBox: true, day };
const q = (() => { try { return JSON.parse(t.type_snap ?? "null")?.quality ?? null; } catch { return null; } })();
const price = B.topicPrice(data, { ...topic, prices: t.prices });
if (!price) { console.log("相場の写しが無い"); process.exit(1); }
for (const x of tries) {
  let r = null;
  try { r = B.runCost(data, { ...topic, quality: q }, x.recipe, price); } catch { r = null; }
  // makeVerify と同じ比べ方: 費用 (0.1 神) と完成率が提出と同じなら 1
  const ok = r && Math.abs(r.cost - x.cost) < 0.05 && r.rate === Math.round(x.rate ?? -1) ? 1 : -1;
  console.log(`- ${x.name}: 提出 ${x.cost} 神 / ${x.rate}% → 検算で回すと ${r ? `${r.cost} 神 / ${r.rate}%` : "外れ (完成の箱が完成形を満たさない)"} → 判定 ${ok}`);
}
console.log("済み");
