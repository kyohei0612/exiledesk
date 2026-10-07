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

import { bootTimed, bootTimedSync } from "../../utils/boot-timing";
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
import type { AggJob, AggMsg } from "./agg-worker";
import type { AggregatedAscendancy } from "./types";
import { prepareEngineMods } from "../mods/engine-mods";
import { GEM_INFO } from "./finalize/gems";
import { prepareDeboost } from "./deboost";

/** 取る・出すアセンダンシーの数 (使用率の上位)。2026-09-29 オーナー「上位 7 種類に」(前は 10)。数はここだけ */
export const TOP_ASCENDANCIES = 7;

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
    topNAscendancies = TOP_ASCENDANCIES,
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

  // キャッシュロード + 即時 UI 反映 (差分モード判定は Rust 側に任せる)。集計は別の場所 (agg-worker.ts) で、画面は止めない
  let prevCache: CraftV2Cache | null = null;
  if (useCache) {
    prevCache = await bootTimed("MOD 一覧: キャッシュの読み込み", () => loadCraftV2Cache());
    if (prevCache && onCacheReady) {
      try {
        const agg = await bootTimed("MOD 一覧: キャッシュの集計 (別の場所で)", () => aggregateOffThread(prevCache!));
        bootTimedSync("MOD 一覧: 画面に反映", () => onCacheReady(agg, prevCache!));
      } catch (err) {
        console.warn("[craft-discovery-v2] aggregateFromCache failed, ignoring cache:", err);
        prevCache = null;
      }
    }
  }

  // キャッシュが新しければここで終わり (poe.ninja には行かない)
  if (shouldFetch && !shouldFetch(prevCache)) return null;

  // 取得中の集計 (aggregateFromProgress) は画面の側で同期なので、取りに行く時だけ計算機のデータを読む
  await bootTimed("MOD 一覧: 計算機のデータ", () => prepareDeboost()).catch((e) => console.warn("[craft-discovery-v2] 計算機のデータを読めず、品質の割り戻しなしで集計:", e));
  await bootTimed("MOD 一覧: エンジンの MOD", () => prepareEngineMods()).catch((e) => console.warn("[craft-discovery-v2] MOD のデータを読めず:", e));

  const [unProgress, unError, unDone, unCheckpoint, unCharProgress] = await Promise.all([
    listen<CraftV2Progress>("craft-v2-progress", (e) => {
      try {
        onProgress(bootTimedSync(`MOD 一覧: 取得中の集計 (${e.payload.ascendancy})`, () => aggregateFromProgress(e.payload)));
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
    prevCache,
    leagueUrl: leagueUrl ?? null,
    // 2026-09-29: メインスキルを決める時に外すトリガーのメタジェム (Cast on Block 等)。表はクライアントのジェム表 1 つ
    metaGems: [...GEM_INFO].filter(([, g]) => g.meta).map(([en]) => en),
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    onFatal?.(`craft_v2_fetch_all 失敗: ${msg}`);
  });

  return unlistenAll;
}

/**
 * キャッシュの集計を別の場所 (agg-worker.ts) で。置いてある結果が使えればそれを読むだけ。
 * 別の場所が作れない・落ちた時は画面の側で集計する (前と同じ。固まるが一覧は出る)
 */
let aggWorker: Worker | null = null;
let aggSeq = 0;
async function aggregateOffThread(cache: CraftV2Cache): Promise<AggregatedAscendancy[]> {
  try {
    aggWorker ??= new Worker(new URL("./agg-worker.ts", import.meta.url), { type: "module" });
    const w = aggWorker;
    const id = ++aggSeq;
    const r = await new Promise<AggMsg>((res, rej) => {
      const onMsg = (e: MessageEvent<AggMsg>): void => { if (e.data.id !== id) return; w.removeEventListener("message", onMsg); w.removeEventListener("error", onErr); res(e.data); };
      const onErr = (e: ErrorEvent): void => { w.removeEventListener("message", onMsg); w.removeEventListener("error", onErr); rej(new Error(e.message || "worker error")); };
      w.addEventListener("message", onMsg);
      w.addEventListener("error", onErr);
      w.postMessage({ id, cache } satisfies AggJob);
    });
    if (!r.ok) throw new Error(r.message);
    console.log(`[craft-discovery-v2] キャッシュの集計 ${r.hit ? "置いてある結果を読んだ" : "集計した"} ${r.ms}ms`);
    return r.agg;
  } catch (e) {
    console.warn("[craft-discovery-v2] 別の場所で集計できず、画面の側で:", e);
    aggWorker?.terminate();
    aggWorker = null;
    await prepareDeboost().catch(() => undefined);
    await prepareEngineMods();
    return bootTimedSync("MOD 一覧: キャッシュの集計 (画面の側)", () => aggregateFromCache(cache));
  }
}
