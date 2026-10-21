#!/usr/bin/env node
/**
 * audit-poe2db-tags.mjs — MOD のタグを poe2db (今のページ) と 1 段ずつ全部照らし合わせる (2026-10-18 オーナー「db みてタグフルチェックして相違ないか調べて」「db に全て合わせてくれ」)
 *
 * poe2db の段の行の mod_no (<span data-tag="…">) と、こちらの画面のタグ (displayTags、無ければ tags を shownTags に通した物。MOD 一覧・カードと同じ) を比べる。
 * 冒涜の陣営 (アマナム・ウラマン・カーガル) は画面では別の札なので別に比べる (抽選のお告げにも使う)。
 * 段の突き合わせは audit-poe2db-mods.mjs と同じ (プレ/サフィ・系統・必要レベル)。置き場は normal / desecrated / essence (+ perfect_essence)。
 * poe2db は 1 ページに種類違い (エッセンスの防御 % のアーマー / 回避 / ES、追加ダメージの物理 / 火 / 冷気 / 雷) を全部並べるので、
 * こちらの 1 つの MOD に合う行は 1 つに決める: ぴったり合う行がある → 食い違いなし / 全部同じタグ / 文が同じ行 / ベースの防御の種類と同じタグの行。
 * 決まらない物は「曖昧」として出す (直さない)。
 * ページの写しは data-cache/poe2db-pages (audit-poe2db.mjs --refresh で取り直す)。
 *
 *   node scripts/audit-poe2db-tags.mjs           照らし合わせだけ (直しを当てた後のデータ。0 なら合っている)
 *   node scripts/audit-poe2db-tags.mjs --write   直しを作り直す (当てる前のデータで比べて src/services/htc/poe2db-tag-fixes.json に書く。patch.ts が読み込み時に当てる)
 * 結果: data-cache/poe2db-tag-audit.json と標準出力の集計
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleEntry } from "./_bundle-ts.mjs";
import { pageOf, modsView, famKey, sameNumsScaled as sameNums } from "./_poe2db-common.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = resolve(ROOT, "data-cache/poe2db-pages");
const OUT = resolve(ROOT, "src/services/htc/poe2db-tag-fixes.json");
const WRITE = process.argv.includes("--write");
// 直しを作る時は当てる前のデータで比べる (当てた後だと食い違いが 0 になって直しが消える)
if (WRITE || !existsSync(OUT)) writeFileSync(OUT, JSON.stringify({ generated: "", tags: {} }));
const { loadPatchSync, jaOfMod, shownTags } = await bundleEntry("scripts/_audit-poe2db-tags-entry.ts");
const data = loadPatchSync();


const sideOf = (id) => (id === "1" ? "prefix" : id === "2" ? "suffix" : null);
const plain = (s) => String(s).replace(/<br\s*\/?>/g, " / ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
/** 文の比べ (数字・幅は # に、+ と空白は外す) */
const norm = (s) => plain(s).replace(/\(\s*-?\d+(?:\.\d+)?\s*[—-]\s*-?\d+(?:\.\d+)?\s*\)/g, "#").replace(/-?\d+(?:\.\d+)?/g, "#").replace(/[+\s]/g, "");
/** 数値の突き合わせ (audit-poe2db-mods.mjs と同じ。候補が複数ある時に数値の合う段を採る) */
const dbNums = (str) => [...plain(str).matchAll(/\d+(?:\.\d+)?/g)].map((x) => Number(x[0])).sort((a, b) => a - b);
const ourNums = (t) => t.ranges.flatMap((r) => (r[0] === r[1] ? [r[0]] : [r[0], r[1]])).map((x) => Math.abs(x)).sort((a, b) => a - b);
/** poe2db の段のタグ (mod_no の data-tag) */
const dbTags = (e) => [...new Set((e.mod_no ?? []).flatMap((h) => [...String(h).matchAll(/data-tag="([^"]+)"/g)].map((x) => x[1])))].sort();
/** 冒涜の陣営。画面は札とは別に陣営の印で出す (mod-list.ts の FACTION_TAGS) */
const isFaction = (t) => /^(ulaman|amanamu|kurgal)_mod$/.test(t);
/** こちらの画面のタグ (mod-list.ts と同じ: displayTags、無ければ tags を shownTags に通した物) */
const ourTags = (m) => [...new Set(shownTags(m.displayTags ?? m.tags ?? []))].sort();
const ourFaction = (m) => [...new Set([...(m.displayTags ?? []), ...(m.tags ?? [])].filter(isFaction))].sort();
/** 部位の防御の種類 (Body_Armours_str_int → armour・energy_shield)。エッセンスの防御 % の版を決める */
const DEF = { str: "armour", dex: "evasion", int: "energy_shield" };
const defenceOf = (cls) => { const m = /_((?:str|dex|int)(?:_(?:str|dex|int))*)$/.exec(cls); return m ? m[1].split("_").map((a) => DEF[a]).sort() : cls === "Bucklers" ? ["evasion"] : cls === "Foci" ? ["energy_shield"] : null; };

function ourTiers(b, group) {
  const pools = group === "normal" ? [b.pools.normal] : group === "desecrated" ? [b.pools.desecrated] : [b.pools.essence];
  const out = [];
  for (const p of pools) for (const side of ["prefix", "suffix"]) for (const id of p?.[side === "prefix" ? "prefixes" : "suffixes"] ?? []) {
    const m = data.mods.get(id);
    if (!m || (group === "normal" && m.rune)) continue;
    for (const t of m.tiers) out.push({ m, t, side, fams: m.families ?? [m.family] });
  }
  return out;
}

const pages = new Map();
for (const cls of data.bases.keys()) { const p = pageOf(cls); pages.set(p, [...(pages.get(p) ?? []), cls]); }
const GROUPS = { normal: ["normal"], desecrated: ["desecrated"], essence: ["essence", "perfect_essence"] };

/** こちらの MOD ごとに、突き合わせた poe2db の行 (タグ・陣営・文) */
const rows = new Map();
let compared = 0, missing = 0;
for (const [pg, classes] of pages) {
  const path = resolve(CACHE, `${pg}.html`);
  if (!existsSync(path)) continue;
  const mv = modsView(readFileSync(path, "utf8"));
  if (!mv) continue;
  for (const [group, dbGroups] of Object.entries(GROUPS)) {
    const db = dbGroups.flatMap((g) => mv[g] ?? []).filter((e) => sideOf(e.ModGenerationTypeID) && e.ModFamilyList?.length);
    const ours = classes.flatMap((c) => ourTiers(data.bases.get(c), group).map((x) => ({ ...x, cls: c })));
    for (const e of db) {
      const side = sideOf(e.ModGenerationTypeID);
      const k = famKey(e.ModFamilyList);
      const lvl = Number(e.Level);
      const cand = ours.filter((o) => o.side === side && o.t.ilvl === lvl && (famKey(o.fams) === k || e.ModFamilyList.includes(o.m.family)));
      if (!cand.length) { missing++; continue; }
      const all = dbTags(e);
      const want = all.filter((t) => !isFaction(t));
      const wantFaction = all.filter(isFaction);
      // 候補が複数ある時は、タグと陣営の合う方 → 数値と陣営の合う方 → 数値の合う方
      const same = (o) => ourTags(o.m).join(",") === want.join(",") && ourFaction(o.m).join(",") === wantFaction.join(",");
      const n = dbNums(e.str);
      const hit = cand.find(same) ?? cand.find((o) => sameNums(ourNums(o.t), n) && ourFaction(o.m).join(",") === wantFaction.join(",")) ?? cand.find((o) => sameNums(ourNums(o.t), n)) ?? cand[0];
      compared++;
      const r = rows.get(hit.m.id) ?? { m: hit.m, cls: hit.cls, group, list: [] };
      r.list.push({ tags: want, faction: wantFaction, text: norm(e.str), plain: plain(e.str), lvl });
      rows.set(hit.m.id, r);
    }
  }
}

const key = (x) => `${x.tags.join(",")}|${x.faction.join(",")}`;
const uniq = (xs) => [...new Map(xs.map((x) => [key(x), x])).values()];
const diffs = [], ambiguous = [], fixes = {};
for (const [id, r] of rows) {
  const have = { tags: ourTags(r.m), faction: ourFaction(r.m) };
  if (r.list.some((x) => key(x) === key(have))) continue;
  const ours = norm(jaOfMod(r.m));
  const def = defenceOf(r.cls);
  // 合う行を 1 つに: 全部同じタグ → 文が同じ行 → ベースの防御の種類と同じタグの行
  let pick = uniq(r.list);
  if (pick.length > 1) { const byText = uniq(r.list.filter((x) => x.text === ours)); if (byText.length === 1) pick = byText; }
  if (pick.length > 1 && def) { const byDef = pick.filter((x) => x.tags.join(",") === def.join(",")); if (byDef.length === 1) pick = byDef; }
  const row = { id, ja: jaOfMod(r.m), group: r.group, ours: [...have.tags, ...have.faction], db: pick.map((x) => [...x.tags, ...x.faction]), dbText: pick[0]?.plain, levels: [...new Set(r.list.map((x) => x.lvl))].sort((a, b) => a - b) };
  if (pick.length !== 1) { ambiguous.push(row); continue; }
  diffs.push(row);
  fixes[id] = [...pick[0].tags, ...pick[0].faction];
}
diffs.sort((a, b) => a.group.localeCompare(b.group) || a.id.localeCompare(b.id));
writeFileSync(resolve(ROOT, "data-cache/poe2db-tag-audit.json"), JSON.stringify({ generated: new Date().toISOString(), compared, missing, diffs, ambiguous }, null, 1));
for (const d of diffs) console.log(`${d.group.padEnd(10)} ${d.id.padEnd(52)} db [${d.db[0].join(",")}] / こちら [${d.ours.join(",")}]  ${d.ja}`);
for (const d of ambiguous) console.log(`曖昧       ${d.id.padEnd(52)} db ${d.db.map((x) => `[${x.join(",")}]`).join(" ")} / こちら [${d.ours.join(",")}]  ${d.ja}`);
console.log(`\n比べた段 ${compared} (こちらに無い段 ${missing}) / タグが違う MOD ${diffs.length} / 決まらない MOD ${ambiguous.length}`);
if (WRITE) {
  const sorted = Object.fromEntries(Object.entries(fixes).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), tags: sorted }, null, 1) + "\n");
  console.log(`→ ${OUT} (${Object.keys(sorted).length} MOD)`);
}
console.log("→ data-cache/poe2db-tag-audit.json");
