/**
 * _daily-recount-frac.mjs — D-03f の数え直し (確定フラクチャーの費用 = フラクチャーまで全部 ×3、日の門なし)。デイリー部長 27、11-15。
 *
 * 何をするか: 11-12 からの (b) の提出ごとに、同じ木を回して「前の手 ×2」の足し分 (1 個あたり) を出し、
 *   新しい費用 = 提出の費用 + 足し分 (0.1 神に丸め) にする。完成率・順位 (place) は書かない。
 *   書く所: daily_tries.cost、締めた日は daily_results.cost (同じ人・同じ日)。
 *   足し分 = 足し分の合計 ÷ 回し直しで完成した人数。回し直しで完成 0 の木は 足し分の合計 ÷ (100 × 提出の完成率) で近似し、表に「近似」と書く。
 *
 * 使い方 (repo の根で。束ねは repo の今の src。新旧どちらの数えの版で回しても足し分は同じ = 前の手はフラクチャーより前の費用):
 *   node scripts/_daily-recount-frac.mjs                 … 読むだけ (既定)。前後の表を出して progress/daily-lead27-recount-dry.md に書く
 *   EXILEDESK_RECOUNT_APPLY=1 node scripts/_daily-recount-frac.mjs --apply --before=2026-11-16T15:00   (新しい版を出した時刻 JST。それより後の提出は触らない)
 *                                                          … 書く。オーナーの「出して」と印の後、新しい数えの版を出すのと同じ時だけ
 * 守り (--apply): ① 15:30〜16:30 JST は書かない (締めと重なる) ② 前に書いた印 (docs/org/daily/notes/recount-frac-*.json の applied) があれば書かない
 *   (2 回当てると足し分が 2 回乗る) ③ 回せない木が 1 本でもあれば書かない ④ 1 文ごとに「今の費用が読んだ時と同じ」を条件に入れる
 *   ⑤ 書く前の行を控え (docs/org/daily/notes/recount-frac-<時刻>.json) に残す。書きは 1 つの束 (途中で落ちれば全部戻る)
 * 戻し方: 控えの before の cost を同じ形の UPDATE で入れ直す (手で)
 */
