/**
 * MOD 一覧の取得制御: 起動 / 更新 / 全取得 / リーグ再取得、バックグラウンド更新の据え置きロジック
 *
 * craft-v2-store.ts から切り出し (2026-09-07)。
 *
 * 2026-05-23 オーナー指示「シームレスの徹底」:
 *   App.vue の onMounted で `ensureCraftV2Started()` を呼ぶことで、アプリ起動直後に
 *   バックグラウンドで fetch が走り始める。画面はマウント時に同じ関数を呼ぶだけ (冪等)。
 *
 * 2026-06-28 バックグラウンド更新:
 *   2回目以降 (更新 / 自動再取得 / 再起動時のキャッシュ表示後) は UI を前回データのまま
 *   据え置き、各アセンダンシーの取得が完了するたびにその 1 つだけを差し替える。
 *
 * 2026-09-26: 取得のコア (runFetch) と進捗表示のタイマーは fetch/ 以下に分割 (ここから再 export)。
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { clearCraftV2Cache } from "../../services/craft-v2/cache";
import { fetchEconomyLeagues } from "../../services/craft-v2/runner";
import { craftV2Store } from "./store";
import { checkDictionaryFreshness, runHealthCheck } from "./health";
import { isCraftV2CacheStale, runFetch } from "./fetch/run";

export { CRAFT_V2_STALE_SECS, isCraftV2CacheStale } from "./fetch/run";

/** 取得中なら Rust 側に中断を頼み、done が来る (loading=false) まで待つ (最大 90 秒) */
async function cancelInFlight(): Promise<void> {
  if (!craftV2Store.loading) return;
  try {
    await invoke("craft_v2_cancel");
  } catch (err) {
    console.warn("[craft-v2-store] craft_v2_cancel failed:", err);
  }
  const deadline = Date.now() + 90_000;
  while (craftV2Store.loading && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
  }
  // タイムアウトしたら状態だけ落として先へ進む (Rust 側は次のキャラ境界で止まる)
  craftV2Store.loading = false;
  craftV2Store.backgroundRefresh = false;
}

// store の外側に置く mutable refs (UnlistenFn / Timer は reactive 化不要)
let autoRefetchUnlisten: UnlistenFn | null = null;

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/**
 * 起動時 / 画面マウント時に呼ばれる冪等な起動エントリ。
 * 起動済み / 取得中 / データ取得済 のいずれかなら何もしない。
 */
export async function ensureCraftV2Started(): Promise<void> {
  if (craftV2Store.initialBootStarted) return;
  if (craftV2Store.loading) return;
  if (craftV2Store.ascendancies.length > 0 && !craftV2Store.fatalError) return;
  craftV2Store.initialBootStarted = true;

  // リーグ一覧 fetch 等を await する数秒間に空状態 UI がフラッシュしないよう先に loading を立てる
  craftV2Store.loading = true;

  // 自動再取得 event listener を 1 度だけ仕込む (Rust 側スケジューラが emit)。取得中はスキップ。
  if (!autoRefetchUnlisten) {
    try {
      autoRefetchUnlisten = await listen<void>("craft-v2-auto-refetch", () => {
        if (craftV2Store.loading) {
          console.log("[craft-v2-store] auto-refetch skipped (fetch already in progress)");
          return;
        }
        if (!isCraftV2CacheStale(craftV2Store.cacheSavedAt)) {
          console.log("[craft-v2-store] auto-refetch skipped (cache is fresh, < 3 days)");
          return;
        }
        console.log("[craft-v2-store] auto-refetch triggered by scheduler");
        void refreshCraftV2();
      });
    } catch (err) {
      console.warn("[craft-v2-store] failed to listen auto-refetch:", err);
    }
  }

  try {
    const leagues = await fetchEconomyLeagues();
    craftV2Store.availableLeagues = leagues;
    craftV2Store.leaguesLoadFailed = false;
    if (!craftV2Store.selectedLeagueUrl && leagues.length > 0) {
      craftV2Store.selectedLeagueUrl = leagues[0].url;
    }
  } catch (err) {
    console.warn("[craft-v2-store] fetchEconomyLeagues failed:", err);
    craftV2Store.leaguesLoadFailed = true;
  }

  void runHealthCheck();
  checkDictionaryFreshness();

  // 起動時: キャッシュが 3 日以内なら取りに行かない (手動ボタンはいつでも可)
  await runFetch(true, { bgWhenCached: true, onlyIfStale: true });
}

/** 「更新」ボタン (差分更新): 既存データがあればバックグラウンド更新。 */
export async function refreshCraftV2(): Promise<void> {
  await cancelInFlight();
  await runFetch(true, { background: true });
}

/** 「全取得」ボタン: ディスクキャッシュ削除 → 完全再取得。 */
export async function forceRefetchCraftV2(): Promise<void> {
  await cancelInFlight();
  await clearCraftV2Cache();
  await runFetch(false);
}

/** 「このリーグで再取得」ボタン: selectedLeagueUrl で再 fetch。 */
export async function refetchWithSelectedLeague(): Promise<void> {
  await cancelInFlight();
  await runFetch(true);
}
