#!/usr/bin/env node
/**
 * build-mod-tier-and-group.mjs
 * ---------------------------------------------------------------
 * 目的:
 *   `src/i18n/mods-bundle.json` から発見V2 Phase ι 用の 2 つの
 *   静的データ表を生成する。
 *
 *   1. **tier 表**: MOD の `stats[0]` の min/max を「同 normalized text_en」
 *      でまとめ、min 降順に並べて T1/T2/... ラベル付け。
 *      UI 側で「T1 の下限値を trade2 query に詰める」ティア管理に使う。
 *
 *   2. **group 表**: MOD の `groups: string[]` (例: `["AddedAttackPhysicalDamage"]`)
 *      を同 normalized text_en に紐付け。UI 側で「同カテゴリ MOD は排他選択」
 *      を実現するための逆引きインデックス。
 *
 * 背景 (オーナー指示 2026-05-22):
 *   「同じカテゴリーは使えないからチェックした時に同じカテゴリー選べないようにしたい」
 *   「コピー値はティアで管理できる？例えば検索するときにティア変更してそのティアの
 *    下限の値をコピーして検索かけたりとか」
 *
 * 正規化規則 (`craft-discovery-v2.ts.normalizeModTemplate` と完全一致):
 *   1. `(min-max)` -> `#`
 *   2. `(num)`     -> `#`
 *   3. 裸数値      -> `#`
 *   4. trim (前後空白除去)
 *   ※ `[Tag|Display]` マーカーは保持 (craft-discovery-v2.ts の rawTemplate と
 *      同じ形式にするため。表示時の整形は UI 側で行う)。
 *
 * 多 stat MOD の取り扱い:
 *   - tier 表は **stats[0]** のみ採用 (簡易策、オーナー指示)。
 *     2 行目以降の stat 行は集計に使わない。
 *   - group 表は entry の `groups: string[]` をそのまま採用 (1 entry = 0..N group)。
 *
 * 衝突解決 (同 normalized text に複数 entry がぶつかる):
 *   - tier: (min, max) ペアで dedupe → 合算後 min 降順で T1/T2/... 番号付け
 *   - group: 全 entry の groups 配列を union → string[] 重複排除
 *
 * 出力: `src/i18n/mod-tier-and-group.json`
 *   {
 *     "tiers": {
 *       "<normalized_text_en>": [
 *         { "tier": 1, "min": 81, "max": 110, "label": "T1: 81-110" },
 *         { "tier": 2, "min": 51, "max": 80,  "label": "T2: 51-80" }
 *       ],
 *       ...
 *     },
 *     "groups": {
 *       "<normalized_text_en>": ["AddedAttackPhysicalDamage", ...]
 *     }
 *   }
 *
 * Usage:
 *   node scripts/build-mod-tier-and-group.mjs
 *
 * @author craft-discovery 君B (Phase ι)
 * @date 2026-05-22
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const BUNDLE_FILE = resolve(ROOT, "src/i18n/mods-bundle.json");
const OUT_FILE = resolve(ROOT, "src/i18n/mod-tier-and-group.json");

function log(...args) {
  console.log("[build-mod-tier-and-group]", ...args);
}

/**
 * craft-discovery-v2.ts の `normalizeModTemplate` と**完全一致**させた正規化。
 * rawTemplate キーとして使うため、ここの定義を変える場合は TS 側も同時に直すこと。
 */
function normalizeModTemplate(text) {
  if (!text || typeof text !== "string") return "";
  let s = text;
  // (min-max) → #
  s = s.replace(/\(-?\d+(?:\.\d+)?-{1}-?\d+(?:\.\d+)?\)/g, "#");
  // (num) → #
  s = s.replace(/\(-?\d+(?:\.\d+)?\)/g, "#");
  // 裸の数値 → #
  s = s.replace(/-?\d+(?:\.\d+)?/g, "#");
  return s.trim();
}

/**
 * 数値 min/max を整形 (整数なら整数表示、それ以外は 1 桁小数)。
 * UI 表示の ModEntry.text と同じ規則。
 */
function fmt(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "?";
  const r = Math.round(v * 10) / 10;
  if (Number.isInteger(r)) return r.toFixed(0);
  return r.toFixed(1);
}

