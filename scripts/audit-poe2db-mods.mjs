#!/usr/bin/env node
/**
 * audit-poe2db-mods.mjs — MOD の適合性を poe2db (今のページ) と 1 段ずつ全部照らし合わせる (2026-10-09)
 *
 * オーナー「タグが db から読めるなら最初からすべての情報は db から」「まずは MOD 関連の適合性をフルで洗い出さないと」。
 * audit-poe2db.mjs は系統 (付くか付かないか) だけ。こちらは段まで見る:
 *   - 段がある / 無い (系統 + プレ/サフィ + 必要レベル)
 *   - 重み (DropChance。冒涜は poe2db でも 1 = 非公開なので比べない)
 *   - 数値の幅 (poe2db の文の数字とこちらの ranges)
 * 置き場: normal / desecrated / essence (+ perfect_essence) / ルーンで付く MOD (destruction・marksman など)。
 * ページは audit-poe2db.mjs と同じ写し (data-cache/poe2db-pages)。無ければそちらを先に回す。
 *
 *   node scripts/audit-poe2db-mods.mjs
 * 結果: data-cache/poe2db-mod-audit.json と標準出力の集計
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleEntry } from "./_bundle-ts.mjs";
import { RUNE_POOLS } from "./_htc-base-tags.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = resolve(ROOT, "data-cache/poe2db-pages");
const { loadPatchSync, jaOfMod } = await bundleEntry("scripts/_audit-poe2db-entry.ts");
const data = loadPatchSync();

const pageOf = (cls) => cls.replace(/^(Wands|Staves|Crossbows)_.*$/, "$1").replace(/^OneHand_/, "One_Hand_").replace(/^TwoHand_/, "Two_Hand_");
const RUNE_GROUP = Object.fromEntries(RUNE_POOLS.map((r) => [r.id, r.tag]));

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
/** poe2db の文の数字 (タグを外した文から。絶対値で並べる。mod-value の中に ndash の span が入れ子なので文ごと読む) */
const dbNums = (str) => [...plain(str).matchAll(/\d+(?:\.\d+)?/g)].map((x) => Number(x[0])).sort((a, b) => a - b);
const ourNums = (t) => t.ranges.flatMap((r) => (r[0] === r[1] ? [r[0]] : [r[0], r[1]])).map((x) => Math.abs(x)).sort((a, b) => a - b);
/**
 * こちらの数字が poe2db の文の数字に全部入っていれば同じと見る (文には「1 体ごとに」「+1」の固定の数字も入る)。
 * 単位違い (毎分の自動回復 = 毎秒 × 60、リーチの万分率 = % × 100、ミリ秒、0.1 m) も同じと見る
 */
