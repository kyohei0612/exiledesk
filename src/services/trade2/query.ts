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
  /** 2 重コラプト (Twice Corrupted)。ジェムコラプトの賭けは 1 回のコラプトで得る品なので false で絞る (オーナー指摘 2026-09-13) */
  twiceCorrupted?: boolean;
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
  if (o.twiceCorrupted != null) misc.twice_corrupted = { option: o.twiceCorrupted ? "true" : "false" };
  return {
    query: {
      status: { option: SecurityStatus.Securable },
      type: { discriminator: null, option: gemEn },
      filters: { type_filters: { filters: typeFilters }, misc_filters: { filters: misc } },
    },
    sort: { price: "asc" },
  };
}

/**
 * ベース名完全一致 (レアリティ指定、未コラプト、ルーンソケット数の下限) の最安。アドニアの賭けの「素のワンド」用 (2026-09-12)。
 * オーナー指示: アドニアの材料は「コラプトなし・ノーマル・2 ソケットの吸収のワンド」。trade2 の装備フィルタ id は rune_sockets。
 */
export function buildBaseTypeQuery(baseEn: string, rarity: "normal" | "rare" = "normal", runeSocketsMin?: number) {
  const equipment: Record<string, unknown> = {};
  if (runeSocketsMin != null) equipment.rune_sockets = { min: runeSocketsMin };
  return {
    query: {
      status: { option: SecurityStatus.Securable },
      type: { discriminator: null, option: baseEn },
      filters: {
        type_filters: { filters: { rarity: { option: rarity === "normal" ? Rarity.Normal : Rarity.Rare } } },
        equipment_filters: { filters: equipment },
        misc_filters: { filters: { corrupted: { option: "false" } } },
      },
    },
    sort: { price: "asc" },
  };
}

/** ユニーク名 + 品質下限 (+ ルーンソケット下限)、未コラプト。アドニアの賭けの完成品用 (オーナー指示: アドニアのエゴ · 品質 30% · ソケット 2) */
export function buildUniqueQualityQuery(nameEn: string, qualityMin: number, runeSocketsMin?: number) {
  const equipment: Record<string, unknown> = {};
  if (runeSocketsMin != null) equipment.rune_sockets = { min: runeSocketsMin };
  return {
    query: {
      status: { option: SecurityStatus.Securable },
      name: { discriminator: null, option: nameEn },
      filters: {
        type_filters: { filters: { rarity: { option: Rarity.Unique }, quality: { min: qualityMin } } },
        equipment_filters: { filters: equipment },
        // 未コラプトに限定 (コラプト品は同じ 30% でも 20 神前後と安く、完成品の相場を下に引っ張る。オーナーの検索と同条件)
        misc_filters: { filters: { corrupted: { option: "false" } } },
      },
    },
    sort: { price: "asc" },
  };
}

/**
 * ユニークのコラプトの賭け (2026-09-13): ユニーク名 + コラプト状態 (+ 2 重コラプト) + ヴァール付加の stat フィルタ。
 * ヴァール付加は trade2 では enchant.stat_* に載る (JP 実測 2026-09-13: 指輪の全耐性付加 477 件が enchant で当たる)。
 */
export interface UniqueCorruptQueryOptions {
  corrupted: boolean;
  twiceCorrupted?: boolean;
  /** 付加の trade2 stat id (enchant.stat_*)。複数なら全部 (and) */
  enchantStats?: string[];
}
export function buildUniqueCorruptQuery(nameEn: string, o: UniqueCorruptQueryOptions) {
  const misc: Record<string, unknown> = { corrupted: { option: o.corrupted ? "true" : "false" } };
  if (o.twiceCorrupted != null) misc.twice_corrupted = { option: o.twiceCorrupted ? "true" : "false" };
  const stats = o.enchantStats && o.enchantStats.length > 0 ? [{ type: "and", filters: o.enchantStats.map((id) => ({ id, disabled: false })) }] : [];
  return {
    query: {
      status: { option: SecurityStatus.Securable },
      name: { discriminator: null, option: nameEn },
      stats,
      filters: {
        type_filters: { filters: { rarity: { option: Rarity.Unique } } },
        misc_filters: { filters: misc },
      },
    },
    sort: { price: "asc" },
  };
}

/**
 * レアクラフト用の「条件で絞る」検索 (2026-09-14、ES 兜のクラフトから)。ベース (ノーマル / マジック) と完成品 (レア) の両方に使う。
 *   category: trade2 の type_filters.category (armour.helmet 等)
 *   rarity: normal / magic / nonunique (レア = ユニーク以外)
 *   ilvlMin / esMin / socketsMin: type_filters.ilvl / equipment_filters.es / equipment_filters.rune_sockets
 *   stats: stat id と下限 (pseudo.* も可)
 */
export interface SpecQueryOptions {
  category: string;
  rarity: "normal" | "magic" | "nonunique";
  ilvlMin?: number;
  esMin?: number;
  /** 防御タイプで絞る (回避 / アーマー) 2026-09-14 */
  evMin?: number;
  arMin?: number;
  socketsMin?: number;
  stats?: { id: string; min: number }[];
}
export function buildSpecQuery(o: SpecQueryOptions) {
  const type: Record<string, unknown> = { category: { option: o.category }, rarity: { option: o.rarity } };
  if (o.ilvlMin != null) type.ilvl = { min: o.ilvlMin };
  const equipment: Record<string, unknown> = {};
  if (o.esMin != null) equipment.es = { min: o.esMin };
  if (o.evMin != null) equipment.ev = { min: o.evMin };
  if (o.arMin != null) equipment.ar = { min: o.arMin };
  if (o.socketsMin != null) equipment.rune_sockets = { min: o.socketsMin };
  const stats = o.stats && o.stats.length > 0 ? [{ type: "and", filters: o.stats.map((s) => ({ id: s.id, disabled: false, value: { min: s.min } })) }] : [];
  return {
    query: {
      status: { option: SecurityStatus.Securable },
      stats,
      filters: {
        type_filters: { filters: type },
        equipment_filters: { filters: equipment },
        misc_filters: { filters: { corrupted: { option: "false" } } },
      },
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
