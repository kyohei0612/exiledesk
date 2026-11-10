#!/usr/bin/env node
/**
 * daily-reset-one.mjs — 本番のデイリーで、名前 1 つの「今日の挑戦」だけを消す (設計図 D-37h4、11-10)。
 *   pnpm daily:reset-one <名前 | id> [--day YYYY-MM-DD] [--yes] [--dry]
 *     <名前>  = 一覧・順位に出る名前 (大文字小文字・全角半角は本番の名前の照らしと同じく見ない)
 *     <id>    = 名前の id (n + 16 字、daily_nicks.id)。要望の添付の daily.nickId をそのまま渡す (11-10 オーナー「IDで追跡でいいんじゃね」)
 *     --day   = 消すお題の日 (16:00 に始まる日)。省くと今のお題の日
 *     --yes   = 提出済みの挑戦も消す (無いと消す前に止まる)
 *     --dry   = 見るだけで消さない
 * 消すのは daily_tries のその 1 行だけ (名前・称号・ほかの日・投稿は触らない)。その人は一覧を開き直すと「1 時間の挑戦を始める」に戻る
 * (端末の控えはサーバーに聞き直して捨てる = POST /daily/mine、v0.1.703 から)。
 * 本番の D1 にはオーナーの wrangler のログインで書く (_d1-shim.mjs、Y-90)。鍵・合言葉は扱わない。
 * 手元の置き場で試す時は EXILEDESK_D1_LOCAL=<置き場> (dev-daily-api.mjs の PERSIST) を付ける。
 */
import { remoteD1, target } from "./_d1-shim.mjs";

const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const dayAt = args.indexOf("--day");
const name = args.find((a, i) => !a.startsWith("--") && !(dayAt >= 0 && i === dayAt + 1));
if (!name) {
  console.error("名前か id が要る: pnpm daily:reset-one <名前 | id> [--day YYYY-MM-DD] [--yes] [--dry]");
  process.exit(1);
}
const JST = 9 * 3600e3, H16 = 16 * 3600e3, DAY = 86400e3;
const dayArg = dayAt >= 0 ? args[dayAt + 1] : null;
if (dayArg && !/^\d{4}-\d{2}-\d{2}$/.test(dayArg)) { console.error("--day は YYYY-MM-DD"); process.exit(1); }
const day = dayArg ?? new Date(Math.floor((Date.now() + JST - H16) / DAY) * DAY).toISOString().slice(0, 10);
const topicId = `d${day}`;
// 本番の名前の照らし (server/live/src/daily/nick.ts の nameKey) と同じ
const nameKey = (s) => s.normalize("NFKC").trim().toLowerCase();
const jst = (ms) => (ms == null ? "-" : new Date(ms + JST).toISOString().slice(5, 16).replace("T", " "));

const db = remoteD1();
// まず名前の id (daily_nicks.id、要望の添付の daily.nickId) で引き、無ければ名前で引く (id の形は決め打ちしない)
console.log(`[daily:reset-one] ${target()} / お題 ${topicId} / 「${name}」`);
let nick = await db.prepare("SELECT id, name FROM daily_nicks WHERE id = ?").bind(name).first();
const byId = !!nick;
if (!nick) nick = await db.prepare("SELECT id, name FROM daily_nicks WHERE name_key = ?").bind(nameKey(name)).first();
if (!nick) { console.log("その id も名前も無い。要望の添付の daily.nickId か、一覧・順位の名前をそのまま渡す"); process.exit(1); }
console.log(byId ? `id で見つけた = 名前「${nick.name}」` : `名前で見つけた (id ${nick.id})`);
const t = await db.prepare("SELECT started_at, submitted_at, cost, rate, gave_up_at FROM daily_tries WHERE topic_id = ? AND nick_id = ?").bind(topicId, nick.id).first();
if (!t) { console.log(`「${nick.name}」の ${topicId} の挑戦は無い (もう始め直せる)`); process.exit(0); }
const state = t.submitted_at != null ? `提出済み (${jst(t.submitted_at)}、完成 1 個あたり ${t.cost} 神・完成率 ${t.rate}%)` : t.gave_up_at != null ? `諦めた (${jst(t.gave_up_at)})` : "途中 / 時間切れ";
console.log(`「${nick.name}」: 始めた ${jst(t.started_at)} JST・${state}`);
if (t.submitted_at != null && !flag("--yes")) {
  console.log("提出済みの挑戦を消すと、その記録は今日の順位からも消える。消すなら --yes を付けてもう一度");
  process.exit(2);
}
if (flag("--dry")) { console.log("--dry: 消していない"); process.exit(0); }
await db.prepare("DELETE FROM daily_tries WHERE topic_id = ? AND nick_id = ?").bind(topicId, nick.id).run();
const left = await db.prepare("SELECT 1 AS x FROM daily_tries WHERE topic_id = ? AND nick_id = ?").bind(topicId, nick.id).first();
if (left) { console.log("消えていない (書き込みが通らなかった)"); process.exit(1); }
console.log(`消した。「${nick.name}」は一覧を開き直すと始め直せる (前の版の画面は https://exiledesk.com/?page=daily-start&q=${topicId} を開く)`);
