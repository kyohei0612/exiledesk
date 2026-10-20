#!/usr/bin/env node
/**
 * audit-poe2db-runes.mjs — ルーン・ソウルコア・タリスマンの効果をエンジンの名簿 (craft-stage/stage-runes.json) と poe2db の強化のページで照らす (2026-10-20 J4)
 *
 * poe2db の強化のページ (https://poe2db.tw/jp/Augment、写しは data-cache/poe2db-extra/Augment.html。無ければ取る) はカードごとに
 * <a class="whiteitem …" href="英語の鍵">名前</a> と <div class="implicitMod">部位: 効果</div> が効果の数だけ並ぶ。
 * こちらは RUNES[英語名].effects の「catJa: ja」。比べる物: どちらかに無い / 効果の数 / 部位と文 (数字を除いた形) / 数字。違いは推し量らず並べる。
 *
 *   node scripts/audit-poe2db-runes.mjs   → data-cache/poe2db-rune-audit.json と標準出力の集計
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = resolve(ROOT, "data-cache/poe2db-extra/Augment.html");
const OUT = resolve(ROOT, "data-cache/poe2db-rune-audit.json");
const RUNES = JSON.parse(readFileSync(resolve(ROOT, "src/services/craft-stage/stage-runes.json"), "utf8")).runes;

if (!existsSync(PAGE)) {
  mkdirSync(dirname(PAGE), { recursive: true });
  const r = await fetch("https://poe2db.tw/jp/Augment", { headers: { "User-Agent": "Mozilla/5.0 ExileDesk-audit" } });
  if (!r.ok) throw new Error(`Augment: ${r.status}`);
  writeFileSync(PAGE, await r.text());
}
const html = readFileSync(PAGE, "utf8");
const plain = (s) => String(s).replace(/<br\s*\/?>/g, " / ").replace(/<[^>]+>/g, "").replace(/&#039;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const shape = (s) => plain(s).replace(/[0-9.()+\-%—\s]+/g, "").replace(/：/g, ":");
const nums = (s) => [...plain(s).matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
/** poe2db の隠れた stat の行 (英小文字の内部名 + [値]) */
const hidden = (t) => /^[a-z][a-z0-9_ %+\-]*\[[^\]]*\]$/.test(t);
const nameOfHref = (h) => decodeURIComponent(h).replace(/_/g, " ");

const db = new Map();
for (const p of html.split('<div class="flex-grow-1 ms-2"><a class="whiteitem').slice(1)) {
  const a = /href="([^"]+)">([^<]+)<\/a>/.exec(p);
  if (!a) continue;
  const end = p.indexOf('<div class="col">');
  const body = end > 0 ? p.slice(0, end) : p;
  const lines = [...body.matchAll(/<div class="implicitMod">([\s\S]*?)<\/div>/g)].map((m) => plain(m[1]));
  if (!lines.length) continue;
  db.set(nameOfHref(a[1]), { ja: plain(a[2]), lines });
}

/** 部位の札: こちらの catJa は英語のままの物がある (Boots)。poe2db の日本語に揃えて比べる (札の中身の照らしではない) */
const CAT_JA = { "Boots": "靴", "Gloves": "手袋", "Helmet": "兜", "Body Armour": "鎧", "Shield": "盾", "Buckler": "バックラー", "Sceptre": "セプター", "Focus": "フォーカス", "Quiver": "矢筒", "Ring": "指輪", "Amulet": "アミュレット", "Belt": "ベルト", "Wand": "ワンド", "Staff": "スタッフ", "Bow": "弓", "Crossbow": "クロスボウ", "Spear": "スピア", "Quarterstaff": "クォータースタッフ", "One Hand Mace": "片手メイス", "Two Hand Mace": "両手メイス", "Talisman": "タリスマン" };
const catOf = (c) => CAT_JA[c] ?? c;
const r = { onlyEngine: [], onlyDb: [], count: [], text: [], values: [], hidden: 0, same: 0 };
const byJa = new Map(Object.entries(RUNES).map(([en, x]) => [x.ja, en]));
const seen = new Set();
for (const [en, d] of db) {
  const key = RUNES[en] ? en : byJa.get(d.ja);
  if (!key) { r.onlyDb.push(`${en} (${d.ja}) | ${d.lines.join(" / ")}`); continue; }
  seen.add(key);
  // 「部位: 効果, 効果」を「部位 | 効果」の粒に分けて順を問わず比べる (区切りは「、」「, 」「 / 」・改行で揺れる。並びも揺れる)
  const atoms = (lines) => lines.flatMap((l) => {
    const i = l.indexOf(": ");
    const cat = i > 0 ? l.slice(0, i) : "", rest = i > 0 ? l.slice(i + 2) : l;
    return rest.split(/、|, | \/ |\n/).map((x) => x.trim()).filter(Boolean).map((x) => ({ cat, x }));
  });
  const dbAtoms = atoms(d.lines);
  const hiddenAtoms = dbAtoms.filter((a) => hidden(a.x));
  r.hidden += hiddenAtoms.length;
  const left = dbAtoms.filter((a) => !hidden(a.x));
  const ours = atoms(RUNES[key].effects.map((e) => `${catOf(e.catJa)}: ${e.ja}`));
  let bad = false;
  const miss = [];
  for (const o of ours) {
    const i = left.findIndex((a) => a.cat === o.cat && shape(a.x) === shape(o.x));
    if (i < 0) { miss.push(`${o.cat}: ${o.x}`); continue; }
    const a = left.splice(i, 1)[0];
    if (nums(a.x).join(",") !== nums(o.x).join(",")) { r.values.push(`${key} | db: ${a.cat}: ${a.x} | こちら: ${o.cat}: ${o.x}`); bad = true; }
  }
  if (miss.length || left.length) { r.text.push(`${key} | こちらだけ: ${miss.join(" / ") || "—"} | db だけ: ${left.map((a) => `${a.cat}: ${a.x}`).join(" / ") || "—"}`); bad = true; }
  if (!bad) r.same++;
}
for (const [en, x] of Object.entries(RUNES)) if (!seen.has(en)) r.onlyEngine.push(`${en} (${x.ja}, ${x.kind}${x.available === false ? "、今のゲームに無い" : ""})`);
const total = { db: db.size, engine: Object.keys(RUNES).length, same: r.same, onlyEngine: r.onlyEngine.length, onlyDb: r.onlyDb.length, count: r.count.length, text: r.text.length, values: r.values.length, hidden: r.hidden };
writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), total, ...r }, null, 1));
console.log(total, `→ ${OUT}`);
