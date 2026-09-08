/**
 * craft-v2-store.ts — 互換用の再エクスポート
 *
 * 2026-09-07 リファクタ: 692 行あった本体を分割した。
 *   state/craft-v2/store.ts   reactive シングルトン + 警告ヘルパー
 *   state/craft-v2/fetch.ts   取得制御 (起動 / 更新 / 全取得 / リーグ再取得)
 *   state/craft-v2/health.ts  健全性チェック + 辞書件数チェック
 * 既存の import 先 (App.vue / CraftDiscoveryV2B.vue) を壊さないための窓口。
 */
export {
  craftV2Store,
  nowMs,
  pushWarn,
  clearWarns,
  toggleWarnDetail,
  formatHms,
  MAX_WARN_HISTORY,
  type CraftV2Store,
  type NetworkStatusUi,
  type WarnEntry,
  type WarnLevel,
  type WarnSource,
} from "./craft-v2/store";
export {
  ensureCraftV2Started,
  refreshCraftV2,
  forceRefetchCraftV2,
  refetchWithSelectedLeague,
} from "./craft-v2/fetch";
export { runHealthCheck } from "./craft-v2/health";
