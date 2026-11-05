#!/usr/bin/env node
/**
 * build-rune-bonded-poe2db.mjs — ルーン・アイドル・遺産の「絆 (Bonded)」の行を poe2db の強化のページから取る (2026-11-05、動画 G3pdLFAZxN0 の手袋の #18)
 *
 * 絆の行は、シャーマンのアセンダンシーの「マジの叡智」を取った人だけに効く (poe2db の Bonded Modifiers の説明)。クライアントの表 (SoulCoreStats) には無いので、
 * build-stage-runes.mjs の stage-runes.json とは別の表にする (あちらを作り直しても消えない)。
 * poe2db の強化のページ (https://poe2db.tw/jp/Augment と /us/Augment、写しは data-cache/poe2db-extra/Augment.html・Augment-us.html。無ければ取る、--refresh で取り直す) は
 * カードごとに <div class="implicitMod">部位: 効果</div> の後に <div class="bondedMod">絆:</div><div class="bondedMod">部位: 効果</div> が並ぶ。
 * 部位の札はこちらの effects[].cat (英語、item-classes の soulCoreFits が読む) に引き直す (audit-poe2db-runes.mjs と同じ CAT_JA + 名簿の catJa)。引けない行は標準出力に並べる (推し量らない)。
 *
 *   node scripts/build-rune-bonded-poe2db.mjs [--refresh]   → src/services/craft-stage/rune-bonded.json { bonded: { <英語名>: { <cat>: { ja, en } } } }
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = { ja: resolve(ROOT, "data-cache/poe2db-extra/Augment.html"), en: resolve(ROOT, "data-cache/poe2db-extra/Augment-us.html") };
const OUT = resolve(ROOT, "src/services/craft-stage/rune-bonded.json");
const RUNES = JSON.parse(readFileSync(resolve(ROOT, "src/services/craft-stage/stage-runes.json"), "utf8")).runes;
const refresh = process.argv.includes("--refresh");

for (const [lang, p] of Object.entries(PAGES)) {
  if (existsSync(p) && !refresh) continue;
  mkdirSync(dirname(p), { recursive: true });
  const r = await fetch(`https://poe2db.tw/${lang === "ja" ? "jp" : "us"}/Augment`, { headers: { "User-Agent": "Mozilla/5.0 ExileDesk-audit" } });
  if (!r.ok) throw new Error(`Augment ${lang}: ${r.status}`);
  writeFileSync(p, await r.text());
}
const plain = (s) => String(s).replace(/<br\s*\/?>/g, " / ").replace(/<[^>]+>/g, "").replace(/&#039;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const nameOfHref = (h) => decodeURIComponent(h).replace(/_/g, " ");
/** カードごとの絆の行 [{ cat, text }] (見出しの「絆:」「Bonded:」は除く) */
function bondedOf(html) {
  const out = new Map();
  for (const p of html.split('<div class="flex-grow-1 ms-2"><a class="whiteitem').slice(1)) {
    const a = /href="([^"]+)">([^<]+)<\/a>/.exec(p);
    if (!a) continue;
    const end = p.indexOf('<div class="col">');
    const body = end > 0 ? p.slice(0, end) : p;
    const rows = [...body.matchAll(/<div class="bondedMod">([\s\S]*?)<\/div>/g)].map((m) => plain(m[1])).filter((l) => l.includes(": "))
      .map((l) => { const i = l.indexOf(": "); return { cat: l.slice(0, i), text: l.slice(i + 2) }; });
    if (rows.length && !out.has(a[1])) out.set(a[1], { name: plain(a[2]), rows });
  }
  return out;
}
const ja = bondedOf(readFileSync(PAGES.ja, "utf8")), en = bondedOf(readFileSync(PAGES.en, "utf8"));

const CAT_JA = { "Boots": "靴", "Gloves": "手袋", "Helmet": "兜", "Body Armour": "鎧", "Shield": "盾", "Buckler": "バックラー", "Sceptre": "セプター", "Focus": "フォーカス", "Quiver": "矢筒", "Ring": "指輪", "Amulet": "アミュレット", "Belt": "ベルト", "Wand": "ワンド", "Staff": "スタッフ", "Bow": "弓", "Crossbow": "クロスボウ", "Spear": "スピア", "Quarterstaff": "クォータースタッフ", "One Hand Mace": "片手メイス", "Two Hand Mace": "両手メイス", "Talisman": "タリスマン" };
/** poe2db の部位の札 → こちらの cat (soulCoreFits が読む英語の札)。絆の部位は効き目の部位と違う物がある (ロバストのルーン = 効き目は全ての装備品、絆は武器・防具ごと) ので、名簿の全部の札から引く */
const CAT_OF = new Map(Object.entries(CAT_JA).map(([c, j]) => [j, c]));
for (const x of Object.values(RUNES)) for (const e of x.effects) CAT_OF.set(e.catJa, e.cat);
const byJa = new Map(Object.entries(RUNES).map(([k, x]) => [x.ja, k]));
const bonded = {}, misses = [];
let rows = 0;
for (const [href, d] of ja) {
  const key = RUNES[nameOfHref(href)] ? nameOfHref(href) : byJa.get(d.name);
  if (!key) { misses.push(`名簿に無い: ${nameOfHref(href)} (${d.name})`); continue; }
  const e = en.get(href)?.rows ?? [];
  if (e.length !== d.rows.length) { misses.push(`英語の行の数が違う: ${key}`); continue; }
  d.rows.forEach((r, i) => {
    const cat = CAT_OF.get(r.cat);
    if (!cat) { misses.push(`部位の札を引けない: ${key} | ${r.cat}: ${r.text}`); return; }
    (bonded[key] ??= {})[cat] = { ja: r.text, en: e[i].text };
    rows++;
  });
}
writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), source: "poe2db.tw/jp/Augment・/us/Augment の bondedMod (絆。シャーマンのマジの叡智を取った人だけ効く)", bonded }, null, 1) + "\n");
console.log({ cards: Object.keys(bonded).length, rows, misses: misses.length }, `→ ${OUT}`);
for (const m of misses) console.log(" ", m);
