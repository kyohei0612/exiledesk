/**
 * シミュレーションを PC のコアに分けて回す (2026-10-07 オーナー「おっそいな」「前は一瞬だった」)。
 * 人を作業場所 (recipe-worker.ts) の数で分け、同じ seed で回すので 1 本で回した時と同じ結果になる。
 * 作業場所が使えない時 (古い環境・テスト) や、人が少ない時は 1 本 (runRecipe) で回す
 */
import { runRecipe, runRecipeOnce, seedsOf, summarizeRuns, type RecipeResult, type RecipeSpec, type RunLite } from "./recipe-sim";
import type { WorkerJob, WorkerMsg } from "./recipe-worker";

let pool: Worker[] = [];
let nextId = 1;
/** 作業場所の数 (コア数 − 1、2〜8) */
const poolSize = (): number => Math.max(2, Math.min(8, ((globalThis.navigator?.hardwareConcurrency ?? 4) - 1)));
function ensurePool(): Worker[] {
  if (pool.length) return pool;
  pool = Array.from({ length: poolSize() }, () => new Worker(new URL("./recipe-worker.ts", import.meta.url), { type: "module" }));
  return pool;
}
/** 止めた時は作業場所ごと捨てる (回している途中の計算は止められないので) */
export function stopParallel(): void {
  for (const w of pool) w.terminate();
  pool = [];
}

/** 値段の表 (画面の price で引いた物)。使いそうなキーを、1 本で少し回して集める */
function priceTable(spec: RecipeSpec, extra: readonly string[]): Record<string, number> {
  const seen = new Map<string, number>();
  const price = (k: string): number => { let v = seen.get(k); if (v == null) { v = spec.price(k); seen.set(k, v); } return v; };
  const probe: RecipeSpec = { ...spec, price, maxSteps: Math.min(spec.maxSteps ?? 4000, 400) };
  for (const seed of seedsOf({ seed: 12345, runs: 3 })) runRecipeOnce(probe, seed);
  for (const k of extra) price(k);
  return Object.fromEntries(seen);
}

/** 作業場所に投げられる形に (Vue の reactive を外し、関数と MOD 表は抜く) */
const plainSpec = (spec: RecipeSpec): WorkerJob["spec"] => {
  const { data: _d, price: _p, ...rest } = spec;
  return JSON.parse(JSON.stringify(rest)) as WorkerJob["spec"];
};

async function runOnPool(spec: RecipeSpec, prices: Record<string, number>, onProgress?: (done: number, total: number) => void, stopped?: () => boolean): Promise<{ runs: RunLite[]; missing: string[] } | null> {
  const workers = ensurePool();
  const seeds = seedsOf(spec);
  const chunks = workers.map((_, w) => seeds.filter((_, i) => i % workers.length === w));
  const done = new Array(workers.length).fill(0) as number[];
  const base = plainSpec(spec);
  const results = await Promise.all(workers.map((w, k) => new Promise<{ runs: RunLite[]; missing: string[] } | null>((resolve, reject) => {
    if (!chunks[k]!.length) { resolve({ runs: [], missing: [] }); return; }
    const id = nextId++;
    const timer = setInterval(() => { if (stopped?.()) { clearInterval(timer); w.removeEventListener("message", onMsg); resolve(null); } }, 100);
    const onMsg = (ev: MessageEvent<WorkerMsg>): void => {
      const m = ev.data;
      if (m.id !== id) return;
      if (m.type === "progress") { done[k] = m.done; onProgress?.(done.reduce((a, x) => a + x, 0), seeds.length); return; }
      clearInterval(timer);
      w.removeEventListener("message", onMsg);
      if (m.type === "error") reject(new Error(m.message));
      else { done[k] = chunks[k]!.length; onProgress?.(done.reduce((a, x) => a + x, 0), seeds.length); resolve({ runs: m.runs, missing: m.missing }); }
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ id, spec: base, prices, seeds: chunks[k]! } satisfies WorkerJob);
  })));
  if (results.some((r) => r == null)) { stopParallel(); return null; }
  // seed の順に並べ直す (1 本で回した時と同じ並び)
  const order = new Map(seeds.map((s, i) => [s, i]));
  const runs = results.flatMap((r) => r!.runs).sort((a, b) => order.get(a.seed)! - order.get(b.seed)!);
  return { runs, missing: [...new Set(results.flatMap((r) => r!.missing))] };
}

/**
 * 並列で回してまとめる。値段の表に無いキーが出たら、その値段を足してもう 1 回 (まれ)。
 * 作業場所が使えなければ 1 本で回す
 */
export async function runRecipeParallel(spec: RecipeSpec, onProgress?: (done: number, total: number) => void, stopped?: () => boolean): Promise<RecipeResult | null> {
  if (typeof Worker === "undefined" || spec.runs < 40) return runRecipe(spec, onProgress, stopped);
  try {
    let prices = priceTable(spec, []);
    for (let pass = 0; pass < 2; pass++) {
      const out = await runOnPool(spec, prices, onProgress, stopped);
      if (!out) return null;
      const missing = out.missing.filter((k) => prices[k] == null);
      if (!missing.length || pass === 1) return summarizeRuns(spec, out.runs);
      prices = { ...prices, ...priceTable(spec, missing) };
    }
    return null;
  } catch (e) {
    // 作業場所で何か起きたら 1 本で回す (結果は同じ)
    console.warn("recipe-parallel: 1 本で回します", e);
    stopParallel();
    return runRecipe(spec, onProgress, stopped);
  }
}
