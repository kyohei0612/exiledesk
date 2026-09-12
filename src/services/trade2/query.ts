/**
 * trade2 API の検索クエリ組み立て (純関数、ネットワークなし)
 *
 * craft-discovery-v2.ts から切り出し (2026-09-07)。
 */

import { SecurityStatus, Rarity } from "../../constants/trade2";
import { getModStatIds } from "../../data/mod-translations";
import trade2StatMapping from "../../i18n/trade2-stat-mapping.json";
import type { ModEntry, SlotKey } from "../craft-v2/types";

/**
 * GGG 内部 stat ID → trade2 stat ID 辞書 (例: `base_maximum_life` → `explicit.stat_3299347043`)。
 * `scripts/build-trade2-stat-mapping.mjs` で生成。GGG 内部 ID をそのまま投げると
 * trade2 API は HTTP 400 "Invalid stat provided" を返すため、必ずここを通す。
 */
const TRADE2_STAT_MAPPING = trade2StatMapping as Readonly<Record<string, string>>;

export interface Trade2SearchResponse {
  id?: string;
  total?: number;
  result?: string[];
}

export interface Trade2StatFilter {
  id: string;
  disabled: boolean;
  value?: { min: number };
}

/**
 * SlotKey → trade2 API の type_filters.category.option 値。
 * メイン武器 / オフハンドはベース種別関係なく "weapon" (ユーザーが trade2 上でさらに絞る)。
 */
export function slotToTradeCategory(slot: SlotKey): string {
  switch (slot) {
    case "ring":
      return "accessory.ring";
    case "amulet":
      return "accessory.amulet";
    case "helm":
      return "armour.helmet";
    case "gloves":
      return "armour.gloves";
    case "body":
      return "armour.chest";
    case "boots":
      return "armour.boots";
    case "weapon":
    case "weapon2":
      return "weapon";
  }
}

/**
 * 選択 MOD を trade2 の stat filter に変換する。
 *
 * stat ID の引き方:
 *   1. `mod.rawTemplate` (英語テンプレ `#`) で getModStatIds()
 *   2. 取れなければ `mod.text` (日本語化済表示) で再試
 *   3. GGG 内部 ID → trade2 ID に変換。mapping に無い (trade2 未対応の POE2 stat) も missing 扱い
 *
 * tierMinByMod (rawTemplate → 下限値) があれば、その MOD に紐づく trade2 stat ID 全てに
 * `value: { min }` を適用する。1 GGG ID が複数 trade2 ID にマップされる 33 件では下限が
 * 余計な ID にもかかり得るため、UI 側で「単一プレースホルダ + 単一マップ」の MOD に絞ることを推奨。
 */
export function buildStatFilters(
  selectedMods: ModEntry[],
  tierMinByMod?: Record<string, number>,
): { statFilters: Trade2StatFilter[]; missingMods: string[] } {
  const statFilters: Trade2StatFilter[] = [];
  const seen = new Set<string>();
  const missingMods: string[] = [];

  for (const mod of selectedMods) {
    let internalIds: string[] = [];
    if (mod.rawTemplate) internalIds = getModStatIds(mod.rawTemplate);
    if (internalIds.length === 0 && mod.text) internalIds = getModStatIds(mod.text);
    if (internalIds.length === 0) {
      missingMods.push(mod.text || mod.rawTemplate || "(unknown mod)");
      continue;
    }
    const tradeIds: string[] = [];
    for (const internalId of internalIds) {
      const tradeId = TRADE2_STAT_MAPPING[internalId];
      if (tradeId) tradeIds.push(tradeId);
    }
    if (tradeIds.length === 0) {
      missingMods.push(mod.text || mod.rawTemplate || "(unknown mod)");
      continue;
    }
    const tierMin = tierMinByMod && mod.rawTemplate ? tierMinByMod[mod.rawTemplate] : undefined;
    const hasTierMin = typeof tierMin === "number" && Number.isFinite(tierMin);

    for (const id of tradeIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const filter: Trade2StatFilter = { id, disabled: false };
      if (hasTierMin) filter.value = { min: tierMin as number };
      statFilters.push(filter);
    }
  }
  return { statFilters, missingMods };
}

