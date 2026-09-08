/**
 * 取得の起動: Tauri event の listen + `craft_v2_fetch_all` invoke
 *
 * craft-discovery-v2.ts から切り出し (2026-09-07)。
 *
 * 内部動作:
 *   1. キャッシュがあれば即時集計して onCacheReady
 *   2. `craft-v2-progress` / `-error` / `-done` / `-checkpoint` / `-character-progress` を listen
 *   3. `craft_v2_fetch_all` を fire-and-forget で発火 (進捗は event 経由)
 *
 * 注意: 同一画面で 2 回以上呼ぶと Rust 側は別タスクで動くため event が混ざる。
 * UI 側で前回の unlisten を呼んでから再 start すること。
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauriRuntime } from "../../utils/isTauriRuntime";
import type {
  CharacterProgressInfoRaw,
  CraftV2Cache,
  CraftV2ErrorPayload,
  CraftV2FetchResult,
  CraftV2Progress,
  LeagueInfo,
  StartCraftDiscoveryV2Options,
} from "./types";
import { loadCraftV2Cache, saveCraftV2Cache } from "./cache";
import { aggregateFromCache, aggregateFromProgress } from "./finalize";

/**
 * 起動時 / 設定 UI から呼ばれ、poe.ninja の現リーグ一覧を返す。
 * 失敗時は空配列ではなく Error throw (UI 側でフォールバック)。
 */
export async function fetchEconomyLeagues(): Promise<LeagueInfo[]> {
  if (!isTauriRuntime()) return [];
  return await invoke<LeagueInfo[]>("fetch_economy_leagues");
}

/**
 * 取得を開始する。戻り値は unlisten 関数 (UI 側で onBeforeUnmount で呼ぶ)。
 * Tauri 環境でない場合は null。
 */
export async function startCraftDiscoveryV2(
  options: StartCraftDiscoveryV2Options,
): Promise<UnlistenFn | null> {
  if (!isTauriRuntime()) {
    options.onFatal?.("Tauri ランタイム外では実行できません (ブラウザ dev mode)");
    return null;
  }

  const {
    topNAscendancies = 10,
    topNPerAscendancy = 50,
    onProgress,
    onError,
    onDone,
    onFatal,
    onCacheReady,
    shouldFetch,
    useCache = true,
    leagueUrl,
    onCharacterProgress,
  } = options;

  // キャッシュロード + 即時 UI 反映 (差分モード判定は Rust 側に任せる)
  let prevCache: CraftV2Cache | null = null;
  if (useCache) {
    prevCache = await loadCraftV2Cache();
    if (prevCache && onCacheReady) {
      try {
        onCacheReady(aggregateFromCache(prevCache), prevCache);
      } catch (err) {
        console.warn("[craft-discovery-v2] aggregateFromCache failed, ignoring cache:", err);
        prevCache = null;
      }
    }
  }

  // キャッシュが新しければここで終わり (poe.ninja には行かない)
  if (shouldFetch && !shouldFetch(prevCache)) return null;

  const [unProgress, unError, unDone, unCheckpoint, unCharProgress] = await Promise.all([
    listen<CraftV2Progress>("craft-v2-progress", (e) => {
      try {
        onProgress(aggregateFromProgress(e.payload));
      } catch (err) {
        onError(
          `集計エラー (${e.payload.ascendancy}): ${err instanceof Error ? err.message : String(err)}`,
          { ascendancy: e.payload.ascendancy, phase: "aggregate" },
        );
      }
    }),
    listen<CraftV2ErrorPayload>("craft-v2-error", (e) => {
      const p = e.payload ?? {};
      onError(`[${p.phase ?? "?"}] ${p.ascendancy ?? "(unknown asc)"}: ${p.error ?? "unknown error"}`, p);
    }),
    // done payload は { snapshot, cache }。cache を自動保存し、onDone には snapshot だけ流す。
    listen<CraftV2FetchResult>("craft-v2-done", (e) => {
      void saveCraftV2Cache(e.payload.cache);
      onDone(e.payload.snapshot);
    }),
    // アセンダンシー単位 checkpoint (累積 cache)。途中 kill でもここまで分が残る。
    listen<CraftV2Cache>("craft-v2-checkpoint", (e) => {
      void saveCraftV2Cache(e.payload);
    }),
    // per-character 進捗 (5 キャラ毎バッチ)。未指定でも listen は登録する (unlisten の整合)。
    listen<CharacterProgressInfoRaw>("craft-v2-character-progress", (e) => {
      if (!onCharacterProgress) return;
      const raw = e.payload;
      onCharacterProgress({
        ascendancy: raw.ascendancy,
        charactersDone: raw.characters_done,
        charactersTotal: raw.characters_total,
        currentConcurrency: raw.current_concurrency,
        phase: raw.phase,
      });
    }),
  ]);

  const unlistenAll: UnlistenFn = () => {
    for (const un of [unProgress, unError, unDone, unCheckpoint, unCharProgress]) {
      try {
        un();
      } catch {
        /* noop */
      }
    }
  };

  // invoke は await すると全完了まで止まるが、UI は progress 経由で先に埋まる。
  // prevCache を渡すと Rust 側で差分モードに入る (version 一致時のみ)。
  invoke<CraftV2FetchResult>("craft_v2_fetch_all", {
    topNAscendancies,
    topNPerAscendancy,
    prevCache,
    leagueUrl: leagueUrl ?? null,
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    onFatal?.(`craft_v2_fetch_all 失敗: ${msg}`);
  });

  return unlistenAll;
}
