#!/usr/bin/env node
/**
 * daily-views.mjs — デイリーの順位のレシピを誰が開いたかを読む (設計図 D-50e)。読むだけ。読む口はサーバーに無く、D1 を直に読む (オーナーの wrangler のログイン)。
 *
 *   node scripts/daily-views.mjs [--day YYYY-MM-DD] [--name 見られた人]
 *     --day  = お題の日 (16:00 に始まる日)。省くと今の日
 *     --name = その人のレシピを開いた記録だけ
 *   手元の置き場を読む時は EXILEDESK_D1_LOCAL=<wrangler の --persist-to の場所> (_d1-shim.mjs、確かめ用)
 *
 * 出す物: 見られた人ごとに、開いた人の数 (名前あり・名前なし) と、開いた人・最初と最後の時刻・回数。
 * 名前なし = 名前を決めていない人 (IP の印ごとに 1 行、元の IP は残っていない)
 */
import { remoteD1, target } from "./_d1-shim.mjs";

const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const JST = 9 * 3600e3, H16 = 16 * 3600e3, DAY = 86400e3;
const day = arg("--day") ?? new Date(Math.floor((Date.now() + JST - H16) / DAY) * DAY).toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) { console.error("--day YYYY-MM-DD"); process.exit(1); }
const only = arg("--name");
const db = remoteD1();
const hm = (ms) => new Date(ms + JST).toISOString().slice(5, 16).replace("T", " ");

const rows = (await db
  .prepare("SELECT o.name AS owner, v.viewer, w.name AS who, v.first_at, v.at, v.n FROM daily_views v JOIN daily_nicks o ON o.id = v.owner_nick_id LEFT JOIN daily_nicks w ON w.id = v.viewer WHERE v.topic_id = ? ORDER BY o.name, v.first_at")
  .bind(`d${day}`)
  .all()).results.filter((r) => !only || r.owner === only);

console.log(`お題 d${day} (${target()}): 開いた記録 ${rows.length} 行`);
const by = new Map();
for (const r of rows) by.set(r.owner, [...(by.get(r.owner) ?? []), r]);
for (const [owner, list] of by) {
  const named = list.filter((r) => r.who).length;
  console.log(`\n${owner} のレシピ — 開いた人 ${list.length} (名前あり ${named}・名前なし ${list.length - named})・延べ ${list.reduce((a, r) => a + r.n, 0)} 回`);
  for (const r of list) console.log(`  ${r.who ?? `名前なし (${String(r.viewer).slice(1, 7)})`}  最初 ${hm(r.first_at)}  最後 ${hm(r.at)}  ${r.n} 回`);
}
