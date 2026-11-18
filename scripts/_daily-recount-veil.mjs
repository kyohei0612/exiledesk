/**
 * _daily-recount-veil.mjs — 冒涜・発現の直し (S-35 ad7e0de00 = 発現は候補 3 つ (反響なら 6 つ) から ☑ を選ぶ、S-33h 18204f43e = 置き石) が入った版 (0.1.757) で、
 *   その日のお題の提出を数え直す (デイリー部長、11-18。オーナー「バージョン変わったら今日のお題のデイリーもっかい回してあげて可哀そうだから冒涜周り」)。
 *
 * 何をするか: 締める前のお題の提出ごとに、16:00 の検算と同じ runCost (打ち方から組み直して 100 人、同じ種・同じ相場の写し) を
 *   ① 0.1.756 の src (git archive の写し = 提出した時の本番の作り) ② 今の src の 2 回で回す。
 *   本番の提出には木の写し (D-50h builtZ) が無い (DAILY_BUILT は開発版だけ) ので打ち方から組み直す。組み直しは提出の数と合わない事がある (D-50h) ので、
 *   直しの分 = ② − ① と見て、新しい数 = 提出の数 + (② − ①) にする (費用・完成率それぞれ。完成率は 0〜100 に収める、費用は 0.1 神に丸め)。
 *   ① = ② の木 (冒涜・発現の手を含まない木) は書かない。① か ② が回せない木は「回せない木」に出す。
 *   書く所: daily_tries の cost・rate だけ (締める前なので daily_results はまだ無い。あれば止める)。順位は提出の数から画面が出すので書かない。
 *
 * 使い方 (repo の根で):
 *   node scripts/_daily-recount-veil.mjs --day=2026-11-18            … 読むだけ (既定)。前後の表を progress/daily-recount-veil-dry.md に書く
 *   EXILEDESK_RECOUNT_APPLY=1 node scripts/_daily-recount-veil.mjs --day=2026-11-18 --apply --before=2026-11-18T23:30
 *                                                                    … 書く。新しい版 (0.1.757) を出した後、ブラックの「当てて」の後だけ。--before = 出した時刻 JST (それより後の提出は新しい作りで数えてあるので触らない)
 * 守り (--apply): ① 15:30〜16:30 JST は書かない (締めと重なる) ② 前に書いた印 (docs/org/daily/notes/recount-veil-*.json の applied) があれば書かない
 *   ③ 回せない木が 1 本でもあれば書かない ④ 1 文ごとに「今の費用・完成率が読んだ時と同じ」を条件に入れる ⑤ 書く前の行を控え (docs/org/daily/notes/recount-veil-<時刻>.json) に残す。書きは 1 つの束
 *   ⑥ その日の daily_results が 1 行でもあれば書かない (締めた後は別の直しになる)
 * 戻し方: 控えの before の cost・rate を同じ形の UPDATE で入れ直す (手で)
 */
