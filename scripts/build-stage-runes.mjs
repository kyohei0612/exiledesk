#!/usr/bin/env node
/**
 * build-stage-runes.mjs — クラフトステージのルーン (オーグメント) とソケットの上限の表 (2026-09-29、POE2Tube 要望 ⑰-1)
 *
 *   (cd data-cache/client-export-stage && npx pathofexile-dat)                 … 手元のクライアントから表を書き出す (通信しない)
 *   node scripts/build-stage-runes.mjs [--market market.json]
 *
 * 元 (オーナー 2026-09-29「現行のバージョンでシステム正しいかデータ見ながら」):
 *   - data-cache/client-export-stage/tables/{English,Japanese}/ : SoulCores (RequiredLevel / Limit / IsSocketBound / CanSocketInCorruptedSanctified)、
 *     SoulCoreStats (部位ごとの stat と値)、SoulCoreStatCategories、BaseItemTypes (名前・DropLevel)、Stats
 *   - 文面は stat_descriptions.csd (build-currency-effects-from-client.mjs と同じ描き方)、絵のパスは data-cache/client-export-art
 *   - 今のゲームに有るか: --market (アプリの相場 poe2scout の書き出し [{t, c, p}]) で値段が 0 より大きい物だけ available
 *     (決まり: カレンシーランキングに値段が無い物は使えない。クライアントには Tempered のルーンなど相場に無い物も残っている)
 *   - ソケットの上限: vendor の PoB の Data/Bases/*.lua の socketLimit (ベースごと。胴・両手武器 4 / ほか 3)。
 *     熟練工で付けられるのは socketLimit − 2 (胴・両手 2 / ほか 1)、規格外のベースは +1、コラプトで +1 の読み (stage-runes.ts)
 * 出力: src/services/craft-stage/stage-runes.json { runes: { <英語名>: {…} }, socketLimits: { <ベース名>: n } }
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeCsd, parseStatDescriptions, renderDescriptor } from "./parse-stat-descriptions.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const T = resolve(ROOT, "data-cache/client-export-stage/tables");
const ART = resolve(ROOT, "data-cache/client-export-art/tables/English");
const CSD = resolve(ROOT, "data-cache/client-export/files/Data@StatDescriptions@stat_descriptions.csd");
const OUT = resolve(ROOT, "src/services/craft-stage/stage-runes.json");
const args = process.argv.slice(2);
const marketPath = args[args.indexOf("--market") + 1];

const rows = (j) => (Array.isArray(j) ? j : j.rows || Object.values(j));
const load = (p) => rows(JSON.parse(readFileSync(p, "utf8")));
const strip = (s) => String(s ?? "").replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2").replace(/\[([^|\]]+)\]/g, "$1").trim();

const cores = load(`${T}/English/SoulCores.json`);
const coreStats = load(`${T}/English/SoulCoreStats.json`);
const catEn = load(`${T}/English/SoulCoreStatCategories.json`);
const catJa = load(`${T}/Japanese/SoulCoreStatCategories.json`);
const stats = load(`${T}/English/Stats.json`);
const bEn = load(`${T}/English/BaseItemTypes.json`);
const bJa = load(`${T}/Japanese/BaseItemTypes.json`);
const artB = load(`${ART}/BaseItemTypes.json`);
const artV = load(`${ART}/ItemVisualIdentity.json`);
const { byStat } = parseStatDescriptions(decodeCsd(readFileSync(CSD)));
const ddsByName = new Map(artB.map((b) => [b.Name, artV[b.ItemVisualIdentity]?.DDSFile ?? null]));
const market = marketPath && args.includes("--market") ? new Map(JSON.parse(readFileSync(marketPath, "utf8")).map((x) => [x.t, x.p])) : null;

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
  if (!name || /DNT|UNUSED/i.test(name)) return;
  const kind = /Rune/.test(b.Id) ? "rune" : /Talisman|Idol/i.test(b.Id) ? "talisman" : "soulcore";
  // 段: 「(Lesser|Greater|Perfect) <1 語> Rune」の普通のルーンだけ。古代・Warding・人名の物などは special (棚の「特別なルーン」)
  const std = /^(?:(Lesser|Greater|Perfect) )?[A-Za-z]+ Rune$/.exec(name);
  const tier = kind === "rune" ? (std ? (std[1]?.toLowerCase() ?? "normal") : "special") : null;
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
  const price = market?.get(name);
  out[name] = {
    ja: bJa[c.BaseItemType]?.Name ?? name,
    kind,
    tier,
    level: Number(c.RequiredLevel) || 0,
    drop: Number(b.DropLevel) || null,
    /** 1 つのアイテムにはめられる数 (無ければ制限なし) */
    limit: c.Limit || null,
    /** 外せない (クライアントの IsSocketBound) */
    bound: !!c.IsSocketBound,
    /** コラプト・聖別の後でもはめられる (クライアントの CanSocketInCorruptedSanctified) */
    corruptOk: !!c.CanSocketInCorruptedSanctified,
    /** 今のゲームに有るか (相場に値段がある)。--market が無ければ null (分からない) */
    available: market ? price != null && price > 0 : null,
    dds: ddsByName.get(name) ?? null,
    effects,
  };
});

// ---- ソケットの上限 (PoB の Data/Bases/*.lua の socketLimit) ----
const bases = resolve(ROOT, "vendor/PathOfBuilding-PoE2/src/Data/Bases");
const socketLimits = {};
/** 装備に必要なレベル・能力値 (PoB の req。要求レベルはドロップレベルと同じ値、要望 ⑱-3) */
const reqs = {};
for (const f of readdirSync(bases).filter((x) => x.endsWith(".lua"))) {
  const t = readFileSync(join(bases, f), "utf8");
  for (const m of t.matchAll(/itemBases\["([^"]+)"\] = \{([\s\S]*?)\n\}/g)) {
    const lim = /socketLimit = (\d+)/.exec(m[2]);
    if (lim) socketLimits[m[1]] = Number(lim[1]);
    const req = /req = \{([^}]*)\}/.exec(m[2]);
    const r = req ? Object.fromEntries([...req[1].matchAll(/(level|str|dex|int) = (\d+)/g)].map((x) => [x[1], Number(x[2])])) : {};
    if (Object.keys(r).length) reqs[m[1]] = r;
  }
}

writeFileSync(OUT, JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  source: "GGG クライアント SoulCores / SoulCoreStats (stat_descriptions.csd で描画)、有る無しは相場 (poe2scout) の値段",
  runes: out,
}, null, 1) + "\n");
// PoB のベースのデータ (ソケットの上限と要求)。src/services/craft-stage/stage-bases-pob.json
writeFileSync(resolve(ROOT, "src/services/craft-stage/stage-bases-pob.json"), JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  source: "vendor の PoB の Data/Bases/*.lua (socketLimit と req)",
  socketLimits,
  reqs,
}) + "\n");
const n = Object.values(out);
const avail = n.filter((x) => x.available);
console.log(`[build-stage-runes] ${n.length} 件 (rune ${n.filter((x) => x.kind === "rune").length} / soulcore ${n.filter((x) => x.kind === "soulcore").length} / talisman ${n.filter((x) => x.kind === "talisman").length})、今のゲームに有る ${market ? avail.length : "?"}、ソケットの上限 ${Object.keys(socketLimits).length} ベース -> ${OUT}`);
if (market) console.log("  相場に無いルーン:", n.filter((x) => x.kind === "rune" && !x.available).map((x) => Object.keys(out).find((k) => out[k] === x)).join(", "));