const sameNums = (ours, db) => [1, 60, 100, 1000, 0.1].some((k) => { const left = [...db]; return ours.every((x) => { const i = left.findIndex((y) => Math.abs(x - y * k) < 0.011 * Math.max(k, 1)); if (i < 0) return false; left.splice(i, 1); return true; }); });
const plain = (s) => String(s).replace(/<br\s*\/?>/g, " / ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/** こちらの 1 部位・1 置き場の段 (side・系統・レベルで引けるように) */
function ourTiers(b, group) {
  let pools;
  if (group === "normal") pools = [b.pools.normal];
  else if (group === "desecrated") pools = [b.pools.desecrated];
  else if (group === "essence") pools = [b.pools.essence];
  else pools = Object.entries(b.pools.rune ?? {}).filter(([id]) => RUNE_GROUP[id] === group).map(([, p]) => p);
  const out = [];
  for (const p of pools) for (const side of ["prefix", "suffix"]) for (const id of p?.[side === "prefix" ? "prefixes" : "suffixes"] ?? []) {
    const m = data.mods.get(id);
    if (!m) continue;
    if (group === "normal" && m.rune) continue;
    for (const t of m.tiers) out.push({ m, t, side, fams: m.families ?? [m.family] });
  }
  return out;
}

const pages = new Map();
for (const cls of data.bases.keys()) { const p = pageOf(cls); pages.set(p, [...(pages.get(p) ?? []), cls]); }
const GROUPS = { normal: ["normal"], desecrated: ["desecrated"], essence: ["essence", "perfect_essence"], ...Object.fromEntries(RUNE_POOLS.map((r) => [r.tag, [r.tag]])) };

const report = { generated: new Date().toISOString(), pages: {} };
const total = {};
const bump = (k, n = 1) => (total[k] = (total[k] ?? 0) + n);
for (const [pg, classes] of pages) {
  const path = resolve(CACHE, `${pg}.html`);
  if (!existsSync(path)) { report.pages[pg] = { error: "写しが無い (audit-poe2db.mjs で取る)" }; continue; }
  const mv = modsView(readFileSync(path, "utf8"));
  if (!mv) continue;
  const out = {};
  for (const [group, dbGroups] of Object.entries(GROUPS)) {
    const db = dbGroups.flatMap((g) => mv[g] ?? []).filter((e) => sideOf(e.ModGenerationTypeID) && e.ModFamilyList?.length);
    const ours = classes.flatMap((c) => ourTiers(data.bases.get(c), group).map((x) => ({ ...x, cls: c })));
    if (!db.length && !ours.length) continue;
    const used = new Set();
    const issues = { missing: [], extra: [], weight: [], values: [] };
    for (const e of db) {
      const side = sideOf(e.ModGenerationTypeID);
      const k = famKey(e.ModFamilyList);
      const lvl = Number(e.Level);
      const cand = ours.filter((o) => o.side === side && o.t.ilvl === lvl && (famKey(o.fams) === k || e.ModFamilyList.includes(o.m.family)));
      const label = `${side === "prefix" ? "P" : "S"} ${e.ModFamilyList.join("+")} Lv${lvl} ${plain(e.Name)} | ${plain(e.str)}`;
      if (!cand.length) { issues.missing.push(label); continue; }
      cand.forEach((o) => used.add(o));
      const n = dbNums(e.str);
      // 属性違いのページ (ワンド・スタッフ) は数値の合う方を採る
      const hit = cand.find((o) => sameNums(ourNums(o.t), n)) ?? cand[0];
      if (!sameNums(ourNums(hit.t), n)) issues.values.push(`${label} | こちら ${hit.m.id} ${JSON.stringify(hit.t.ranges)}`);
      const dw = Number(e.DropChance);
      if (group !== "desecrated" && Number.isFinite(dw) && dw !== hit.t.weight) issues.weight.push(`${label} | db ${dw} / こちら ${hit.t.weight} (${hit.m.id})`);
    }
    for (const o of ours) if (!used.has(o)) issues.extra.push(`${o.side === "prefix" ? "P" : "S"} ${o.fams.join("+")} Lv${o.t.ilvl} ${o.m.id} (${o.cls}) | ${jaOfMod(o.m)} ${JSON.stringify(o.t.ranges)} w${o.t.weight}`);
    for (const [k, v] of Object.entries(issues)) { bump(`${group}.${k}`, v.length); if (!v.length) delete issues[k]; }
    bump(`${group}.db段`, db.length);
    if (Object.keys(issues).length) out[group] = issues;
  }
  report.pages[pg] = out;
  const s = Object.entries(out).map(([g, x]) => `${g}: ${Object.entries(x).map(([k, v]) => `${k} ${v.length}`).join(" ")}`).join(" / ");
  console.log(`${pg.padEnd(26)} ${s || "一致"}`);
}
report.total = total;
writeFileSync(resolve(ROOT, "data-cache/poe2db-mod-audit.json"), JSON.stringify(report, null, 1));
console.log("\n合計", total);
console.log("→ data-cache/poe2db-mod-audit.json");
