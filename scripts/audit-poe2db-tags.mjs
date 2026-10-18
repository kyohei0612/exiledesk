#!/usr/bin/env node
/**
 * audit-poe2db-tags.mjs — MOD のタグを poe2db (今のページ) と 1 段ずつ全部照らし合わせる (2026-10-18 オーナー「db みてタグフルチェックして相違ないか調べて」)
 *
 * poe2db の段の行の mod_no (<span data-tag="…">) と、こちらの画面のタグ (displayTags、無ければ tags を shownTags に通した物。MOD 一覧・カードと同じ) を比べる。
 * 段の突き合わせは audit-poe2db-mods.mjs と同じ (プレ/サフィ・系統・必要レベル)。置き場は normal / desecrated / essence (+ perfect_essence)。
 * ページの写しは data-cache/poe2db-pages (audit-poe2db.mjs --refresh で取り直す)。
 *
 *   node scripts/audit-poe2db-tags.mjs
 * 結果: data-cache/poe2db-tag-audit.json と標準出力の集計 (食い違いは MOD ごとに 1 行)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleEntry } from "./_bundle-ts.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = resolve(ROOT, "data-cache/poe2db-pages");
const { loadPatchSync, jaOfMod, shownTags } = await bundleEntry("scripts/_audit-poe2db-tags-entry.ts");
const data = loadPatchSync();

const pageOf = (cls) => cls.replace(/^(Wands|Staves|Crossbows)_.*$/, "$1").replace(/^OneHand_/, "One_Hand_").replace(/^TwoHand_/, "Two_Hand_");
function modsView(html) {
  const i = html.indexOf("new ModsView(");
  if (i < 0) return null;
  let j = i + 13, depth = 0, inStr = false, esc = false;
  for (; j < html.length; j++) {
    const ch = html[j];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { j++; break; } }
  }
  return JSON.parse(html.slice(i + 13, j));
}
const famKey = (fams) => [...fams].sort().join("+");
const sideOf = (id) => (id === "1" ? "prefix" : id === "2" ? "suffix" : null);
/** 数値の突き合わせ (audit-poe2db-mods.mjs と同じ。候補が複数ある時に数値の合う段を採る) */
const dbNums = (str) => [...plain(str).matchAll(/\d+(?:\.\d+)?/g)].map((x) => Number(x[0])).sort((a, b) => a - b);
const ourNums = (t) => t.ranges.flatMap((r) => (r[0] === r[1] ? [r[0]] : [r[0], r[1]])).map((x) => Math.abs(x)).sort((a, b) => a - b);
const sameNums = (ours, db) => [1, 60, 100, 1000, 0.1].some((k) => { const left = [...db]; return ours.every((x) => { const i = left.findIndex((y) => Math.abs(x - y * k) < 0.011 * Math.max(k, 1)); if (i < 0) return false; left.splice(i, 1); return true; }); });
const plain = (s) => String(s).replace(/<br\s*\/?>/g, " / ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
/** poe2db の段のタグ (mod_no の data-tag) */
const dbTags = (e) => [...new Set((e.mod_no ?? []).flatMap((h) => [...String(h).matchAll(/data-tag="([^"]+)"/g)].map((x) => x[1])))].sort();
/** こちらの画面のタグ (mod-list.ts と同じ: displayTags、無ければ tags を shownTags に通した物 = MOD 一覧・カードに出る札) */
const ourTags = (m) => [...new Set(shownTags(m.displayTags ?? m.tags ?? []))].sort();
/** 冒涜の陣営 (アマナム・ウラマン・カーガル)。画面は札とは別に陣営の印で出す (mod-list.ts の FACTION_TAGS) ので、別に比べる */
const isFaction = (t) => /^(ulaman|amanamu|kurgal)_mod$/.test(t);
const ourFaction = (m) => [...new Set([...(m.displayTags ?? []), ...(m.tags ?? [])].filter(isFaction))].sort();

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

/** MOD ごとの食い違い (同じ MOD は部位をまたいで 1 つにまとめる) */
const diffs = new Map();
let compared = 0, missing = 0;
for (const [pg, classes] of pages) {
  const path = resolve(CACHE, `${pg}.html`);
  if (!existsSync(path)) continue;
  const mv = modsView(readFileSync(path, "utf8"));
  if (!mv) continue;
  for (const [group, dbGroups] of Object.entries(GROUPS)) {
    const db = dbGroups.flatMap((g) => mv[g] ?? []).filter((e) => sideOf(e.ModGenerationTypeID) && e.ModFamilyList?.length);
    const ours = classes.flatMap((c) => ourTiers(data.bases.get(c), group));
    for (const e of db) {
      const side = sideOf(e.ModGenerationTypeID);
      const k = famKey(e.ModFamilyList);
      const lvl = Number(e.Level);
      const cand = ours.filter((o) => o.side === side && o.t.ilvl === lvl && (famKey(o.fams) === k || e.ModFamilyList.includes(o.m.family)));
      if (!cand.length) { missing++; continue; }
      const all = dbTags(e);
      const want = all.filter((t) => !isFaction(t));
      const wantFaction = all.filter(isFaction);
      // 属性違いのページ (ワンドなど) で候補が複数ある時は、タグの合う方を採る
      const same = (o) => ourTags(o.m).join(",") === want.join(",") && ourFaction(o.m).join(",") === wantFaction.join(",");
      const n = dbNums(e.str);
      const hit = cand.find(same) ?? cand.find((o) => sameNums(ourNums(o.t), n) && ourFaction(o.m).join(",") === wantFaction.join(",")) ?? cand.find((o) => sameNums(ourNums(o.t), n)) ?? cand[0];
      compared++;
      const have = ourTags(hit.m);
      const haveFaction = ourFaction(hit.m);
      if (have.join(",") === want.join(",") && haveFaction.join(",") === wantFaction.join(",")) continue;
      const key = `${hit.m.id}|${all.join(",")}`;
      const d = diffs.get(key) ?? { id: hit.m.id, ja: jaOfMod(hit.m), group, side, db: want, ours: have, dbFaction: wantFaction, oursFaction: haveFaction, dbText: plain(e.str), pages: new Set(), levels: new Set() };
      d.pages.add(pg);
      d.levels.add(lvl);
      diffs.set(key, d);
    }
  }
}
const list = [...diffs.values()].map((d) => ({ ...d, pages: [...d.pages], levels: [...d.levels].sort((a, b) => a - b), onlyDb: d.db.filter((t) => !d.ours.includes(t)), onlyOurs: d.ours.filter((t) => !d.db.includes(t)) }));
list.sort((a, b) => a.group.localeCompare(b.group) || a.id.localeCompare(b.id));
writeFileSync(resolve(ROOT, "data-cache/poe2db-tag-audit.json"), JSON.stringify({ generated: new Date().toISOString(), compared, missing, diffs: list }, null, 1));
for (const d of list) console.log(`${d.group.padEnd(10)} ${d.id.padEnd(48)} db [${[...d.db, ...d.dbFaction].join(",")}] / こちら [${[...d.ours, ...d.oursFaction].join(",")}]  ${d.ja}`);
console.log(`\n比べた段 ${compared} (こちらに無い段 ${missing}) / タグが違う MOD ${list.length}`);
console.log("→ data-cache/poe2db-tag-audit.json");
