/**
 * ジェム / ベース / ユニークの検索クエリ (純関数)
 *
 * query.ts から切り出し (2026-09-26)。
 */
import { SecurityStatus, Rarity } from "../../../constants/trade2";

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
  /**
   * `query.status.option`。既定は securable = トレードサイトの「インスタントバイアウト」。
   *
   * サイトのドロップダウンとの対応 (2026-09-17 に確定):
   *   available … インスタントバイアウトおよび対面トレード (サイトの既定)
   *   securable … インスタントバイアウト (即時購入できる出品だけ)
   *   onlineleague / online … 対面トレード
   *   any … 指定なし (オフラインの出品も全部)
   *
   * 売値も捌き速度の追跡も securable (即時購入のみ)。
   * オーナー指示 (2026-09-17):「インスタントバイアウトだけ見ればいい。エニーで見る必要が全くない」。
   */
  status?: string;
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
      status: { option: o.status ?? SecurityStatus.Securable },
      type: { discriminator: null, option: gemEn },
      filters: {
        type_filters: { filters: typeFilters },
        misc_filters: { filters: misc },
      },
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

/** ユニーク名で絞り込む検索クエリ */
export function buildUniqueNameQuery(nameEn: string, opts: { noCorrupted?: boolean; baseType?: string } = {}) {
  return {
    query: {
      status: { option: SecurityStatus.Securable },
      name: { discriminator: null, option: nameEn },
      // baseType: ルーンの熟達品 (Runemastered …) は同じ名前の別物なのでベースも絞る (poe.ninja の行ごと。2026-09-26)
      ...(opts.baseType ? { type: opts.baseType } : {}),
      // noCorrupted: コラプト品は外す (ユニーク装備価格推移で最安がコラプト品になっていた。2026-09-26)
      filters: { type_filters: { filters: { rarity: { option: Rarity.Unique } } }, ...(opts.noCorrupted ? { misc_filters: { filters: { corrupted: { option: "false" } } } } : {}) },
    },
    sort: { price: "asc" },
  };
}
