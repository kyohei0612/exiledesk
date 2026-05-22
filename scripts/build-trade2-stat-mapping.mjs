#!/usr/bin/env node
/**
 * build-trade2-stat-mapping.mjs
 * --------------------------------------------------------------
 * 目的:
 *   `src/i18n/mods-bundle.json` の各 entry が持つ「GGG 内部 stat ID」
 *   (例: `maximum_mana_+%`, `base_maximum_life`) を、POE2 公式 trade2 API の
 *   「trade2 stat ID」(例: `explicit.stat_4220027924`) に対応付ける mapping を
 *   生成する。
 *
 * 背景:
 *   発見V2 で「選択 MOD で trade2 を開く」機能を実装したところ、
 *   `craft-discovery-v2.ts.openTrade2ForSelectedMods` が
 *   `getModStatIds(text)` で取った GGG 内部 ID をそのまま `query.stats` に
 *   詰めて POST していたため、trade2 API が「Invalid stat provided:
 *   maximum_mana_+%」HTTP 400 を返していた (trade2 は専用の `explicit.stat_*`
 *   ID 体系を使う)。
 *
 *   このスクリプトで突合済の辞書を生成しておき、フロントは GGG 内部 ID →
 *   trade2 ID の単純な変換を行う構成にする。
 *
 * 突合ロジック:
 *   1. mods-bundle.json の各 entry を `text_en` で normalize した key で集約
 *      (key: 正規化テキスト, value: stats[].id の Set)
 *   2. trade2 stats data を `text` で normalize した key で集約
 *      (key: 正規化テキスト, value: { tradeId, type })
 *   3. 同じ normalize key を持つ pair について「GGG 内部 ID → trade2 ID」
 *      のマッピングを作る (同一テキストに複数 trade2 ID がぶつかる時は
 *      explicit > pseudo > fractured > その他 の優先順)
 *
 * 正規化規則 (両側を identical な形に潰す):
 *   - `[Tag|Display]` -> `Display`
 *   - `[Tag]`         -> `Tag`   (単一括弧装飾を除去)
 *   - `(min-max)` / `(num)` / 裸数値 -> `#`
 *   - `+#` / `+#%`    -> `#` / `#%`  (trade2 が `+` を落とす entry が大半)
 *   - 連続空白を 1 つに、前後 trim
 *
 * 出力:
 *   - `src/i18n/trade2-stat-mapping.json`
 *     { "<ggg_internal_id>": "explicit.stat_xxxxxx", ... }
 *     キーは GGG 内部 ID 文字列 1 個、値は trade2 ID 1 個 (1:1)。
 *
 * Usage:
 *   node scripts/build-trade2-stat-mapping.mjs
 *   node scripts/build-trade2-stat-mapping.mjs --offline   # data-cache の trade2-stats.json を使う
 *
 * @author engineering 君 + craft-discovery 君B (Phase γ)
 * @date 2026-05-22
 */

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CACHE_DIR = resolve(ROOT, "data-cache");
const CACHE_FILE = resolve(CACHE_DIR, "trade2-stats.json");
const BUNDLE_FILE = resolve(ROOT, "src/i18n/mods-bundle.json");
const OUT_FILE = resolve(ROOT, "src/i18n/trade2-stat-mapping.json");

const TRADE2_STATS_URL = "https://www.pathofexile.com/api/trade2/data/stats";
const USER_AGENT =
  "ExileDesk/0.1 (POE2 personal economy dashboard, Tauri app)";

const ARGS = new Set(process.argv.slice(2));
const OFFLINE = ARGS.has("--offline");

