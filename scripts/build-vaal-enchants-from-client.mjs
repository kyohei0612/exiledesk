#!/usr/bin/env node
/**
 * build-vaal-enchants-from-client.mjs
 * --------------------------------------------------------------
 * 「ユニークのコラプトの賭け」(ヴァールの天秤) 用に、ヴァールオーブで付く
 * コラプト付加 (Vaal enchantment = Mods.GenerationType "corrupted") のプールを
 * ユニークごとに作る (2026-09-13)。
 *
 *   in : data-cache/mods.en.json                       … クライアントの Mods (build-mods-from-client.mjs)
 *        src/i18n/mods-bundle.json                     … 同 MOD の EN / JA 文言
 *        data-cache/base_items.json                    … RePoE 形式のベース一覧 (継承タグ ring / weapon 等の元)
 *        data-cache/client-export/tables/English/{BaseItemTypes,Tags,ItemClasses}.json
 *                                                      … 最新ベースのクラスと属性タグ (str_armour 等)
 *        data-cache/trade2-items.json                  … trade2 data/items (ユニーク名 → ベース種別)
 *        src/i18n/trade2-stat-mapping.json             … GGG stat id → trade2 stat id
 *        src/i18n/unique-names-ja.json                 … ユニークの日本語名
 *   out: src/i18n/vaal-enchants.json
 *
 * 仕組み: 付加 MOD の spawn_weights は「タグ → 0/1」だけ (重みは無い)。ベースのタグは
 *   継承タグ (クラスで決まる: ring, armour, one_hand_weapon …) + ベース固有タグ (str_armour, karui_basetype …)
 * の和なので、クラスごとの継承タグは base_items.json の同クラス全ベースの共通部分として求め、
 * ベース固有タグは最新の BaseItemTypes.Tags から取る (0.5 の Runemastered ベースは base_items.json に無い)。
 * ジュエル用の付加 (domain "misc") はジュエルにだけ付く。
 *
 * Usage: node scripts/build-vaal-enchants-from-client.mjs
 * --------------------------------------------------------------
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const rd = async (p) => JSON.parse(await readFile(resolve(ROOT, p), "utf8"));
const rows = (j) => (Array.isArray(j) ? j : j.rows || Object.values(j));

const modsEn = await rd("data-cache/mods.en.json");
const bundle = await rd("src/i18n/mods-bundle.json");
const baseItems = await rd("data-cache/base_items.json");
const bit = rows(await rd("data-cache/client-export/tables/English/BaseItemTypes.json"));
const tagRows = rows(await rd("data-cache/client-export/tables/English/Tags.json"));
const clsRows = rows(await rd("data-cache/client-export/tables/English/ItemClasses.json"));
const t2items = await rd("data-cache/trade2-items.json");
const statMap = await rd("src/i18n/trade2-stat-mapping.json");
const uniqueJa = await rd("src/i18n/unique-names-ja.json");

// [Token|表示] → 表示 (mod-translations.ts と同じ規則)
const strip = (s) => String(s ?? "").replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2").replace(/\[([^|\]]+)\]/g, "$1");

// ---- 1. 付加 MOD (domain item = 装備、misc = ジュエル) ----
const mods = {};
for (const [id, m] of Object.entries(modsEn)) {
  if (m.generation_type !== "corrupted" || !(m.domain === "item" || m.domain === "misc")) continue;
  const b = bundle[id] ?? {};
  const trade = [];
  for (const s of m.stats) {
    const t = statMap[s.id];
    if (t) trade.push(t.replace(/^explicit\./, "enchant."));
  }
  mods[id] = {
    domain: m.domain === "misc" ? "jewel" : "item",
    group: m.groups?.[0] ?? id,
    en: strip(b.text_en ?? id),
    ja: strip(b.text_ja ?? b.text_en ?? id),
    stats: m.stats.map((s) => ({ id: s.id, min: s.min, max: s.max })),
    /** trade2 の stat フィルタ id (ヴァール付加は enchant.* に載る、2026-09-13 JP 実測) */
    trade,
    spawn: m.spawn_weights.filter((w) => w.weight > 0).map((w) => w.tag),
  };
}