import { pathToFileURL, fileURLToPath } from "node:url";
import { appendFileSync, writeFileSync, readdirSync, readFileSync, mkdirSync, existsSync, copyFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..").replace(/\\/g, "/");
const LOG = `${ROOT}/progress/daily-recount-veil-run.log`;
const NOTES = `${ROOT}/docs/org/daily/notes`;
const OLD_REV = "9635ed85b"; // release: 0.1.756 (提出した時の本番の作り)
const OLD = `${ROOT}/progress/.veil-old`;
const APPLY = process.argv.includes("--apply");
const DAY = process.argv.find((a) => a.startsWith("--day="))?.slice(6);
const JST = 9 * 3600e3;
const jstNow = () => new Date(Date.now() + JST);
const log = (s) => appendFileSync(LOG, `${jstNow().toISOString().slice(11, 16)} recount-veil: ${s}\n`);
const stop = (s) => { log(`中止: ${s}`); console.log(`止めた: ${s}`); process.exit(1); };
process.on("uncaughtException", (e) => { log(`中止: エラー ${String(e?.stack ?? e).slice(0, 200).replace(/\n/g, " ")}`); process.exit(1); });
process.on("unhandledRejection", (e) => { log(`中止: エラー ${String(e?.stack ?? e).slice(0, 200).replace(/\n/g, " ")}`); process.exit(1); });

if (!DAY || !/^\d{4}-\d{2}-\d{2}$/.test(DAY)) { console.log("止めた: --day=YYYY-MM-DD が要る"); process.exit(1); }
if (APPLY) {
  if (process.env.EXILEDESK_RECOUNT_APPLY !== "1") stop("--apply には EXILEDESK_RECOUNT_APPLY=1 が要る");
  const hm = jstNow().toISOString().slice(11, 16);
  if (hm >= "15:30" && hm < "16:30") stop(`① ${hm} は締めの前後 (15:30〜16:30) なので書かない`);
  mkdirSync(NOTES, { recursive: true });
  for (const f of readdirSync(NOTES).filter((f) => /^recount-veil-.*\.json$/.test(f))) {
    if (JSON.parse(readFileSync(`${NOTES}/${f}`, "utf8")).applied) stop(`② もう書いた印がある (${f})。2 回は当てない`);
  }
}
const beforeArg = process.argv.find((a) => a.startsWith("--before="))?.slice(9);
const BEFORE = beforeArg ? Date.parse(`${beforeArg}:00+09:00`) : Date.now();
if (APPLY && (!beforeArg || !Number.isFinite(BEFORE))) stop("--apply には --before=<新しい版を出した時刻 JST> が要る");

log(`始め (${APPLY ? "書く" : "読むだけ"}、${DAY})`);
// 0.1.756 の src の写し (repo の中に置くのは node_modules を上の階から引くため。progress/ は commit しない)
if (!existsSync(`${OLD}/src`)) {
  mkdirSync(OLD, { recursive: true });
  const tar = `${OLD}/old.tar`;
  const a = spawnSync("git", ["-C", ROOT, "archive", "--format=tar", "-o", tar, OLD_REV, "src", "scripts/_htc-bridge-entry.ts", "package.json"], { encoding: "utf8" });
  if (a.status !== 0) stop(`git archive が落ちた ${a.stderr}`);
  const x = spawnSync("tar", ["-xf", "old.tar"], { cwd: OLD, encoding: "utf8" }); // Git Bash の tar は C: を遠くの機械と読むので相対の名で
  if (x.status !== 0) stop(`tar が落ちた ${x.stderr}`);
  rmSync(tar, { force: true });
}
copyFileSync(`${ROOT}/scripts/_daily-recount-veil-entry.ts`, `${OLD}/scripts/_daily-recount-veil-entry.ts`);

globalThis.location ??= { hostname: "", href: "", search: "", hash: "", pathname: "/" };
globalThis.history ??= { state: null, replaceState() {}, pushState() {}, back() {} };
const { remoteD1 } = await import(pathToFileURL(`${ROOT}/scripts/_d1-shim.mjs`).href);
const { bundleEntry } = await import(pathToFileURL(`${ROOT}/scripts/_bundle-ts.mjs`).href);
const MO = await bundleEntry(`${OLD}/scripts/_daily-recount-veil-entry.ts`);
const MN = await bundleEntry(`${ROOT}/scripts/_daily-recount-veil-entry.ts`);
const dataO = MO.loadPatchSync(), dataN = MN.loadPatchSync();
log("束ねた (0.1.756 と今)");
const db = remoteD1();

const tp = (await db.prepare("SELECT id, day, base, ilvl, aims, seed, prices, type_snap FROM daily_topics WHERE day = ?").bind(DAY).all()).results[0];
if (!tp) stop(`${DAY} のお題が無い`);
const closed = (await db.prepare("SELECT count(*) AS n FROM daily_results WHERE day = ?").bind(DAY).first())?.n ?? 0;
if (APPLY && closed > 0) stop(`⑥ ${DAY} はもう締めてある (結果の行 ${closed})`);
const tries = (await db.prepare("SELECT t.topic_id, t.nick_id, n.name, t.cost, t.rate, t.recipe, t.submitted_at, t.started_at FROM daily_tries t JOIN daily_nicks n ON n.id = t.nick_id WHERE t.topic_id = ? AND t.recipe IS NOT NULL AND t.cost IS NOT NULL AND t.submitted_at < ? ORDER BY t.submitted_at").bind(tp.id, BEFORE).all()).results;
log(`読んだ: 提出 ${tries.length} (締め ${closed ? "済み" : "まだ"})`);

const topic = { base: tp.base, ilvl: tp.ilvl, aims: JSON.parse(tp.aims), seed: tp.seed, day: DAY };
const run = (M, data) => (recipe) => {
  const price = M.topicPrice(data, { base: tp.base, ilvl: tp.ilvl, prices: tp.prices });
  if (!price) return { why: "相場の写しが無い" };
  try {
    const r = M.runCost(data, { ...topic, perBox: M.perBoxOn(DAY), quality: M.qualityOfSnap(tp.type_snap) }, recipe, price);
    return r ?? { why: "組み直せない (ベース・✦・完成の箱がお題と違う)" };
  } catch (e) { return { why: `落ちた ${String(e).slice(0, 120)}` }; }
};
const runO = run(MO, dataO), runN = run(MN, dataN);
const r1 = (x) => Math.round(x * 10) / 10;
const rows = [];
for (const t of tries) {
  const o = runO(t.recipe), n = runN(t.recipe);
  const why = o.why ?? n.why ?? null;
  let after = null;
  if (!why) {
    const same = o.cost === n.cost && o.rate === n.rate;
    after = same ? { cost: t.cost, rate: t.rate } : { cost: Math.max(0, r1(t.cost + (n.cost - o.cost))), rate: Math.min(100, Math.max(0, t.rate + (n.rate - o.rate))) };
  }
  rows.push({ topicId: t.topic_id, nickId: t.nick_id, name: t.name, before: { cost: t.cost, rate: t.rate }, old: o.why ? null : o, neu: n.why ? null : n, after, why, usedMs: t.submitted_at - t.started_at, matchOld: !o.why && o.cost === t.cost && o.rate === t.rate });
  log(`${rows.length}/${tries.length} ${t.name} ${why ? `エラー ${why}` : ""}${why ? "" :`提出 ${t.cost}/${t.rate}% 旧 ${o.cost}/${o.rate}% 新 ${n.cost}/${n.rate}% → ${after.cost}/${after.rate}%`}`);
}

// 表 (スコア = 費用 ÷ 完成率 D-02b、同じなら使った時間の短い人)
const score = (x) => (x && x.rate > 0 ? Math.round((x.cost * 1000) / x.rate) / 10 : Infinity);
const order = (f) => new Map(rows.filter((r) => f(r) && f(r).rate > 0).sort((a, b) => score(f(a)) - score(f(b)) || a.usedMs - b.usedMs).map((r, i) => [r.nickId, i + 1]));
const pa = order((r) => r.before), pb = order((r) => r.after ?? r.before);
const fmt = (x) => (x ? `${x.cost} / ${x.rate}%` : "—");
const diff = rows.filter((r) => r.after && (r.after.cost !== r.before.cost || r.after.rate !== r.before.rate));
const lines = [`# 冒涜・発現の直しの数え直し ${DAY} (${APPLY ? "書いた" : "読むだけ"}、${jstNow().toISOString().slice(0, 16).replace("T", " ")} JST)`, "",
  `提出 ${rows.length}・差のある提出 ${diff.length}・組み直しが提出の数と合う (0.1.756) ${rows.filter((r) => r.matchOld).length}`, "",
  "| 名前 | 提出 (費用 / 完成率) | 0.1.756 で回し直し | 今の作りで回し直し | 新しい数 | スコア 前→後 | 順位 前→後 | 訳 |", "|---|---|---|---|---|---|---|---|"];
for (const r of rows) lines.push(`| ${r.name} | ${fmt(r.before)} | ${fmt(r.old)}${r.matchOld ? " (提出と同じ)" : ""} | ${fmt(r.neu)} | ${fmt(r.after)} | ${score(r.before)} → ${r.after ? score(r.after) : "—"} | ${pa.get(r.nickId) ?? "—"} → ${pb.get(r.nickId) ?? "—"} | ${r.why ?? ""} |`);
const bad = rows.filter((r) => r.why);
lines.push("", bad.length ? `回せない木: ${bad.map((r) => `${r.name} (${r.why})`).join("、")}` : "回せない木: なし");
writeFileSync(`${ROOT}/progress/daily-recount-veil-${APPLY ? "apply" : "dry"}.md`, lines.join("\n"));
console.log(`表: progress/daily-recount-veil-${APPLY ? "apply" : "dry"}.md (提出 ${rows.length}・差 ${diff.length}・回せない ${bad.length})`);

if (!APPLY) { log(`読むだけで済み (提出 ${rows.length}・差 ${diff.length}・回せない ${bad.length})`); process.exit(0); }
if (bad.length) stop("③ 回せない木がある。書いていない");

const stamp = jstNow().toISOString().slice(0, 19).replace(/[-:T]/g, "");
const backup = `${NOTES}/recount-veil-${stamp}.json`;
writeFileSync(backup, JSON.stringify({ applied: false, day: DAY, rows: diff }, null, 1));
const stmts = diff.map((r) => db.prepare("UPDATE daily_tries SET cost = ?, rate = ? WHERE topic_id = ? AND nick_id = ? AND cost = ? AND rate = ?").bind(r.after.cost, r.after.rate, r.topicId, r.nickId, r.before.cost, r.before.rate));
if (stmts.length) await db.batch(stmts);
writeFileSync(backup, JSON.stringify({ applied: true, at: stamp, day: DAY, rows: diff }, null, 1));
log(`済み: 書いた 提出 ${diff.length} 行 (控え ${backup})`);
console.log(`書いた: ${diff.length} 行。控え ${backup}`);
