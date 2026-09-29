#!/usr/bin/env node
/**
 * build-stage-runes.mjs — クラフトステージのルーン (オーグメント) の表 (2026-09-29、POE2Tube 要望 ⑰-1)
 *
 *   node scripts/build-stage-runes.mjs      (手元のクライアントの書き出しだけ読む。通信しない)
 *
 * 元: data-cache/client-export-currency/tables/{English,Japanese}/ (SoulCores / SoulCoreStats / SoulCoreStatCategories / BaseItemTypes / Stats)、
 *     文面は data-cache/client-export/files/…stat_descriptions.csd (build-currency-effects-from-client.mjs と同じ描き方)、
 *     絵のパスは data-cache/client-export-art (BaseItemTypes → ItemVisualIdentity.DDSFile)、ドロップレベルは data-cache/base_items.json。
 * 出力: src/services/craft-stage/stage-runes.json
 *   { runes: { "<英語名>": { ja, kind: rune|soulcore|talisman, tier: lesser|normal|greater|perfect|null, level, drop, dds,
 *                           effects: [{ cat, catJa, stats: [{ id, value }], ja, en }] } } }
 * cat は SoulCoreStatCategories.Id (Martial Weapon / Armour / Wand or Staff …)。どの部位に効くかは stage-runes.ts の CAT_TO_CLASSES。
 * 「一度ソケットすると取り外せないが、他のオーグメントで置き換えられる」はクライアントの ClientStrings (ItemDescriptionSoulCore)。
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeCsd, parseStatDescriptions, renderDescriptor } from "./parse-stat-descriptions.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CUR = resolve(ROOT, "data-cache/client-export-currency/tables");
const ART = resolve(ROOT, "data-cache/client-export-art/tables/English");
const CSD = resolve(ROOT, "data-cache/client-export/files/Data@StatDescriptions@stat_descriptions.csd");
const OUT = resolve(ROOT, "src/services/craft-stage/stage-runes.json");

const rows = (j) => (Array.isArray(j) ? j : j.rows || Object.values(j));
const load = async (p) => rows(JSON.parse(await readFile(p, "utf8")));
const strip = (s) => String(s ?? "").replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2").replace(/\[([^|\]]+)\]/g, "$1").trim();

const [cores, coreStats, catEn, catJa, stats, bEn, bJa, artB, artV] = await Promise.all([
  load(`${CUR}/English/SoulCores.json`),
  load(`${CUR}/English/SoulCoreStats.json`),
  load(`${CUR}/English/SoulCoreStatCategories.json`),
  load(`${CUR}/Japanese/SoulCoreStatCategories.json`),
  load(`${CUR}/English/Stats.json`),
  load(`${CUR}/English/BaseItemTypes.json`),
  load(`${CUR}/Japanese/BaseItemTypes.json`),
  load(`${ART}/BaseItemTypes.json`),
  load(`${ART}/ItemVisualIdentity.json`),
]);
const baseItems = JSON.parse(await readFile(resolve(ROOT, "data-cache/base_items.json"), "utf8"));
const byId = new Map(Object.entries(baseItems));
const { byStat } = parseStatDescriptions(decodeCsd(await readFile(CSD)));
const ddsByName = new Map(artB.map((b) => [b.Name, artV[b.ItemVisualIdentity]?.DDSFile ?? null]));

const statRows = new Map();
for (const r of coreStats) {
  if (!statRows.has(r.SoulCore)) statRows.set(r.SoulCore, []);
  statRows.get(r.SoulCore).push(r);
}
/** stat の並びを文にする (同じ文に入る stat はまとめて描く) */
function render(ids, vals, lang) {
  const seen = new Set();
  const parts = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const d = byStat.get(id);
    if (!d) { seen.add(id); continue; }
    for (const sid of d.stats) seen.add(sid);
    if (d.noDescription) continue;
    const values = d.stats.map((sid) => { const k = ids.indexOf(sid); const v = k >= 0 ? Number(vals[k]) || 0 : 0; return { min: v, max: v }; });
    const t = renderDescriptor(d, lang, values) ?? (lang === "Japanese" ? renderDescriptor(d, "English", values) : null);
    if (t) parts.push(strip(t));
  }
  return parts;
}

const out = {};
cores.forEach((c, i) => {
  const b = bEn[c.BaseItemType];
  const name = b?.Name;
  if (!name) return;
  const bi = byId.get(b.Id) ?? null;
  const tags = bi?.tags ?? [];
  // 未実装の物 (base_items に無い / リリース前) は出さない
  if (!bi || /DNT|UNUSED/i.test(name)) return;
  const kind = /Rune/.test(b.Id) ? "rune" : /Talisman|Idol/i.test(b.Id) ? "talisman" : "soulcore";
  const tier = tags.find((t) => /^rune_(lesser|greater|perfect)$/.test(t))?.replace("rune_", "") ?? (kind === "rune" ? "normal" : null);
  const effects = [];
  for (const r of statRows.get(i) ?? []) {
    const ids = (r.Stats ?? []).map((k) => stats[k]?.Id).filter(Boolean);
    const vals = r.StatsValues ?? [];
    if (!ids.length) continue;
    const ja = render(ids, vals, "Japanese");
    const en = render(ids, vals, "English");
    if (!ja.length && !en.length) continue;
    const cat = catEn[r.StatCategory];
    effects.push({
      cat: cat?.Id ?? String(r.StatCategory),
      catJa: strip(catJa[r.StatCategory]?.Display) || strip(cat?.Display) || cat?.Id || "",
      stats: ids.map((id, k) => ({ id, value: Number(vals[k]) || 0 })),
      ja: ja.join("、"),
      en: en.join(", "),
    });
  }
  if (!effects.length) return;
  out[name] = {
    ja: bJa[c.BaseItemType]?.Name ?? name,
    kind,
    tier,
    level: Number(c.RequiredLevel) || 0,
    drop: bi.drop_level ?? null,
    dds: ddsByName.get(name) ?? null,
    effects,
  };
});
await writeFile(OUT, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), source: "GGG クライアント SoulCores / SoulCoreStats (stat_descriptions.csd で描画)", runes: out }, null, 1) + "\n");
const n = Object.values(out);
console.log(`[build-stage-runes] ${n.length} 件 (rune ${n.filter((x) => x.kind === "rune").length} / soulcore ${n.filter((x) => x.kind === "soulcore").length} / talisman ${n.filter((x) => x.kind === "talisman").length}) -> ${OUT}`);
