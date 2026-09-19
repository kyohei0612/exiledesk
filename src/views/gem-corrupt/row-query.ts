/**
 * row-query.ts — 売値表の 3 条件 (レベル 21 / 品質 23% / 完成品) の検索クエリ (2026-09-16)
 *
 * useGemCorrupt (画面の相場取得) と gem-watch-auto (捌き速度の追跡登録) の両方から使う。
 * オーナー指示: 「追跡するのは品質 23% もレベル +1 もだからね、完成版だけじゃない」。
 */
import { buildGemQuery, type GemQueryOptions } from "../../services/trade2/query";

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
 *   - 完成品 (21 · 23%) は結晶を通した 2 重コラプト品そのもの。
 *     2026-09-19 オーナー「完成は同じく、ダブルコラプトあり・21 レベル・23% 品質の奴だよ」
 *     → 「絞らない」ではなく twice_corrupted = true で絞る (1 回コラプトで両方当たった品が混ざらない)
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
      return { ...common, levelMin: 21, qualityMin: 23, twiceCorrupted: true };
  }
}

/**
 * 捌き速度の追跡に使うクエリ。売値の検索と完全に同じ (status も securable)。
 *
 * オーナー指示 (2026-09-17):「インスタントバイアウトだけ見ればいい。
 * その中でルールを決めるからエニーで見る必要が全くない」。
 * 画面と同じ母集団を追うので、手動の「再取得」も自動巡回と同じルールで判定できる。
 *
 * 消えた判定は search の ID 一覧だけで行う (ID を直接 fetch する裏取りはキャッシュを返すので使えない。
 * 2026-09-17 実測。詳細は market_flow.rs の冒頭)。
 */
export function rowQuery(gemEn: string, key: SaleKey, meta = false): unknown {
  return buildGemQuery(gemEn, rowQueryOptions(key, meta));
}

/**
 * 元のスキルを見るためのクエリ (コラプトしていない素の出品)。
 *
 * オーナー指示 2026-09-19:「検索の仕方はジェム名 + コラプト無し、二重コラプト無しだね」
 * 「これだけはしっかり元のスキルを見ないといけない」。原石の種類 (スキル / スピリット) は
 * 出品の properties に「リザーブ … Spirit」が出るかで決まるので、素の品を 1 件見る。
 * 結果はジェムごとに覚えるので、1 ジェムにつき一度きり (state/gem-spirit.ts)。
 * ソケット数は問わない (5 ソケ無しの方が安い出品がある。オーナー 2026-09-19)。
 *
 * 原石から作れないジェムはこの最安がそのまま「低レベルのジェム本体」の値段になる。
 * status は他の検索と同じ**即時購入 (securable) だけ** (オーナー 2026-09-19:「基本、指定なしは使わないよ」。
 * v0.1.208 で一度 online に広げたが取り消した)。出品が 1 件しか無ければ、それがその時の値段。
 */
export function originalGemQuery(gemEn: string, meta = false): unknown {
  return buildGemQuery(gemEn, {
    category: meta ? "gem.metagem" : "gem.activegem",
    corrupted: false,
    twiceCorrupted: false,
  });
}

/** 追跡のキー ("Arc::finished")。銘柄 1 つ = ジェム × 条件 */
export const watchKey = (gemEn: string, key: SaleKey): string => `${gemEn}::${key}`;
