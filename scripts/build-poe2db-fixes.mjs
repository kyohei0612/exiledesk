#!/usr/bin/env node
/**
 * build-poe2db-fixes.mjs — poe2db (今のページ) に合わせる直しを作る (2026-10-09)
 *
 * オーナー「タグが db から読めるなら最初からすべての情報は db から」「食い違いの直す候補、1 から全部直して」。
 * audit-poe2db-mods.mjs と同じ照らし合わせ (系統 + プレ/サフィ + 必要レベル + 数値) で、部位ごと・置き場ごとに:
 *   - 無い段: 他の部位の同じ置き場に、系統・側・レベル・数値が同じ段を持つ MOD があれば、その MOD を写して足す
 *     (id は「この部位/元の名前」。同じ id が既にあれば置き換える = 系統の名前違いもここで直る)。写せなければ残りとして出す
 *   - 余計な段: MOD の段が全部余計なら置き場から外す。一部だけなら、その段を外した MOD に置き換える
 *   - 重み: poe2db が数字 (1 = 非公開以外) を出していて、こちらと違えば poe2db に合わせる (普通・エッセンス)
 * 置き場: normal / desecrated / essence / ルーン (rune:<id>)。
 * 飛ばす物: キャノン (poe2db のページの書き方が違う)、属性違いをまとめたページ (ワンド・スタッフ・クロスボウ) の普通の「無い」
 *   (火のワンドに凍結が無いのはゲームの決まり。poe2db は 1 ページに全部出す)、深淵のエッセンス (消した側に付く。こちらはプレの 1 行で両側を扱う)
 *
 *   node scripts/build-poe2db-fixes.mjs     (写しは data-cache/poe2db-pages。無ければ audit-poe2db.mjs で取る)
 * 結果: src/services/htc/poe2db-pool-fixes.json (patch.ts の applyPoe2dbFixes が読み込み時に当てる)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleEntry } from "./_bundle-ts.mjs";
import { RUNE_POOLS } from "./_htc-base-tags.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = resolve(ROOT, "data-cache/poe2db-pages");
const OUT = resolve(ROOT, "src/services/htc/poe2db-pool-fixes.json");

// 直しを当てる前のデータで比べる (当てた後で比べると「無い」が 0 になって直しが消える)
const prev = readFileSync(OUT, "utf8");
writeFileSync(OUT, JSON.stringify({ generated: "", weights: {}, mods: [], pools: {}, essenceKeys: {} }));
let M;
try {
  M = await bundleEntry("scripts/_audit-poe2db-entry.ts");
} catch (e) {
  writeFileSync(OUT, prev);
  throw e;
}
const { loadPatchSync, jaOfMod } = M;
const data = loadPatchSync();
const essenceKeys = JSON.parse(readFileSync(resolve(ROOT, "src/services/htc/essence-keys.json"), "utf8")).keys;

const pageOf = (cls) => cls.replace(/^(Wands|Staves|Crossbows)_.*$/, "$1").replace(/^OneHand_/, "One_Hand_").replace(/^TwoHand_/, "Two_Hand_");
const MERGED_PAGES = new Set(["Wands", "Staves", "Crossbows"]);
const RUNE_GROUP = Object.fromEntries(RUNE_POOLS.map((r) => [r.id, r.tag]));
const SKIP_FAMS = new Set(["EssenceAbyss"]);

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
const plain = (s) => String(s).replace(/<br\s*\/?>/g, " / ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const dbNums = (str) => [...plain(str).matchAll(/\d+(?:\.\d+)?/g)].map((x) => Number(x[0]));
const ourNums = (t) => t.ranges.flatMap((r) => (r[0] === r[1] ? [r[0]] : [r[0], r[1]])).map((x) => Math.abs(x));
/** こちらの数字が poe2db の文の数字に全部入っている (単位違い: 毎分 = 毎秒 × 60、万分率 = % × 100、ミリ秒 = 秒 × 1000、0.1 m) */
const sameNums = (ours, db) => [1, 60, 100, 1000, 0.1].some((k) => { const left = [...db]; return ours.every((x) => { const i = left.findIndex((y) => Math.abs(x - y * k) < 0.011 * Math.max(k, 1)); if (i < 0) return false; left.splice(i, 1); return true; }); });

