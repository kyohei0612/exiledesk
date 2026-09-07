/**
 * クラフト発見君 V2 — 公開 API (互換用の再エクスポート)
 *
 * 2026-09-07 リファクタ: 2,300 行あった本体を責務ごとに分割した。既存の import 先を
 * 壊さないため、このファイルは各モジュールの再エクスポートだけを持つ。
 *
 *   craft-v2/types.ts       型 (Rust ミラー + 集計結果 + 起動オプション)
 *   craft-v2/ninja-item.ts  poe.ninja items[] の型とスロット分類
 *   craft-v2/ingest.ts      1 キャラ分の積み上げ (カウンタ)
 *   craft-v2/finalize.ts    カウンタ → UI 公開形式、progress / キャッシュからの集計入口
 *   craft-v2/cache.ts       ディスクキャッシュ I/O
 *   craft-v2/runner.ts      Tauri event listen + fetch 起動
 *   mods/normalize.ts       MOD テキスト正規化 (純関数)
 *   mods/dictionaries.ts    辞書索引 (bundle / ティア / mod-text-ja / ユニーク名)
 *   trade2/league.ts        snapshot_name → trade2 リーグ ID
 *   trade2/query.ts         trade2 クエリ組み立て (純関数)
 *   trade2/open.ts          trade2 検索 → ブラウザで開く
 *
 * 新規コードは個別モジュールを直接 import すること。
 */

export type {
  AffixKind,
  AggregatedAscendancy,
  BaseEntry,
  CachedAscendancy,
  CachedCharacter,
  CachedRareItem,
  CachedUniqueItem,
  CharacterItems,
  CharacterProgressInfo,
  CraftV2Cache,
  CraftV2ErrorPayload,
  CraftV2FetchResult,
  CraftV2Progress,
  LeagueInfo,
  ModEntry,
  ModTier,
  ModTierRow,
  SlotKey,
  SlotMods,
  SlotModsBundle,
  SnapshotMeta,
  StartCraftDiscoveryV2Options,
  UniqueRepresentative,
  UniqueUsage,
} from "./craft-v2/types";
export { SLOT_KEYS } from "./craft-v2/types";

export {
  aggregateFromCache,
  aggregateFromCachedAscendancy,
  aggregateFromProgress,
} from "./craft-v2/finalize";
export { clearCraftV2Cache, loadCraftV2Cache, saveCraftV2Cache } from "./craft-v2/cache";
export { fetchEconomyLeagues, startCraftDiscoveryV2 } from "./craft-v2/runner";
export { openTrade2ForSelectedMods, openTrade2ForUnique } from "./trade2/open";

// ----------------------------------------------------------------------------
// テスト容易化のための export (UI からは使わない)
// ----------------------------------------------------------------------------
import { extractNumbers, fillTemplate, normalizeModTemplate } from "./mods/normalize";
import { heuristicAffix, modBundleIndex } from "./mods/dictionaries";
import { slotToTradeCategory } from "./trade2/query";
import { snapshotNameToTradeLeague } from "./trade2/league";

export const _internal = {
  normalizeModTemplate,
  extractNumbers,
  heuristicAffix,
  fillTemplate,
  modBundleIndex,
  slotToTradeCategory,
  snapshotNameToTradeLeague,
};
