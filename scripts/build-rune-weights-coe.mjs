#!/usr/bin/env node
/**
 * build-rune-weights-coe.mjs — ルーン (ソウルコア) で付く特殊 MOD の重みを Craft of Exile (beta) から取る (2026-10-09)
 *
 * PoE2 のクライアントにも poe2db にも重みが無い (1 = 非公開)。Craft of Exile (beta) は 2026-09-03 に Krakenbul
 * (Prohibited Library) の実測でこの 6 種 (Chronomancy / Soul / Berserking / Marksman / Decay / Destruction) の重みを入れた。
 * オーナー「Craft of Exile 開いて重み読んできて」→「進めて」。
 *
 * 元: beta.craftofexile.com の json/poe2/<版>/data.json (ページが自分で読むデータ。classmods = 部位 → MOD → 重み)。
 * 手元の写し data-cache/coe-beta-data.json / coe-beta-english.json を読む (取り直す時はブラウザで beta を開いて同じ URL を保存)。
 * 突き合わせ: ルーンの種類 (influence) + 系統 + MOD レベル。同じ物が複数 (破壊の元素 4 つ) なら文で選ぶ。部位は名前で対応させる。
 *
 *   node scripts/build-rune-weights-coe.mjs
 * 結果: src/services/htc/rune-weights.json (patch.ts の applyPoe2dbFixes が当てる)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleEntry } from "./_bundle-ts.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "src/services/htc/rune-weights.json");
const strip = (s) => s.replace(/^[a-z]+=/, "").replace(/;\s*$/, "");
const C = JSON.parse(strip(readFileSync(resolve(ROOT, "data-cache/coe-beta-data.json"), "utf8")));
const L = JSON.parse(strip(readFileSync(resolve(ROOT, "data-cache/coe-beta-english.json"), "utf8")));

// 当てる前のデータで突き合わせる (当てた後は重みが変わっているだけなので、どちらでも同じ)
const { loadPatchSync } = await bundleEntry("scripts/_audit-poe2db-entry.ts");
const data = loadPatchSync();

const TAG_OF_INFLUENCE = { 1002: "chronomancy", 1003: "soul", 1004: "berserking", 1005: "marksman", 1006: "decay", 1007: "destruction" };
const fam = Object.fromEntries(C.families.entries.map((f) => [f.id, f.key]));
const mg = Object.fromEntries(C.modgroups.entries.map((g) => [g.id, g]));
const clsLabel = Object.fromEntries(C.classes.entries.map((c) => [c.id, L[c.label]]));
const norm = (s) => String(s).replace(/\[[^|\]]*\|([^\]]*)\]/g, "$1").replace(/\[([^\]]*)\]/g, "$1").replace(/[#\d.+\-()%]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Craft of Exile の行: ルーンの種類 → 系統 → [{ lvl, text, w: 部位の名前 → 重み }] */
const coe = [];
for (const m of C.mods.entries) {
  const g = mg[m.group];
  const tag = g && TAG_OF_INFLUENCE[g.influence];
  if (!tag) continue;
  const w = {};
  for (const [c, ms] of Object.entries(C.classmods)) if (ms[m.id] != null) w[clsLabel[c]] = ms[m.id];
  coe.push({ key: m.key, tag, fams: g.families.map((f) => fam[f]), lvl: m.minlvl, side: g.type === 1 ? "prefix" : "suffix", text: norm((m.stats ?? []).map((s) => L[s.label]).join(" ")), w });
}

/** こちらの部位 → Craft of Exile の部位の名前 */
const KIND = { Helmets: "Helmet", Gloves: "Gloves", Boots: "Boots", Body_Armours: "Body Armour", Wands: "Wands", Staves: "Staves", Sceptres: "Sceptres", Bows: "Bows", Crossbows: "Crossbows", OneHand_Maces: "One Hand Maces", TwoHand_Maces: "Two Hand Maces", Quarterstaves: "Quarterstaves", Spears: "Spears", Talismans: "Talismans" };
const ATTR = { str: "STR", dex: "DEX", int: "INT", str_dex: "STR/DEX", str_int: "STR/INT", dex_int: "DEX/INT", str_dex_int: "STR/DEX/INT", fire: "Fire", cold: "Cold", lightning: "Lightning", chaos: "Chaos", physical: "Physical" };
function labelOf(cls) {
  const m = /^([A-Za-z]+(?:_[A-Z][a-z]+)?)(?:_(.+))?$/.exec(cls);
  const kind = m && KIND[m[1]];
  if (!kind) return null;
  return m[2] && ATTR[m[2]] ? `${kind} (${ATTR[m[2]]})` : kind;
}
/** 部位の名前が無い時は、その MOD のいちばん多い重み */
const commonW = (w) => { const n = {}; for (const v of Object.values(w)) n[v] = (n[v] ?? 0) + 1; return Number(Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0]); };

const weights = {};
const miss = [];
let hit = 0;
for (const [cls, b] of data.bases) {
  for (const p of Object.values(b.pools.rune ?? {})) {
    for (const id of [...p.prefixes, ...p.suffixes]) {
      const m = data.mods.get(id);
      const tag = /\/Rune_([a-z]+)_/.exec(id)?.[1];
      if (!m || !tag) continue;
      const bare = m.family.replace(/^Rune_[a-z]+_/, "");
      const fams = (m.families ?? [m.family]).map((f) => f.replace(/^Rune_[a-z]+_/, ""));
      for (const t of m.tiers) {
        let cand = coe.filter((x) => x.tag === tag && x.lvl === t.ilvl && (x.fams.includes(bare) || fams.some((f) => x.fams.includes(f))));
        if (cand.length > 1) { const byText = cand.filter((x) => x.text === norm(m.text ?? "")); if (byText.length) cand = byText; }
        if (cand.length !== 1) { miss.push(`${id} Lv${t.ilvl} (${cand.length} 候補: ${cand.map((x) => x.key).join(",")})`); continue; }
        const x = cand[0];
        const label = labelOf(cls);
        const w = (label && x.w[label]) ?? commonW(x.w);
        if (!Number.isFinite(w)) { miss.push(`${id} Lv${t.ilvl} 重み無し`); continue; }
        (weights[id] ??= {})[t.ilvl] = w;
        hit++;
      }
    }
  }
}
writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), source: "Craft of Exile (beta) data.json classmods — Krakenbul / Prohibited Library の実測 (CoE 2026-09-03 更新)。scripts/build-rune-weights-coe.mjs", weights }, null, 1));
console.log(`当てた段 ${hit} / 当たらなかった ${miss.length}`);
for (const l of [...new Set(miss)].slice(0, 40)) console.log("  " + l);
console.log(`→ ${OUT}`);