function log(...args) {
  console.log("[build-trade2-stat-mapping]", ...args);
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * trade2 stats JSON を取得 (cache 経由)。
 * `--offline` 指定時 or fetch 失敗時は cache を使い、cache も無ければエラー。
 */
async function loadTrade2Stats() {
  if (OFFLINE) {
    if (!(await exists(CACHE_FILE))) {
      throw new Error(
        `--offline 指定されたが ${CACHE_FILE} が存在しません。一度 online 実行してください。`,
      );
    }
    log(`offline mode: using ${CACHE_FILE}`);
    return JSON.parse(await readFile(CACHE_FILE, "utf8"));
  }

  log(`fetching ${TRADE2_STATS_URL}`);
  let res;
  try {
    res = await fetch(TRADE2_STATS_URL, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
    });
  } catch (e) {
    log(`fetch failed: ${e.message}, falling back to cache`);
    if (await exists(CACHE_FILE)) {
      return JSON.parse(await readFile(CACHE_FILE, "utf8"));
    }
    throw e;
  }
  if (!res.ok) {
    log(`HTTP ${res.status}, falling back to cache`);
    if (await exists(CACHE_FILE)) {
      return JSON.parse(await readFile(CACHE_FILE, "utf8"));
    }
    throw new Error(`Failed to fetch ${TRADE2_STATS_URL}: HTTP ${res.status}`);
  }
  const json = await res.json();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(json, null, 2));
  log(`cached to ${CACHE_FILE}`);
  return json;
}

/**
 * mods-bundle.json と trade2 stats data を identical な形に揃えるための正規化。
 *
 * 規則:
 *   1. `[Tag|Display]` -> `Display`
 *   2. `[Tag]`         -> `Tag`         (単一括弧の装飾)
 *   3. `(min-max)`     -> `#`           (bundle のレンジ)
 *   4. `(num)`         -> `#`           (bundle の単一括弧数値)
 *   5. 裸数値          -> `#`           (実値置換のフォールバック)
 *   6. `+#` -> `#`, `+#%` -> `#%`       (trade2 が leading `+` を落とす)
 *   7. 連続空白を 1 つに、改行は空白扱い、trim
 */