/** 部位の置き場 (group → { prefixes, suffixes }) */
function poolsOf(b) {
  const out = { normal: b.pools.normal, desecrated: b.pools.desecrated, essence: b.pools.essence };
  for (const [id, p] of Object.entries(b.pools.rune ?? {})) out[`rune:${id}`] = p;
  return out;
}
const dbGroupsOf = (g) => (g === "normal" ? ["normal"] : g === "desecrated" ? ["desecrated"] : g === "essence" ? ["essence", "perfect_essence"] : [RUNE_GROUP[g.slice(5)]]);
function tiersOf(b, g) {
  const p = poolsOf(b)[g];
  const out = [];
  if (!p) return out;
  for (const side of ["prefix", "suffix"]) for (const id of p[side === "prefix" ? "prefixes" : "suffixes"]) {
    const m = data.mods.get(id);
    if (!m || (g === "normal" && m.rune)) continue;
    m.tiers.forEach((t, ti) => out.push({ id, m, t, ti, side, fams: m.families ?? [m.family] }));
  }
  return out;
}
const matches = (e, o) => o.side === sideOf(e.ModGenerationTypeID) && o.t.ilvl === Number(e.Level) && (famKey(o.fams) === famKey(e.ModFamilyList) || e.ModFamilyList.includes(o.m.family));

// 写す元の候補: 置き場ごとに全部位の段
const donors = {};
for (const [cls, b] of data.bases) for (const g of Object.keys(poolsOf(b))) {
  const key = g.startsWith("rune:") ? `rune:${RUNE_GROUP[g.slice(5)]}` : g;
  for (const o of tiersOf(b, g)) if (!/_cannon$/.test(cls)) (donors[key] ??= []).push({ ...o, cls });
}

const fixes = { generated: new Date().toISOString(), note: "poe2db (今のページ) に合わせる直し。scripts/build-poe2db-fixes.mjs が作る", weights: {}, mods: [], pools: {}, essenceKeys: {} };
const cloned = new Map();
const left = [];
const pages = new Map();
for (const cls of data.bases.keys()) if (!/_cannon$/.test(cls)) { const p = pageOf(cls); pages.set(p, [...(pages.get(p) ?? []), cls]); }

for (const [pg, classes] of pages) {
  const path = resolve(CACHE, `${pg}.html`);
  if (!existsSync(path)) continue;
  const mv = modsView(readFileSync(path, "utf8"));
  if (!mv) continue;
  for (const cls of classes) {
    const b = data.bases.get(cls);
    const groups = new Set([...Object.keys(poolsOf(b)), "essence", "desecrated", ...RUNE_POOLS.filter((r) => (mv[r.tag] ?? []).length).map((r) => `rune:${r.id}`)]);
    for (const g of groups) {
      const db = dbGroupsOf(g).flatMap((x) => mv[x] ?? []).filter((e) => sideOf(e.ModGenerationTypeID) && e.ModFamilyList?.length);
      const ours = tiersOf(b, g);
      if (!db.length && !ours.length) continue;
      const fx = () => ((fixes.pools[cls] ??= {})[g] ??= { add: { prefixes: [], suffixes: [] }, remove: [] });
      const used = new Set();
      const want = new Map(); // 写す MOD の id → { donor, tiers: Set<段の番号> }
      for (const e of db) {
        const n = dbNums(e.str);
        const cand = ours.filter((o) => matches(e, o));
        const hit = cand.find((o) => sameNums(ourNums(o.t), n)) ?? cand[0];
        if (hit) {
          cand.forEach((o) => used.add(o));
          const dw = Number(e.DropChance);
          if ((g === "normal" || g === "essence") && Number.isFinite(dw) && dw > 1 && dw !== hit.t.weight) ((fixes.weights[hit.id] ??= {})[hit.t.ilvl] = dw);
          continue;
        }
        if (g === "normal" && MERGED_PAGES.has(pg)) continue;
        if (SKIP_FAMS.has(e.ModFamilyList[0])) continue;
        const dg = g.startsWith("rune:") ? `rune:${RUNE_GROUP[g.slice(5)]}` : g;
        const d = (donors[dg] ?? []).find((o) => matches(e, o) && sameNums(ourNums(o.t), n));
        if (!d) { left.push(`${cls} ${g} ${sideOf(e.ModGenerationTypeID)} ${e.ModFamilyList.join("+")} Lv${e.Level} | ${plain(e.str)}`); continue; }
        // 写し先の id ごとに段を集める (段ごとに別の部位から写すことがある。2026-10-09 鎧のライフのエッセンスが 1 段だけになっていた)
        const to = `${cls}/${d.id.split("/").slice(1).join("/")}`;
        const w = want.get(to) ?? { d, tiers: new Map() };
        w.tiers.set(`${d.t.ilvl}|${d.t.name}`, d.t);
        want.set(to, w);
      }
      // 余計な段 (写して置き換える MOD の段は数えない)
      const newIds = new Set(want.keys());
      const byMod = new Map();
      for (const o of ours) (byMod.get(o.id) ?? byMod.set(o.id, { m: o.m, side: o.side, keep: [], drop: [] }).get(o.id))[used.has(o) ? "keep" : "drop"].push(o.ti);
      for (const [id, x] of byMod) {
        if (!x.drop.length || newIds.has(id)) continue;
        if (!x.keep.length) { fx().remove.push(id); continue; }
        // 一部の段だけ余計: その段を外した MOD に置き換える (同じ id)
        cloned.set(id, { ...x.m, tiers: x.m.tiers.filter((_, i) => x.keep.includes(i)) });
      }
      for (const [id, { d, tiers }] of want) {
        const exists = ours.some((o) => o.id === id);
        let ts = [...tiers.values()].sort((a, b) => a.ilvl - b.ilvl);
        // エッセンスの段の名前は MOD レベルの低い順にレッサー / 普通 / 上級 (段ごとに別の部位から写すと名前が被った。2026-10-10 点検:
        // 鎧のライフが「上級」2 つ、タリスマンの攻撃速度が「普通」2 つで、レッサーのエッセンスが段無し・1 つ上が 1 つ下の段を付けていた)
        if (g === "essence" && ts.length === 3 && new Set(ts.map((t) => t.name)).size < 3) {
          const core = String(ts[0].name).replace(/^(Lesser|Greater|Perfect) /, "");
          ts = ts.map((t, i) => ({ ...t, name: `${["Lesser ", "", "Greater "][i]}${core}` }));
        }
        cloned.set(id, { ...d.m, id, tiers: ts });
        if (!exists) fx().add[d.side === "prefix" ? "prefixes" : "suffixes"].push(id);
        // エッセンスの鍵 (どのエッセンスで付くか) も写す
        if (g === "essence") for (const lv of ["lesser", "normal", "greater", "perfect"]) {
          const k = essenceKeys[`essence:${lv}:${d.id}`];
          if (k) fixes.essenceKeys[`essence:${lv}:${id}`] = k;
        }
      }
    }
  }
}
/**
 * 写す元がどの部位にも無いエッセンス・合金 (poe2db にだけある) は、poe2db の段から作る。文は英語 (ゲームの表記)、重みは 0 (エッセンスは確定で付く)
 */
