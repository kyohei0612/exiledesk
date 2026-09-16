/**
 * row-query.ts — 売値表の 3 条件 (レベル 21 / 品質 23% / 完成品) の検索クエリ (2026-09-16)
 *
 * useGemCorrupt (画面の相場取得) と gem-watch-auto (捌き速度の追跡登録) の両方から使う。
 * オーナー指示: 「追跡するのは品質 23% もレベル +1 もだからね、完成版だけじゃない」。
 */
import { buildGemQuery, type GemQueryOptions } from "../../services/trade2/query";
import { SecurityStatus } from "../../constants/trade2";

export type SaleKey = "level21" | "quality23" | "finished";

export const SALE_KEYS: readonly SaleKey[] = ["level21", "quality23", "finished"] as const;

export const SALE_KEY_LABEL: Record<SaleKey, string> = {
  level21: "レベル 21",
  quality23: "品質 23%",
  finished: "完成品",
};

/**
 * 条件ごとの検索オプション。
 *   - レベル 21 / 品質 23% はヴァールオーブ 1 回の産物なので 2 重コラプト品を除く
 *   - 完成品 (21 · 23%) は結晶を通した 2 重コラプト品そのもの
 */
/** コラプト済みは直せないので、買う時は 5 ソケット前提 (オーナー指示 2026-09-16: 常に必須) */
export const REQUIRED_SOCKETS = 5;

export function rowQueryOptions(key: SaleKey, meta: boolean): GemQueryOptions {
  const category = meta ? "gem.metagem" : "gem.activegem";
  const common = { category, corrupted: true, socketsMin: REQUIRED_SOCKETS } as const;
  switch (key) {
    case "level21":
      return { ...common, levelMin: 21, qualityMin: 20, qualityMax: 20, twiceCorrupted: false };
    case "quality23":
      return { ...common, qualityMin: 23, twiceCorrupted: false }; // レベルは問わない
    case "finished":
      return { ...common, levelMin: 21, qualityMin: 23 };
  }
}

/**
 * 捌き速度の追跡に使うクエリ。
 *
 * 画面の売値検索は `securable` (直近接続中 + オフラインが短い出品) だが、追跡では使えない。
 * 出品者がオフラインになるだけで検索から消え、「売れた」と誤判定するため
 * (2026-09-16 実データで中央値 30 分という異常値が出た)。
 * 追跡は `any` にして、本当に取り下げ / 売却された時だけ消えるようにする。
 */
export function rowQuery(gemEn: string, key: SaleKey, meta = false): unknown {
  const q = buildGemQuery(gemEn, rowQueryOptions(key, meta)) as { query: { status: { option: string } } };
  q.query.status = { option: SecurityStatus.Any };
  return q;
}

/** 追跡のキー ("Arc::finished")。銘柄 1 つ = ジェム × 条件 */
export const watchKey = (gemEn: string, key: SaleKey): string => `${gemEn}::${key}`;