async function main() {
  const bundle = JSON.parse(await readFile(BUNDLE_FILE, "utf8"));

  // ━━ 1. normalized text → tier 候補 ━━
  // key   : normalized text_en (rawTemplate)
  // value : Array<{ min, max }> (重複未排除、後で (min,max) で dedupe)
  /** @type {Map<string, Array<{ min: number, max: number }>>} */
  const tierCandidates = new Map();

  // ━━ 1.5. normalized text → groups Set ━━
  /** @type {Map<string, Set<string>>} */
  const groupCandidates = new Map();

  let entriesWithText = 0;
  let entriesWithStats = 0;
  let entriesWithGroups = 0;
  let entriesWithBoth = 0;

  for (const key in bundle) {
    const e = bundle[key];
    if (!e || typeof e !== "object") continue;
    if (typeof e.text_en !== "string" || !e.text_en) continue;
    entriesWithText++;
    const tpl = normalizeModTemplate(e.text_en);
    if (!tpl) continue;

    // Data-H3: Atlas/Map/Fishing/Jewel-radius mod は装備プールに混入させない。
    // bundle の groups[] が "Map" / "Essence" / "Fishing" / "IrridiatedMaps" /
    // "JewelRadius" / "JewelRing" 等で始まるものは装備 prefix/suffix では
    // 生成されない (= ティアドロップダウン / 排他選択 UI に出してはならない)。
    // 安全策として「テンプレに `#` が一切無い」ことも条件に含めることで、
    // `Allocates [ClusterNode|...]` のような `#` 無し装備 mod を巻き込まない。
    const hasNoHashPlaceholder = !tpl.includes("#");
    const groupsList = Array.isArray(e.groups) ? e.groups : [];
    const isAtlasGroup = groupsList.some((g) =>
      typeof g === "string" &&
      /^(Map|Essence|Fishing|IrridiatedMaps|JewelRadius|JewelRing)/i.test(g),
    );
    if (hasNoHashPlaceholder && isAtlasGroup) continue;

    // tier: stats[0] のみ採用 (簡易策)
    const stat0 = Array.isArray(e.stats) ? e.stats[0] : null;
    if (
      stat0 &&
      typeof stat0.min === "number" &&
      typeof stat0.max === "number" &&
      Number.isFinite(stat0.min) &&
      Number.isFinite(stat0.max)
    ) {
      entriesWithStats++;
      let arr = tierCandidates.get(tpl);
      if (!arr) {
        arr = [];
        tierCandidates.set(tpl, arr);
      }
      arr.push({ min: stat0.min, max: stat0.max });
    }

    // group: groups[] をそのまま union
    if (Array.isArray(e.groups) && e.groups.length > 0) {
      entriesWithGroups++;
      let s = groupCandidates.get(tpl);
      if (!s) {
        s = new Set();
        groupCandidates.set(tpl, s);
      }
      for (const g of e.groups) {
        if (typeof g === "string" && g.length > 0) s.add(g);
      }
    }

    if (
      stat0 &&
      typeof stat0.min === "number" &&
      Array.isArray(e.groups) &&
      e.groups.length > 0
    ) {
      entriesWithBoth++;
    }
  }

  // ━━ 2. tier 候補を (min,max) で dedupe、min 降順で T1/T2/... ━━
  /** @type {Record<string, Array<{ tier: number, min: number, max: number, label: string }>>} */
  const tiers = {};
  let totalTierRows = 0;
  let multiTierCount = 0;
  for (const [tpl, arr] of tierCandidates) {
    // (min,max) で dedupe (同 stat に同一範囲が複数 entry にいる場合の合体)
    const seen = new Map();
    for (const t of arr) {
      const k = `${t.min}::${t.max}`;
      if (!seen.has(k)) seen.set(k, t);
    }
    const uniq = [...seen.values()];
    // Data-H2: max 降順を主軸、tie-break で min 降順。
    // 旧実装は min 降順 のみで、min は小さいが max が大きい広レンジ tier が
    // 下位に押し込まれ、T1 が必ずしも最強帯にならない (84 件で順序崩壊) 問題があった。
    // POE の慣習通り「T1 = 最大値帯」が成立するよう max 優先に変更。
    uniq.sort((a, b) => b.max - a.max || b.min - a.min);
    const list = uniq.map((t, i) => ({
      tier: i + 1,
      min: t.min,
      max: t.max,
      label: `T${i + 1}: ${fmt(t.min)}-${fmt(t.max)}`,
    }));
    tiers[tpl] = list;
    totalTierRows += list.length;
    if (list.length > 1) multiTierCount++;
  }

  // ━━ 3. group 候補を Array に変換 ━━
  /** @type {Record<string, string[]>} */
  const groups = {};
  for (const [tpl, s] of groupCandidates) {
    groups[tpl] = [...s].sort();
  }

  // ━━ 4. 書き出し ━━
  // キーをアルファベット順にして diff を見やすく
  const sortedTiers = {};
  for (const k of Object.keys(tiers).sort()) sortedTiers[k] = tiers[k];
  const sortedGroups = {};
  for (const k of Object.keys(groups).sort()) sortedGroups[k] = groups[k];

  const out = { tiers: sortedTiers, groups: sortedGroups };
  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(out, null, 2) + "\n");

  // ━━ 5. レポート ━━
  log("─".repeat(60));
  log(`OUTPUT: ${OUT_FILE}`);
  log(`bundle entries (text_en あり): ${entriesWithText}`);
  log(`bundle entries (stats[0] あり): ${entriesWithStats}`);
  log(`bundle entries (groups[] あり): ${entriesWithGroups}`);
  log(`bundle entries (両方あり)     : ${entriesWithBoth}`);
  log(`tier 表 normalized text 数   : ${Object.keys(sortedTiers).length}`);
  log(`tier 表 行総数 (T1+T2+...)    : ${totalTierRows}`);
  log(`tier 表 multi-tier (>=2) 数   : ${multiTierCount}`);
  log(`group 表 normalized text 数  : ${Object.keys(sortedGroups).length}`);
  log("");
  log("sample tier 表 (multi-tier, 先頭 3 件):");
  let printed = 0;
  for (const tpl of Object.keys(sortedTiers)) {
    const t = sortedTiers[tpl];
    if (t.length < 2) continue;
    if (printed++ >= 3) break;
    log(`  ${tpl}`);
    for (const row of t.slice(0, 4)) {
      log(`    ${row.label}`);
    }
    if (t.length > 4) log(`    ... 他 ${t.length - 4} tier`);
  }
  log("");
  log("sample group 表 (先頭 5 件):");
  let printedG = 0;
  for (const tpl of Object.keys(sortedGroups)) {
    if (printedG++ >= 5) break;
    log(`  ${tpl}  => [${sortedGroups[tpl].join(", ")}]`);
  }
}

main().catch((e) => {
  console.error("[build-mod-tier-and-group] FAILED:", e);
  process.exit(1);
});