// ---- 2. クラスごとの継承タグ (base_items.json の共通部分) ----
const byCls = new Map();
for (const v of Object.values(baseItems)) {
  if (!v.tags?.length || !v.item_class) continue;
  const set = new Set(v.tags);
  const cur = byCls.get(v.item_class);
  byCls.set(v.item_class, cur ? new Set([...cur].filter((t) => set.has(t))) : set);
}
const classTags = Object.fromEntries([...byCls].map(([c, s]) => [c, [...s].filter((t) => t !== "default").sort()]));

// ---- 3. 最新ベース: クラス + 固有タグ ----
const tagId = tagRows.map((t) => t.Id);
const clsId = clsRows.map((c) => c.Id);
const bases = new Map();
for (const x of bit) {
  if (!x.Name || bases.has(x.Name)) continue;
  bases.set(x.Name, { cls: clsId[x.ItemClass], tags: (x.Tags ?? []).map((i) => tagId[i]) });
}

// ---- 4. 4 つ目の結果 (ソケット / 品質 / 何もなし) をクラスで決める (Maxroll 0.4 資料) ----
//   ソケット +1: 兜 / 手袋 / 靴 / 鎧 / 盾 / フォーカス / 近接・遠隔武器  /  品質 (最大 23%): ワンド / 杖
//   装飾品 (指輪 / アミュレット / ベルト) は「何もなし」。矢筒 / 王笏 / タリスマン は資料に無い → 何もなし扱い (要確認)
const SOCKET = new Set(["Body Armour", "Helmet", "Gloves", "Boots", "Shield", "Buckler", "Focus", "Bow", "Crossbow", "Spear", "Dagger", "One Hand Mace", "Two Hand Mace", "One Hand Sword", "Two Hand Sword", "One Hand Axe", "Two Hand Axe", "Warstaff", "Flail"]);
const QUALITY = new Set(["Wand", "Staff"]);
const fourthOf = (cls) => (SOCKET.has(cls) ? "socket" : QUALITY.has(cls) ? "quality" : "none");

// ---- 5. ユニーク → プール ----
const GROUPS = new Set(["accessory", "armour", "weapon", "jewel"]);
const uniques = {};
const skipped = [];
for (const g of t2items.result ?? t2items) {
  if (!GROUPS.has(g.id)) continue;
  for (const e of g.entries) {
    if (!e.flags?.unique || !e.name) continue;
    const base = bases.get(e.type);
    if (!base) {
      skipped.push(`${e.name} (${e.type}: ベース不明)`);
      continue;
    }
    const inherited = classTags[base.cls] ?? [];
    const tags = new Set([...inherited, ...base.tags]);
    const isJewel = base.cls === "Jewel";
    const pool = Object.entries(mods)
      .filter(([, m]) => (isJewel ? m.domain === "jewel" : m.domain === "item" && m.spawn.some((t) => tags.has(t))))
      .map(([id]) => id)
      .sort();
    if (pool.length === 0) skipped.push(`${e.name} (${e.type}: プール 0)`);
    uniques[e.name] = { ja: uniqueJa[e.name] ?? e.name, base: e.type, cls: base.cls, group: g.id, fourth: fourthOf(base.cls), pool };
  }
}

const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  note: "ヴァールオーブのコラプト付加プール (クライアント Mods.GenerationType=corrupted、spawn_weights は 0/1 のみ = 一様と仮定)",
  mods,
  uniques,
};
await writeFile(resolve(ROOT, "src/i18n/vaal-enchants.json"), JSON.stringify(out, null, 0) + "\n", "utf8");

const poolSizes = {};
for (const u of Object.values(uniques)) poolSizes[u.cls] = u.pool.length;
console.log(`[build-vaal-enchants] mods ${Object.keys(mods).length} / uniques ${Object.keys(uniques).length} / skipped ${skipped.length}`);
console.log("pool sizes:", JSON.stringify(poolSizes));
if (skipped.length) console.log("skipped:", skipped.join("; "));
const noTrade = Object.entries(mods).filter(([, m]) => m.trade.length === 0).map(([id]) => id);
if (noTrade.length) console.log("no trade2 stat id (価格は取れない、プール数には含む):", noTrade.join(", "));