const MANUAL = [
  { cls: "Foci", key: "Essence of Hysteria", ja: "ヒステリーのエッセンス", id: "Foci/PerfectEssence_EnergyShieldRegeneration", type: "suffix", family: "EnergyShieldRegeneration", text: "#% increased Energy Shield Recharge Rate", tier: { name: "Essence of Hysteria", ilvl: 66, ranges: [[20, 23]] } },
  { cls: "Talismans", key: "The Runefather's Alloy", ja: "ルーンファーザーの合金", id: "Talismans/PerfectEssence_LightningDamageCanIgnite", type: "suffix", family: "LightningDamageCanIgnite", alloy: true, text: "Lightning Damage from Hits also Contributes to Flammability and Ignite Magnitudes", tier: { name: "The Runefathers Alloy", ilvl: 65, ranges: [] } },
];
for (const x of MANUAL) {
  if (!data.bases.has(x.cls) || data.mods.has(x.id)) continue;
  const fam = x.family;
  const stillMissing = left.findIndex((l) => l.startsWith(`${x.cls} essence ${x.type} ${fam} `));
  if (stillMissing < 0) continue;
  left.splice(stillMissing, 1);
  cloned.set(x.id, { id: x.id, group: x.id.split("/")[1], field: x.id.split("/")[1], source: "perfect_essence", type: x.type, categories: [], family: fam, tags: [], ...(x.alloy ? { alloy: true } : {}), text: x.text, tiers: [{ ...x.tier, weight: 0, stats: [], codes: [] }] });
  ((fixes.pools[x.cls] ??= {}).essence ??= { add: { prefixes: [], suffixes: [] }, remove: [] }).add[x.type === "prefix" ? "prefixes" : "suffixes"].push(x.id);
  fixes.essenceKeys[`essence:perfect:${x.id}`] = { en: x.key, ja: x.ja };
}
fixes.mods = [...cloned.values()];
for (const [cls, gs] of Object.entries(fixes.pools)) for (const [g, x] of Object.entries(gs)) if (!x.add.prefixes.length && !x.add.suffixes.length && !x.remove.length) delete gs[g];
for (const [cls, gs] of Object.entries(fixes.pools)) if (!Object.keys(gs).length) delete fixes.pools[cls];
writeFileSync(OUT, JSON.stringify(fixes, null, 1));
const n = (f) => Object.values(fixes.pools).reduce((a, gs) => a + Object.values(gs).reduce((b, x) => b + f(x), 0), 0);
console.log(`重み ${Object.values(fixes.weights).reduce((a, x) => a + Object.keys(x).length, 0)} 段 / 写した・直した MOD ${fixes.mods.length} / 足す ${n((x) => x.add.prefixes.length + x.add.suffixes.length)} / 外す ${n((x) => x.remove.length)} / エッセンスの鍵 ${Object.keys(fixes.essenceKeys).length}`);
console.log(`写せなかった ${left.length}`);
for (const l of left) console.log("  " + l);
console.log(`→ ${OUT}`);
void jaOfMod;
