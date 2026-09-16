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
 * 捌き速度の追跡に使うクエリ。条件は売値の検索と同じだが status だけ違う。
 *
 * 売値は `securable` (インスタントバイアウトのみ = 今すぐ買える値段) で見るのに対し、
 * 追跡は `any` (全部)。securable は時間帯で結果が激しく入れ替わり、
 * 検索から消えただけの出品を「売れた」と誤判定するため
 * (2026-09-17: コメット品質 23% が 40 分で 105 件 → 26 件)。
 */
export function rowQuery(gemEn: string, key: SaleKey, meta = false): unknown {
  return buildGemQuery(gemEn, { ...rowQueryOptions(key, meta), status: SecurityStatus.Any });
}

/** 追跡のキー ("Arc::finished")。銘柄 1 つ = ジェム × 条件 */
export const watchKey = (gemEn: string, key: SaleKey): string => `${gemEn}::${key}`;
