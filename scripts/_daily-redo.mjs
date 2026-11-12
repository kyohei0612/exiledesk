/**
 * _daily-redo.mjs — 置いた次の日のお題を、出る前 (16:00 より前) に消して組み直す口 (設計図 D-59 の「直す口」、2026-11-12)。
 * daily-roll.mjs の --redo / --redo-restore の時だけ通る。いつもの回 (予定のタスク) はここを読まない。
 *
 * 守り (全部そろった時だけ消す。1 つでも外れたら何も書かずに訳を出して終わる):
 *   ① 今がその日の始まり (16:00 JST) より前  ② そのお題の挑戦の行が 0  ③ その日の結果の行が 0  ④ 置いたお題の行がちょうど 1 つ
 *   ②③ は消す文の中にも条件で入れる (読んだ後に挑戦が入っても消えない)
 * 消す物: daily_topics のその日の 1 行だけ。箱から出たお題なら daily_box のその投稿を used → ok に戻す。ほかの表・ほかの日は触らない。
 * 戻し方: 消す前の行をまるごと控えのファイルに残し、組み直しが落ちた・お題が書けなかった時は控えから戻す。手で戻すのは --redo-restore <控え>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { longValue } from "./_d1-shim.mjs";

const JST = 9 * 3600e3, H16 = 16 * 3600e3;
const startOf = (day) => Date.parse(`${day}T00:00:00Z`) + H16 - JST;
const NOTES = process.env.EXILEDESK_REDO_DIR || join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "docs/org/daily/notes");
const NO_TRY = "NOT EXISTS (SELECT 1 FROM daily_tries WHERE topic_id = ?) AND NOT EXISTS (SELECT 1 FROM daily_results WHERE day = ?)";

/** 守り ①〜④。通れば今の行、外れたら訳 */
async function guard(db, now, day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { why: `日の形が違う: ${day}` };
  if (now >= startOf(day)) return { why: `① ${day} のお題はもう出ている (16:00 を過ぎた)。出たお題は変えない (D-21)` };
  const id = `d${day}`;
  const { results: rows } = await db.prepare("SELECT * FROM daily_topics WHERE id = ? OR day = ?").bind(id, day).all();
  const tries = (await db.prepare("SELECT count(*) AS n FROM daily_tries WHERE topic_id = ?").bind(id).first())?.n ?? 0;
  if (tries > 0) return { why: `② ${id} に挑戦の行が ${tries} ある` };
  const res = (await db.prepare("SELECT count(*) AS n FROM daily_results WHERE day = ?").bind(day).first())?.n ?? 0;
  if (res > 0) return { why: `③ ${day} に結果の行が ${res} ある` };
  return { id, rows };
}