/**
 * レア装備の検索クエリ。
 *   - rarity: rare 固定、category: slotToTradeCategory(slot)
 *   - status: securable (直近接続 + 短時間オフラインを含む実購入可能 listing)
 *   - stats: 選択 MOD を "and" で連結
 *   - sale_type は送らない (= 即時購入デフォルト。null を送ると Invalid になる)
 */
export function buildRareSearchQuery(slot: SlotKey, statFilters: Trade2StatFilter[]) {
  return {
    query: {
      status: { option: SecurityStatus.Securable },
      stats: [{ type: "and", filters: statFilters }],
      filters: {
        type_filters: {
          filters: {
            rarity: { option: Rarity.Rare },
            category: { option: slotToTradeCategory(slot) },
          },
        },
      },
    },
    sort: { price: "asc" },
  };
}

/** ジェム検索の条件 (ジェムコラプト収支 2026-09-12)。未指定の項目は絞らない。 */
export interface GemQueryOptions {
  /** trade2 の category (gem.activegem / gem.metagem) */
  category: "gem.activegem" | "gem.metagem";
  levelMin?: number;
  levelMax?: number;
  qualityMin?: number;
  qualityMax?: number;
  corrupted?: boolean;
  socketsMin?: number;
}

/**
 * ジェム名完全一致 + レベル / 品質 / コラプト / ソケット数で絞る検索クエリ。
 * 品質は type_filters、レベル・ソケット・コラプトは misc_filters (trade2 の data/filters で確認、2026-09-12)。
 */
export function buildGemQuery(gemEn: string, o: GemQueryOptions) {
  const range = (min?: number, max?: number): Record<string, number> | null => {
    const r: Record<string, number> = {};
    if (min != null) r.min = min;
    if (max != null) r.max = max;
    return Object.keys(r).length ? r : null;
  };
  const typeFilters: Record<string, unknown> = { category: { option: o.category } };
  const quality = range(o.qualityMin, o.qualityMax);
  if (quality) typeFilters.quality = quality;
  const misc: Record<string, unknown> = {};
  const level = range(o.levelMin, o.levelMax);
  if (level) misc.gem_level = level;
  const sockets = range(o.socketsMin, undefined);
  if (sockets) misc.gem_sockets = sockets;
  if (o.corrupted != null) misc.corrupted = { option: o.corrupted ? "true" : "false" };
  return {
    query: {
      status: { option: SecurityStatus.Securable },
      type: { discriminator: null, option: gemEn },
      filters: { type_filters: { filters: typeFilters }, misc_filters: { filters: misc } },
    },
    sort: { price: "asc" },
  };
}

/** ベース名完全一致 (レアリティ指定、未コラプト) の最安。品質超過の賭けの「素のベース」用 (2026-09-12) */
export function buildBaseTypeQuery(baseEn: string, rarity: "normal" | "rare" = "normal") {
  return {
    query: {
      status: { option: SecurityStatus.Securable },
      type: { discriminator: null, option: baseEn },
      filters: {
        type_filters: { filters: { rarity: { option: rarity === "normal" ? Rarity.Normal : Rarity.Rare } } },
        misc_filters: { filters: { corrupted: { option: "false" } } },
      },
    },
    sort: { price: "asc" },
  };
}

/** ユニーク名 + 品質下限 (品質超過の賭けの完成品用) */
export function buildUniqueQualityQuery(nameEn: string, qualityMin: number) {
  return {
    query: {
      status: { option: SecurityStatus.Securable },
      name: { discriminator: null, option: nameEn },
      filters: { type_filters: { filters: { rarity: { option: Rarity.Unique }, quality: { min: qualityMin } } } },
    },
    sort: { price: "asc" },
  };
}

/** ユニーク名で絞り込む検索クエリ */
export function buildUniqueNameQuery(nameEn: string) {
  return {
    query: {
      status: { option: SecurityStatus.Securable },
      name: { discriminator: null, option: nameEn },
      filters: { type_filters: { filters: { rarity: { option: Rarity.Unique } } } },
    },
    sort: { price: "asc" },
  };
}
