/**
 * シミュレーションの作業場所 (Web Worker、2026-10-07 オーナー「おっそいな」「前は一瞬だった」)。
 * 画面とは別の場所で runRecipeOnce を回し、1 回分を軽くした物 (RunLite) を送り返す。MOD 表は作業場所ごとに 1 回だけ読む。
 * 値段は画面から表で受け取る (表に無いキーは 0 で計算し、missing で知らせる → 画面が値段を足して回し直す)
 */
import { loadHtcPatch } from "../htc/patch";
import { liteOf, runRecipeOnce, type RecipeSpec, type RunLite } from "./recipe-sim";

export interface WorkerJob { id: number; spec: Omit<RecipeSpec, "data" | "price">; prices: Record<string, number>; seeds: number[] }
export type WorkerMsg = { id: number; type: "progress"; done: number } | { id: number; type: "done"; runs: RunLite[]; missing: string[] } | { id: number; type: "error"; message: string };

const post = (m: WorkerMsg): void => (self as unknown as { postMessage: (m: WorkerMsg) => void }).postMessage(m);

self.onmessage = async (ev: MessageEvent<WorkerJob>) => {
  const { id, spec, prices, seeds } = ev.data;
  try {
    const data = await loadHtcPatch();
    const missing = new Set<string>();
    const price = (k: string): number => { const v = prices[k]; if (v == null) { missing.add(k); return 0; } return v; };
    const full: RecipeSpec = { ...spec, data, price };
    const runs: RunLite[] = [];
    let last = Date.now();
    for (let i = 0; i < seeds.length; i++) {
      runs.push(liteOf(full, runRecipeOnce(full, seeds[i]!)));
      if (Date.now() - last > 50) { post({ id, type: "progress", done: i + 1 }); last = Date.now(); }
    }
    post({ id, type: "done", runs, missing: [...missing] });
  } catch (e) {
    post({ id, type: "error", message: e instanceof Error ? e.message : String(e) });
  }
};
