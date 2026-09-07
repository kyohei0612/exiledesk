/**
 * trade2 検索を実行して結果ページを OS 既定ブラウザで開く
 *
 * craft-discovery-v2.ts から切り出し (2026-09-07)。
 * 「押したらトレード行く」挙動 (旧 openClusterInTrade2 の V2 移植)。
 */

import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauriRuntime } from "../../utils/isTauriRuntime";
import type { ModEntry, SlotKey } from "../craft-v2/types";
import { snapshotNameToTradeLeague, trade2HomeUrl, trade2SearchUrl } from "./league";
import {
  buildRareSearchQuery,
  buildStatFilters,
  buildUniqueBaseQuery,
  buildUniqueNameQuery,
  type Trade2SearchResponse,
} from "./query";

const TAURI_ONLY = "trade2 連携は Tauri ネイティブ環境でのみ動作します (ブラウザ dev では無効)";

async function trade2Search(tradeLeague: string, query: unknown): Promise<Trade2SearchResponse> {
  return await invoke<Trade2SearchResponse>("trade2_search", { req: { league: tradeLeague, query } });
}

/**
 * 選択された MOD 群で trade2 を検索し、結果ページを開く。
 *
 * @param args.league  snapshot.snapshot_name (kebab-case、自動変換)
 * @returns 開いた URL、stat ID 引き失敗した MOD のテキスト、適用された stat 数
 * @throws Tauri 環境外 / trade2_search が id を返さなかった場合
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
  const tradeLeague = snapshotNameToTradeLeague(args.league);
  const search = await trade2Search(tradeLeague, query);
  if (!search.id) throw new Error("trade2_search にレスポンス id がありません");

  const url = trade2SearchUrl(tradeLeague, search.id);
  await openUrl(url);
  return { openedUrl: url, missingMods, statCount: statFilters.length };
}

/**
 * ユニーク名で trade2 検索を開く。
 * name 検索が 400 "Unknown item name" (trade2 未登録の新ユニーク) なら baseType + rarity=unique で
 * フォールバック検索、それも無理なら検索ホームを開いて Error を投げる。
 */
export async function openTrade2ForUnique(args: {
  nameEn: string;
  league: string;
  baseType?: string;
}): Promise<{ openedUrl: string }> {
  const tradeLeague = snapshotNameToTradeLeague(args.league);
  if (!isTauriRuntime()) throw new Error(TAURI_ONLY);

  try {
    const search = await trade2Search(tradeLeague, buildUniqueNameQuery(args.nameEn));
    if (search.id) {
      const url = trade2SearchUrl(tradeLeague, search.id);
      await openUrl(url);
      return { openedUrl: url };
    }
    throw new Error("trade2_search にレスポンス id がありません");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isUnknownName = msg.includes("Unknown item name") || msg.includes("400");
    if (!isUnknownName) throw err;

    if (args.baseType) {
      try {
        const fallback = await trade2Search(tradeLeague, buildUniqueBaseQuery(args.baseType));
        if (fallback.id) {
          const url = trade2SearchUrl(tradeLeague, fallback.id);
          await openUrl(url);
          console.warn(
            `[openTrade2ForUnique] name "${args.nameEn}" が trade2 未登録 → baseType "${args.baseType}" で fallback 検索`,
          );
          return { openedUrl: url };
        }
      } catch (fallbackErr) {
        console.warn("[openTrade2ForUnique] baseType fallback も失敗:", fallbackErr);
      }
    }

    await openUrl(trade2HomeUrl(tradeLeague));
    throw new Error(
      `trade2 で「${args.nameEn}」は未登録のユニーク名です。検索ホームを開きました → 手動で検索してください。`,
    );
  }
}
