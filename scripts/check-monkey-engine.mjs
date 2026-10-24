#!/usr/bin/env node
/**
 * check-monkey-engine.mjs — 猿 (モンキー隊長の台本) がツリーで書き出した記録と、エンジンの入口を照らし合わせる (2026-10-24 オーナー「照らし合わせの相手はエンジン」、ジン部長)
 *   node scripts/check-monkey-engine.mjs <猿の JSON のフォルダー> [--out <書き出すファイル>]
 * 読む物: フォルダーの中の *.json のうち { steps: [{ card, shelf: [{ why, off }], pick }] } の形の物 (1 匹 1 ファイル)。
 * 1 手ごとに: カードの文からベースと MOD (P7 物理ダメージが… = プレフィックス T7) を読み、エンジンで同じ形のアイテムを作り、
 *   棚の「打てる」の札の名前の集合 (エンジンの useReason、お告げ無し) と、猿が見た打てる札の名前の集合を比べる。
 *   カードにルーンの効き目の文があれば、そのクラフトのルーンをはめてから比べる。レアリティはカードに無いので、白・マジック・レアのどれかで集合が同じなら「合う」。合わない時は一番近い形との差を出す。
 * 乱数で変わる物 (付いた MOD・当たり外れ) は比べない (ツリーの箱の結果は当たり / 外れの見出しで、付いた MOD は記録に無い)。
 * 書き出し: 差の一覧を画面に、全部の手を --out (既定 <フォルダー>/engine-check.json) に。手元だけで、外へは出ない
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bundleEntry } from "./_bundle-ts.mjs";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
if (!dir) { console.error("使い方: node scripts/check-monkey-engine.mjs <猿の JSON のフォルダー> [--out <ファイル>]"); process.exit(1); }
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : join(dir, "engine-check.json");

const E = await bundleEntry("scripts/_monkey-engine-entry.ts");
E.load();

/** カードの文: 「<ベース> <部位> …プロパティ… 暗黙 … P7 文 S5 文」。MOD は「[PS]数字 文」の並び (MOD なし の時は無い) */
function parseCard(card) {
  const head = card.match(/^(\S+) /);
  const mods = [];
  const re = / ([PS])(\d+) (.+?)(?= [PS]\d+ |$)/g;
  for (const m of card.matchAll(re)) mods.push({ side: m[1], tier: Number(m[2]), text: m[3].trim() });
  return { baseJa: head?.[1] ?? null, mods };
}

const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "engine-check.json");
const rows = [];
let steps = 0, same = 0, skipped = 0;
const skipWhy = new Map();
const skip = (why) => { skipped++; skipWhy.set(why, (skipWhy.get(why) ?? 0) + 1); };
for (const f of files) {
  let rec;
  try { rec = JSON.parse(readFileSync(join(dir, f), "utf8")); } catch { continue; }
  if (!Array.isArray(rec?.steps)) continue;
  for (const st of rec.steps) {
    if (!st.card || !Array.isArray(st.shelf)) continue;
    steps++;
    const c = parseCard(st.card);
    const base = c.baseJa && E.baseOfJa(c.baseJa);
    if (!base) { skip(`ベースが読めない (${c.baseJa})`); continue; }
    const ms = c.mods.map((m) => ({ ...m, hit: E.modOf(base, m.side, m.tier, m.text) }));
    const miss = ms.filter((m) => !m.hit);
    if (miss.length) { skip("MOD がエンジンの一覧に無い"); rows.push({ file: f, i: st.i, base, kind: "MOD が読めない", mods: miss.map((m) => `${m.side}${m.tier} ${m.text}`) }); continue; }
    const monkey = new Set(st.shelf.filter((x) => !x.off).map((x) => x.why));
    const eng = E.check(base, ms.map((m) => m.hit), st.card);
    let best = null;
    for (const [rarity, names] of Object.entries(eng)) {
      if (!names) continue;
      const e = new Set(names);
      const onlyMonkey = [...monkey].filter((n) => !e.has(n));
      const onlyEngine = [...e].filter((n) => !monkey.has(n));
      const d = onlyMonkey.length + onlyEngine.length;
      if (!best || d < best.d) best = { rarity, d, onlyMonkey, onlyEngine };
    }
    if (!best) { skip("どのレアリティでも組み立てられない"); continue; }
    if (best.d === 0) { same++; continue; }
    rows.push({ file: f, i: st.i, base, kind: "棚が違う", rarity: best.rarity, card: st.card.slice(0, 160), 猿だけ: best.onlyMonkey, エンジンだけ: best.onlyEngine });
  }
}
writeFileSync(outFile, JSON.stringify({ steps, same, skipped, skipWhy: Object.fromEntries(skipWhy), rows }, null, 1));
console.log(`手 ${steps}: 棚が同じ ${same} / 違う ${rows.filter((r) => r.kind === "棚が違う").length} / 比べられない ${skipped}`);
for (const [w, n] of skipWhy) console.log(`  比べられない: ${w} ${n}`);
// 違いを札ごとにまとめる
const tally = new Map();
for (const r of rows.filter((r) => r.kind === "棚が違う")) {
  for (const n of r.猿だけ) tally.set(`猿だけ  ${n}`, (tally.get(`猿だけ  ${n}`) ?? 0) + 1);
  for (const n of r.エンジンだけ) tally.set(`エンジンだけ  ${n}`, (tally.get(`エンジンだけ  ${n}`) ?? 0) + 1);
}
for (const [k, n] of [...tally].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${n} 手  ${k}`);
console.log(`詳しく: ${outFile}`);