import { pathToFileURL, fileURLToPath } from "node:url";
import { appendFileSync, writeFileSync, readdirSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..").replace(/\\/g, "/");
const LOG = `${ROOT}/progress/daily-lead27-run.log`;
const NOTES = `${ROOT}/docs/org/daily/notes`;
const FROM = "2026-11-12"; // (b) だけの最初の日 (D-03 の FOUR_ONLY_FROM)
const APPLY = process.argv.includes("--apply");
const JST = 9 * 3600e3;
const jstNow = () => new Date(Date.now() + JST);
const log = (s) => appendFileSync(LOG, `${jstNow().toISOString().slice(11, 16)} recount-frac: ${s}\n`);

if (APPLY) {
  if (process.env.EXILEDESK_RECOUNT_APPLY !== "1") { console.log("止めた: --apply には EXILEDESK_RECOUNT_APPLY=1 が要る"); process.exit(1); }
  const hm = jstNow().toISOString().slice(11, 16);
  if (hm >= "15:30" && hm < "16:30") { console.log(`止めた: ① ${hm} は締めの前後 (15:30〜16:30) なので書かない`); process.exit(1); }
  mkdirSync(NOTES, { recursive: true });
  for (const f of readdirSync(NOTES).filter((f) => /^recount-frac-.*\.json$/.test(f))) {
    if (JSON.parse(readFileSync(`${NOTES}/${f}`, "utf8")).applied) { console.log(`止めた: ② もう書いた印がある (${f})。2 回は当てない`); process.exit(1); }
  }
}

globalThis.location ??= { hostname: "", href: "", search: "", hash: "", pathname: "/" };
globalThis.history ??= { state: null, replaceState() {}, pushState() {}, back() {} };
const { remoteD1 } = await import(pathToFileURL(`${ROOT}/scripts/_d1-shim.mjs`).href);
const { bundleEntry } = await import(pathToFileURL(`${ROOT}/scripts/_bundle-ts.mjs`).href);
const M = await bundleEntry(`${ROOT}/scripts/_daily-recount-frac-entry.ts`);
const data = M.loadPatchSync();
const db = remoteD1();
log(`始め (${APPLY ? "書く" : "読むだけ"})`);

const topics = (await db.prepare("SELECT id, day, base, ilvl, aims, seed, prices, type_snap FROM daily_topics WHERE day >= ? ORDER BY day").bind(FROM).all()).results;
// ⑥ 新しい数えの版を出した時刻より後の提出は、もう新しい数えで数えてあるので触らない (--apply には --before=YYYY-MM-DDTHH:MM (JST) が要る)
const beforeArg = process.argv.find((a) => a.startsWith("--before="))?.slice(9);
const BEFORE = beforeArg ? Date.parse(`${beforeArg}:00+09:00`) : Date.now();
if (APPLY && (!beforeArg || !Number.isFinite(BEFORE))) { console.log("止めた: ⑥ --apply には --before=<新しい版を出した時刻 JST> が要る"); process.exit(1); }
const tries = (await db.prepare("SELECT t.topic_id, t.nick_id, n.name, t.cost, t.rate, t.recipe FROM daily_tries t JOIN daily_nicks n ON n.id = t.nick_id WHERE substr(t.topic_id, 2) >= ? AND t.recipe IS NOT NULL AND t.cost IS NOT NULL AND t.submitted_at < ? ORDER BY t.topic_id, t.submitted_at").bind(FROM, BEFORE).all()).results;
const results = (await db.prepare("SELECT day, nick_id, cost, place FROM daily_results WHERE day >= ?").bind(FROM).all()).results;
log(`読んだ: お題 ${topics.length}・提出 ${tries.length}・日の結果 ${results.length}`);

const byDay = new Map(topics.map((t) => [t.day, t]));
const rows = [];
for (const t of tries) {
  const day = t.topic_id.slice(1), tp = byDay.get(day);
  const topic = { base: tp.base, ilvl: tp.ilvl, aims: JSON.parse(tp.aims), seed: tp.seed, perBox: M.perBoxOn(day), day, quality: M.qualityOfSnap(tp.type_snap) };
  const price = M.topicPrice(data, { base: tp.base, ilvl: tp.ilvl, prices: tp.prices });
  let r;
  try { r = price ? M.fracAdd(data, topic, t.recipe, price) : { why: "相場の写しが無い" }; } catch (e) { r = { why: `落ちた ${String(e).slice(0, 120)}` }; }
  let per = null, approx = false;
  if (!r.why) {
    if (!r.add) per = 0;
    else if (r.finished > 0) per = r.add / r.finished;
    else if (t.rate > 0) { per = r.add / (M.RUN_N * (t.rate / 100)); approx = true; }
  }
  const res = results.find((x) => x.day === day && x.nick_id === t.nick_id);
  const neu = per == null ? null : Math.round((t.cost + per) * 10) / 10;
  rows.push({ day, topicId: t.topic_id, nickId: t.nick_id, name: t.name, rate: t.rate, before: t.cost, after: neu, approx, why: r.why ?? (per == null ? "足し分が出せない" : null), from: r.from, jump: r.jump, resCost: res?.cost ?? null, place: res?.place ?? null });
  log(`${day} ${t.name} ${r.why ?? `${t.cost} → ${neu}${approx ? " (近似)" : ""}`}`);
}

// 表 (順位は提出の数・新しい数の両方でスコア順 = 費用 ÷ 完成率、同じなら並べは変えない目安)
const score = (c, r) => (r > 0 ? Math.round((c * 1000) / r) / 10 : Infinity);
const lines = [`# D-03f の数え直し (${APPLY ? "書いた" : "読むだけ"}、${jstNow().toISOString().slice(0, 16).replace("T", " ")} JST)`, ""];
for (const day of [...new Set(rows.map((r) => r.day))]) {
  const rs = rows.filter((r) => r.day === day);
  const ok = (f) => rs.filter((r) => r.rate >= 1 && f(r) != null).sort((a, b) => score(f(a), a.rate) - score(f(b), b.rate));
  const pa = new Map(ok((r) => r.before).map((r, i) => [r.name, i + 1])), pb = new Map(ok((r) => r.after ?? r.before).map((r, i) => [r.name, i + 1]));
  const flip = rs.some((r) => pa.get(r.name) !== pb.get(r.name));
  lines.push(`## ${day}${flip ? " ← 順位が入れ替わる" : ""}`, "| 名前 | 完成率 | 前 | 後 | 順位 前→後 | 日の結果 | 訳 |", "|---|---|---|---|---|---|---|");
  for (const r of rs) lines.push(`| ${r.name} | ${r.rate}% | ${r.before} | ${r.after ?? "—"}${r.approx ? " (近似)" : ""} | ${pa.get(r.name) ?? "—"} → ${pb.get(r.name) ?? "—"} | ${r.place ? `${r.place} 位 ${r.resCost}` : "まだ締めていない"} | ${r.why ?? ""} |`);
  lines.push("");
}
const bad = rows.filter((r) => r.why);
lines.push(bad.length ? `回せない木: ${bad.map((r) => `${r.day} ${r.name} (${r.why})`).join("、")}` : "回せない木: なし");
writeFileSync(`${ROOT}/progress/daily-lead27-recount-${APPLY ? "apply" : "dry"}.md`, lines.join("\n"));
console.log(lines.join("\n"));

if (!APPLY) { log("読むだけで済み"); process.exit(0); }
if (bad.length) { log("止めた: ③ 回せない木がある"); console.log("止めた: ③ 回せない木がある。書いていない"); process.exit(1); }

const change = rows.filter((r) => r.after != null && r.after !== r.before);
const stamp = jstNow().toISOString().slice(0, 19).replace(/[-:T]/g, "");
const backup = `${NOTES}/recount-frac-${stamp}.json`;
writeFileSync(backup, JSON.stringify({ applied: false, rows: change }, null, 1));
const stmts = [];
for (const r of change) {
  stmts.push(db.prepare("UPDATE daily_tries SET cost = ? WHERE topic_id = ? AND nick_id = ? AND cost = ?").bind(r.after, r.topicId, r.nickId, r.before));
  if (r.resCost != null) stmts.push(db.prepare("UPDATE daily_results SET cost = ? WHERE day = ? AND nick_id = ? AND cost = ?").bind(r.after, r.day, r.nickId, r.resCost));
}
await db.batch(stmts);
writeFileSync(backup, JSON.stringify({ applied: true, at: stamp, rows: change }, null, 1));
log(`書いた: 提出 ${change.length} 行 (控え ${backup})`);
console.log(`書いた: ${change.length} 行。控え ${backup}`);