function normalizeStatText(text) {
  if (!text || typeof text !== "string") return "";
  let s = text;
  // 1. [Tag|Display] -> Display
  s = s.replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2");
  // 2. [Tag] -> Tag (装飾)
  s = s.replace(/\[([^|\]]+)\]/g, "$1");
  // 3. (min-max) -> #
  s = s.replace(/\(-?\d+(?:\.\d+)?-{1}-?\d+(?:\.\d+)?\)/g, "#");
  // 4. (num) -> #
  s = s.replace(/\(-?\d+(?:\.\d+)?\)/g, "#");
  // 5. 裸数値 -> #
  s = s.replace(/-?\d+(?:\.\d+)?/g, "#");
  // 6. +# -> #, +#% -> #%  (trade2 が `+` を落とすため両側統一)
  //    "+#" を全部 "#" に潰す (符号情報は失われるが、stat ID 突合用なので OK)
  s = s.replace(/\+#/g, "#");
  // 7. 改行を空白に、連続空白を 1 つに
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * trade2 ID 衝突時の優先順位 (低数値ほど優先)。
 * type は trade2 stats data の `type` フィールド (group.id と一致)。
 */
const TYPE_PRIORITY = {
  explicit: 0,
  desecrated: 1,
  fractured: 2,
  implicit: 3,
  enchant: 4,
  rune: 5,
  sanctum: 6,
  pseudo: 7,
  skill: 8,
};

function priorityOf(type) {
  return TYPE_PRIORITY[type] ?? 99;
}

async function main() {
  // ━━ 1. データ読み込み ━━
  const bundle = JSON.parse(await readFile(BUNDLE_FILE, "utf8"));
  const trade2 = await loadTrade2Stats();
  if (!trade2 || !Array.isArray(trade2.result)) {
    throw new Error("trade2 stats JSON の形式が想定外: result 配列が無い");
  }

  // ━━ 2. trade2 stats を normalized text で索引化 ━━
  // key = normalize(entry.text), value = { tradeId, type } を type 優先順で 1 つ採用
  const trade2ByText = new Map();
  let trade2TotalEntries = 0;
  for (const group of trade2.result) {
    if (!Array.isArray(group.entries)) continue;
    for (const e of group.entries) {
      trade2TotalEntries++;
      if (!e || typeof e.id !== "string" || typeof e.text !== "string") continue;
      const norm = normalizeStatText(e.text);
      if (!norm) continue;
      const existing = trade2ByText.get(norm);
      if (!existing || priorityOf(e.type) < priorityOf(existing.type)) {
        trade2ByText.set(norm, { tradeId: e.id, type: e.type });
      }
    }
  }
  log(
    `trade2 entries: total=${trade2TotalEntries}, unique-by-norm=${trade2ByText.size}`,
  );

  // ━━ 3. bundle entry を 1 stat = 1 行で展開、normalized line text で索引化 ━━
  //
  // 設計判断:
  //   bundle の text_en は複数 stat を `\n` で結合して 1 entry にしている
  //   (例: `(110-154)% increased Physical Damage\n15% reduced Attack Speed`)
  //   一方 trade2 stat data は **1 stat = 1 entry** で text を持つので、行単位
  //   で突合する。stats[] 配列の順序と text_en 行の順序が一致している前提
  //   (mods-bundle 生成スクリプトでそうなっている)。
  //
  //   1 行 = 1 stat ID。行数 != stat 数の entry はスキップ (例: `\n` を持たない
  //   多 stat や、空白だけの整形差) して全行マッチ (line, statId) を集める。
  //   結果は (normalized line text -> Set<internalId>) の Map。
  //
  //   解決率分母 = bundle stats[].id distinct (676 件)。
  const bundleByText = new Map();
  const allInternalIds = new Set();
  let bundleEntriesWithStats = 0;
  let bundleLineMismatchSkipped = 0; // 行数 != stats数で skip した entry 数

  for (const key in bundle) {
    const e = bundle[key];
    if (!e || typeof e !== "object") continue;
    if (!Array.isArray(e.stats) || e.stats.length === 0) continue;
    if (typeof e.text_en !== "string" || !e.text_en) continue;
    bundleEntriesWithStats++;

    for (const s of e.stats) {
      if (s && typeof s.id === "string" && s.id.length > 0) {
        allInternalIds.add(s.id);
      }
    }

    // 1 行 = 1 stat ID で対応付ける
    const lines = e.text_en.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    const stats = e.stats.filter((s) => s && typeof s.id === "string" && s.id.length > 0);

    if (lines.length === stats.length && lines.length > 0) {
      // 行数とstat数が一致: 順序通り 1:1 で割り当て
      for (let i = 0; i < lines.length; i++) {
        const norm = normalizeStatText(lines[i]);
        if (!norm) continue;
        let bucket = bundleByText.get(norm);
        if (!bucket) {
          bucket = new Set();
          bundleByText.set(norm, bucket);
        }
        bucket.add(stats[i].id);
      }
    } else {
      // 行数と stats 数が不一致: 全文 normalize の旧挙動でフォールバック
      // (全 stat ID が同じ正規化テキストに紐づく; 衝突は内部で許容)
      bundleLineMismatchSkipped++;
      const norm = normalizeStatText(e.text_en);
      if (norm) {
        let bucket = bundleByText.get(norm);
        if (!bucket) {
          bucket = new Set();
          bundleByText.set(norm, bucket);
        }
        for (const s of stats) bucket.add(s.id);
      }
    }
  }
  log(
    `bundle entries with stats: ${bundleEntriesWithStats}, normalized-line count: ${bundleByText.size}, distinct GGG internal IDs: ${allInternalIds.size}, line-count mismatch fallback: ${bundleLineMismatchSkipped}`,
  );

  // ━━ 4. マッチング: bundle normLine → trade2 normText 同一 key ━━
  /** @type {Record<string, string>} GGG internal ID -> trade2 ID */
  const mapping = {};
  let matchedTexts = 0;
  let unmatchedTexts = 0;
  const unmatchedSamples = [];
  const idCollisions = new Map(); // internal_id -> Set<trade2_id> (1:N 衝突検知)

  /**
   * 「reduced X」「increased X」反転マッチを試みる。
   * trade2 stat data は同一 stat の負方向 mod に対しても正方向の text しか
   * 持たないことが多い (例: bundle `#% reduced Slowing Potency...` ↔
   * trade2 `#% increased Slowing Potency...` は同 stat_id を共有)。
   *
   * - "reduced" を "increased" に置換した normalize text で trade2 を引く
   * - "increased" を "reduced" に置換した normalize text で trade2 を引く
   *   どちらかでヒットすれば採用
   */
  function tryInvertedMatch(norm) {
    if (/\breduced\b/.test(norm)) {
      const alt = norm.replace(/\breduced\b/g, "increased");
      const hit = trade2ByText.get(alt);
      if (hit) return hit;
    }
    if (/\bincreased\b/.test(norm)) {
      const alt = norm.replace(/\bincreased\b/g, "reduced");
      const hit = trade2ByText.get(alt);
      if (hit) return hit;
    }
    return null;
  }

  let invertedMatched = 0;
  for (const [norm, internalIdSet] of bundleByText) {
    let hit = trade2ByText.get(norm);
    if (!hit) {
      hit = tryInvertedMatch(norm);
      if (hit) invertedMatched++;
    }
    if (!hit) {
      unmatchedTexts++;
      if (unmatchedSamples.length < 12) unmatchedSamples.push(norm);
      continue;
    }
    matchedTexts++;
    for (const internalId of internalIdSet) {
      if (mapping[internalId] && mapping[internalId] !== hit.tradeId) {
        // 同一 internal ID が複数 trade2 ID に紐付くケース (理屈上ありうる)
        // 既存マッピングを優先 (先勝ち) し、衝突として記録
        let set = idCollisions.get(internalId);
        if (!set) {
          set = new Set([mapping[internalId]]);
          idCollisions.set(internalId, set);
        }
        set.add(hit.tradeId);
        continue;
      }
      mapping[internalId] = hit.tradeId;
    }
  }
  log(`inverted (reduced<->increased) extra matches: ${invertedMatched}`);

  const resolvedIdCount = Object.keys(mapping).length;
  const resolveRate =
    allInternalIds.size > 0
      ? (resolvedIdCount / allInternalIds.size) * 100
      : 0;

  // 未解決 internal ID のサンプル
  const unresolvedInternalIds = [];
  for (const id of allInternalIds) {
    if (!mapping[id]) unresolvedInternalIds.push(id);
  }
  unresolvedInternalIds.sort();

  // ━━ 5. 書き出し ━━
  // キーをアルファベット順にして diff を見やすく
  const sortedMapping = {};
  for (const k of Object.keys(mapping).sort()) sortedMapping[k] = mapping[k];

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(sortedMapping, null, 2) + "\n");

  // ━━ 6. レポート ━━
  log("─".repeat(60));
  log(`OUTPUT: ${OUT_FILE}`);
  log(`mapping 件数         : ${resolvedIdCount}`);
  log(`bundle 内部 ID 総数  : ${allInternalIds.size}`);
  log(`解決率               : ${resolveRate.toFixed(2)}%`);
  log(
    `bundle 正規化テキスト: ${bundleByText.size} (matched ${matchedTexts}, unmatched ${unmatchedTexts})`,
  );
  log(`trade2 正規化テキスト: ${trade2ByText.size}`);
  if (idCollisions.size > 0) {
    log(
      `※ internal ID が複数 trade2 ID に紐付くケース: ${idCollisions.size} 件 (先勝ち採用)`,
    );
    let n = 0;
    for (const [id, set] of idCollisions) {
      if (n++ >= 5) break;
      log(`  - ${id}: ${[...set].join(", ")}`);
    }
  }
  if (unmatchedSamples.length > 0) {
    log(`unmatched bundle text 例:`);
    for (const s of unmatchedSamples) log(`  - ${s}`);
  }
  if (unresolvedInternalIds.length > 0) {
    log(`unresolved internal ID 例 (先頭 12):`);
    for (const id of unresolvedInternalIds.slice(0, 12)) log(`  - ${id}`);
  }
}

main().catch((e) => {
  console.error("[build-trade2-stat-mapping] FAILED:", e);
  process.exit(1);
});
