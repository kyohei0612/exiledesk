/**
 * trade2 の検索条件を組み立てて、結果ページを OS 既定ブラウザで開く
 *
 * craft-discovery-v2.ts から切り出し (2026-09-07)。
 * 2026-09-08: API (trade2_search) を叩かず、条件 JSON を `?q=` に載せた URL を開く方式に変更。
 *   - search API はレート制限が厳しく (5 分 30 回、超えると 10 分ペナルティ)、「押したらトレード行く」に使うと
 *     他の相場取得まで巻き添えになる。サイト側は `?q=` を読んで自前で検索するので、アプリからの API 消費は 0。
 *   - ユニーク名が trade2 未登録のときはサイト側がエラーを出すので、その場で手動で直してもらう。
 */

import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauriRuntime } from "../../utils/isTauriRuntime";
import type { ModEntry, SlotKey } from "../craft-v2/types";
import { snapshotNameToTradeLeague, trade2QueryUrl } from "./league";
import { buildRareSearchQuery, buildStatFilters, buildUniqueNameQuery } from "./query";

const TAURI_ONLY = "trade2 連携は Tauri ネイティブ環境でのみ動作します (ブラウザ dev では無効)";

/**
 * 選択された MOD 群の検索条件で trade2 サイトを開く (API 呼び出しなし)。
 *
 * @param args.league  snapshot.snapshot_name (kebab-case、自動変換)
 * @returns 開いた URL、stat ID 引き失敗した MOD のテキスト、適用された stat 数
 * @throws Tauri 環境外
 */
export async function openTrade2ForSelectedMods(args: {
  selectedMods: ModEntry[];
  slot: SlotKey;
  league: string;
  /** 各 MOD の「最低値」(= 選択ティアの min) を rawTemplate キーで指定 (任意) */
  tierMinByMod?: Record<string, number>;
}): Promise<{ openedUrl: string; missingMods: string[]; statCount: number }> {
  if (!isTauriRuntime()) throw new Error(TAURI_ONLY);

  const { statFilters, missingMods } = buildStatFilters(args.selectedMods, args.tierMinByMod);
  const query = buildRareSearchQuery(args.slot, statFilters);
  const url = trade2QueryUrl(snapshotNameToTradeLeague(args.league), query);
  await openUrl(url);
  return { openedUrl: url, missingMods, statCount: statFilters.length };
}

/** ユニーク名の検索条件で trade2 サイトを開く (API 呼び出しなし) */
export async function openTrade2ForUnique(args: {
  nameEn: string;
  league: string;
  /** 互換のため残置 (未使用)。名前が未登録ならサイト側で直してもらう */
  baseType?: string;
}): Promise<{ openedUrl: string }> {
  if (!isTauriRuntime()) throw new Error(TAURI_ONLY);
  const url = trade2QueryUrl(snapshotNameToTradeLeague(args.league), buildUniqueNameQuery(args.nameEn));
  await openUrl(url);
  return { openedUrl: url };
}
