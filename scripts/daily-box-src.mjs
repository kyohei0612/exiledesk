#!/usr/bin/env node
/**
 * daily-box-src.mjs — デイリーの投稿の口に貼られた品の「元の文」と「読んだ結果」を取り出す (設計図 D-14c、オーナー 11-12「元の文ないわ、何貼ったかも追跡できるようにしないと」)。
 * 読むだけ。サーバーに読む口は無いので、締めの台本と同じ道で D1 を直に読む (wrangler d1 execute --remote、オーナーのログイン。scripts/_d1-shim.mjs)。
 *   node scripts/daily-box-src.mjs                    箱の投稿の新しい順 20 件 (id・時刻・ベース・状態・貼った文と読んだ段かエミュからの印・絵の元の有無)
 *   node scripts/daily-box-src.mjs --n 50             件数
 *   node scripts/daily-box-src.mjs --id <投稿の id>   その 1 件 (狙いと絵の元も出す)
 *   node scripts/daily-box-src.mjs --log 2026-11-13   その日 (日本時間) の分析の記録から、貼って読んだ組 (種類 paste-read: 貼った文・読んだ結果。投稿しなかった貼りも入る)
 *   EXILEDESK_D1_LOCAL=<置き場> を付けると本番でなく手元の D1 (pnpm dev:daily-api の置き場。分析の記録は手元には無い)
 * 開発版 (1440) で貼った分はサーバーには無い = 本線の手元の .dev-logs/<日>.jsonl の kind "paste-read" の行を読む
 */
import { remoteD1, target } from "./_d1-shim.mjs";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const JST = 9 * 3600e3;
const when = (ms) => new Date(Number(ms) + JST).toISOString().slice(0, 16).replace("T", " ");
const indent = (s) => String(s).split("\n").map((l) => `    ${l}`).join("\n");
/** 読んだ結果 (src/views/daily/paste-log.ts の pasteAfter) を 1 行ずつ */
const showAfter = (a) => {
  if (!a) return;
  console.log(`  読んだ結果: ${a.base ?? "ベースが読めない"} ilvl ${a.ilvl ?? "?"} ${a.rarity ?? ""} (${a.source ?? "?"}・${a.lang ?? "?"}・読み方 ${a.readings ?? 1} 通り)`);
  for (const m of a.mods ?? []) console.log(`    ${m.side === "prefix" ? "P" : m.side === "suffix" ? "S" : "?"} ${m.tier ?? "-"}${m.fits === false ? " (段に収まらず)" : ""}${m.fractured ? " ✦" : ""}${m.guess ? " (仮)" : ""} ${m.id ?? "(未発現)"} [貼った値 ${(m.shown ?? []).join(", ")}] ${m.text}`);
  for (const s of a.skipped ?? []) console.log(`    読まなかった行 (${s.code}): ${s.line}`);
};
const db = remoteD1();
console.log(`行き先 = ${target()} (読むだけ)`);

const logDay = opt("--log");
if (logDay) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(logDay)) { console.error("--log YYYY-MM-DD"); process.exit(1); }
  // 記録はまとまりごとの JSON の文字。貼りの記録を含むまとまりだけを読む
  const { results } = await db.prepare("SELECT at, body FROM logs WHERE day = ? AND instr(body, '\"k\":\"paste-read\"') > 0 ORDER BY id").bind(logDay).all();
  let n = 0;
  for (const r of results) {
    let b; try { b = JSON.parse(r.body); } catch { continue; }
    for (const rec of b.recs ?? []) {
      if (rec.k !== "paste-read") continue;
      n++;
      const d = rec.d ?? {};
      console.log(`\n#${n} ${when(rec.t)} JST 版 ${b.v ?? "-"} ${d.where === "sim" ? "シミュの貼って始める" : "デイリーの投稿"} (${d.chars ?? "?"} 字)`);
      showAfter(d.after);
      console.log(`  貼った文:\n${indent(d.text ?? "")}`);
    }
  }
  console.log(`\n${logDay}: 貼りの記録 ${n} 件`);
  process.exit(0);
}

const id = opt("--id"), n = Math.min(200, Math.max(1, Number(opt("--n") ?? 20) || 20));
const { results } = id
  ? await db.prepare("SELECT b.id, b.created, b.status, b.why, b.note, b.item, n.name FROM daily_box b LEFT JOIN daily_nicks n ON n.id = b.nick_id WHERE b.id = ?").bind(id).all()
  : await db.prepare(`SELECT b.id, b.created, b.status, b.why, b.note, b.item, n.name FROM daily_box b LEFT JOIN daily_nicks n ON n.id = b.nick_id ORDER BY b.created DESC LIMIT ${n}`).all();
for (const r of results) {
  let it = {}; try { it = JSON.parse(r.item); } catch { /* 形が違う行はそのまま */ }
  const src = it.src;
  console.log(`\n${r.id} ${when(r.created)} JST ${r.name ?? "名前なし"} | ${it.baseJa ?? it.base ?? "?"} ilvl ${it.ilvl ?? "?"} MOD ${it.aims?.length ?? 0} | ${r.status}${r.why ? ` (${r.why})` : ""}${r.note ? ` | 一言: ${r.note}` : ""} | 絵の元 ${it.card ? "あり" : "なし"}`);
  if (id) for (const a of it.aims ?? []) console.log(`  狙い (お題になった時の段): T${a.tier} ${a.ja ?? a.modId}`);
  if (id && it.card) for (const x of it.card.r ?? []) console.log(`  絵の行: ${x.g} ${x.t}${x.f ? " ✦" : ""}`);
  if (!src) console.log("  元の文: 無い (残す前の投稿か、スイッチが閉じていた)");
  else if (src.from === "emu") console.log("  元: エミュレーターで作った品 (文は無い)");
  else { showAfter(src.read); console.log(`  元の文 (${src.text.length} 字):\n${indent(src.text)}`); }
}
console.log(`\n${results.length} 件`);