/** 行を 1 つ入れ直す文 (相場の写しは 1 文の上限を超えるので印で入れて小分けに足す、_d1-shim の longValue) */
function insertBack(db, row) {
  const big = typeof row.prices === "string" && row.prices.length > 20000 ? longValue(db, { table: "daily_topics", col: "prices", id: row.id, value: row.prices }) : null;
  const cols = Object.keys(row);
  const use = big ? big.db : db;
  const stmt = use.prepare(`INSERT OR IGNORE INTO daily_topics (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).bind(...cols.map((c) => (big && c === "prices" ? big.mark : row[c])));
  return { use, stmt };
}

/**
 * 消す (--dry の時は消さずに、消す物だけ返す)。返り = { row, boxId, file, patch(inp), restore() }
 * patch = --dry 用: 読んだ材料から置いたお題を抜き、箱の投稿を ok に戻した形にして、組み直しを書かずに見る
 */
export async function redoTake(db, now, day, dry) {
  const g = await guard(db, now, day);
  if (g.why) return { stop: g.why };
  if (g.rows.length !== 1) return { stop: `④ ${day} の置いたお題の行が ${g.rows.length} (1 つの時だけ消す)` };
  const row = g.rows[0], boxId = row.box_id ?? null;
  const box = boxId ? await db.prepare("SELECT b.id, b.created, b.note, b.item, b.status, n.name AS nick FROM daily_box b LEFT JOIN daily_nicks n ON n.id = b.nick_id WHERE b.id = ?").bind(boxId).first() : null;
  const stamp = new Date(now + JST).toISOString().slice(11, 19).replace(/:/g, "");
  const file = join(NOTES, `redo-${day}-${stamp}.json`);
  console.log(`直す口: 消す行 = ${row.id} (${row.base_ja ?? row.base}、shown_by ${row.shown_by}、決まりの版 ${row.rules_ver ?? "-"})${boxId ? `・箱の投稿 ${boxId} を used → ok` : "・箱の投稿なし"}`);
  if (dry) console.log(`直す口: --dry なので消さない・控えも書かない (書く時の控え = ${file})`);
  else {
    mkdirSync(NOTES, { recursive: true });
    writeFileSync(file, JSON.stringify({ day, at: now, row, boxId, boxStatus: box?.status ?? null }));
    console.log(`直す口: 控え = ${file}`);
    const stmts = [];
    if (boxId) stmts.push(db.prepare(`UPDATE daily_box SET status = 'ok' WHERE id = ? AND status = 'used' AND ${NO_TRY}`).bind(boxId, row.id, day));
    stmts.push(db.prepare(`DELETE FROM daily_topics WHERE id = ? AND ${NO_TRY}`).bind(row.id, row.id, day));
    await db.batch(stmts);
    if (await db.prepare("SELECT 1 AS x FROM daily_topics WHERE id = ?").bind(row.id).first()) return { stop: `消えなかった (消す間に挑戦が入った見込み)。控え ${file} は残る` };
    console.log("直す口: 消した → 組み直す");
  }
  const restore = async (why) => {
    console.log(`直す口: ${why} → 控えから戻す`);
    console.log(`直す口: ${await redoRestore(db, file, Date.now(), false)}`);
  };
  const patch = (inp) => {
    inp.topics = inp.topics.filter((t) => t.id !== row.id);
    if (box && !inp.box.some((b) => b.id === box.id)) inp.box.push({ ...box, status: "ok" });
    return inp;
  };
  return { row, boxId, file, patch, restore };
}

/** 組み直した後: お題の行があるか。無ければ控えから戻す。返り = 終わりの番号 */
export async function redoCheck(db, redo) {
  const now = await db.prepare("SELECT id, base, base_ja, box_id, sample_id, shown_by, rules_ver FROM daily_topics WHERE id = ?").bind(redo.row.id).first();
  if (!now) { await redo.restore("組み直したお題が書かれていない"); return 1; }
  console.log(`直す口: 組み直した = ${now.id} (${now.base_ja ?? now.base}、${now.box_id ? `箱 ${now.box_id}` : `予定 ${now.sample_id ?? "-"}`}、決まりの版 ${now.rules_ver ?? "-"})。前の行の控え = ${redo.file}`);
  return 0;
}

/** 控えから戻す (--redo-restore)。守り ①②③ は同じ。今ある行 (組み直した物) は消して控えの行に替える */
export async function redoRestore(db, file, now, dry) {
  const b = JSON.parse(readFileSync(file, "utf8"));
  const g = await guard(db, now, b.day);
  if (g.why) return `戻さない: ${g.why}`;
  const cur = g.rows[0] ?? null;
  if (dry) return `--dry: ${b.row.id} を控えの行 (${b.row.base_ja ?? b.row.base}) に戻す${cur ? `・今の行 (${cur.base_ja ?? cur.base}) は消す` : ""}${cur?.box_id && cur.box_id !== b.boxId ? `・箱 ${cur.box_id} を ok に` : ""}${b.boxId ? `・箱 ${b.boxId} を used に` : ""} (書かない)`;
  const { use, stmt } = insertBack(db, b.row);
  const stmts = [];
  if (cur?.box_id && cur.box_id !== b.boxId) stmts.push(db.prepare(`UPDATE daily_box SET status = 'ok' WHERE id = ? AND status = 'used' AND ${NO_TRY}`).bind(cur.box_id, b.row.id, b.day));
  stmts.push(db.prepare(`DELETE FROM daily_topics WHERE id = ? AND ${NO_TRY}`).bind(b.row.id, b.row.id, b.day), stmt);
  if (b.boxId) stmts.push(db.prepare("UPDATE daily_box SET status = 'used' WHERE id = ? AND EXISTS (SELECT 1 FROM daily_topics WHERE id = ? AND box_id = ?)").bind(b.boxId, b.row.id, b.boxId));
  await use.batch(stmts);
  const back = await db.prepare("SELECT base, aims, shown_by FROM daily_topics WHERE id = ?").bind(b.row.id).first();
  return back && back.aims === b.row.aims && back.base === b.row.base ? `戻した: ${b.row.id} (${b.row.base_ja ?? b.row.base}、shown_by ${back.shown_by})` : `戻っていない: 今の行 = ${back ? back.base : "無い"}。控え ${file} を見て手で`;
}
