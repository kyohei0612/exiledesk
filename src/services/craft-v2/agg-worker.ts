/**
 * 上位 MOD 一覧のキャッシュの集計を、画面とは別の場所 (Web Worker) でやる (2026-10-07 オーナー「アプリ立ち上げの重さ」→「2 と 3 も進めて」)。
 * 前は画面の側で計算機のデータ (約 9MB) を読んで 0.8〜1.4 秒、集計で 3〜5.5 秒、画面が固まっていた。
 * 集計の結果は IndexedDB に置き、キャッシュ・アプリの版・集計の形が同じなら次からは読むだけ (aggKeyOf)
 */
import { prepareDeboost } from "./deboost";
import { prepareEngineMods } from "../mods/engine-mods";
import { aggregateFromCache } from "./finalize";
import type { AggregatedAscendancy, CraftV2Cache } from "./types";
import pkg from "../../../package.json";

export interface AggJob { id: number; cache: CraftV2Cache }
export type AggMsg = { id: number; ok: true; agg: AggregatedAscendancy[]; hit: boolean; ms: number } | { id: number; ok: false; message: string };

/** 集計の作り (finalize / ingest / deboost) を変えたら上げる。版が変わった時も作り直す */
const AGG_FORMAT = 1;
export function aggKeyOf(cache: CraftV2Cache): string {
  return [AGG_FORMAT, pkg.version, cache.snapshot_version, cache.league_url, cache.saved_at, cache.ascendancies.length].join("|");
}

const DB = "exiledesk-craft-v2";
const STORE = "agg";
const SLOT = "last";
function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
/** 置いてある集計 (鍵が同じ時だけ)。読めなければ null */
async function readSaved(key: string): Promise<AggregatedAscendancy[] | null> {
  try {
    const db = await openDb();
    const v = await new Promise<{ key: string; agg: AggregatedAscendancy[] } | undefined>((res, rej) => {
      const q = db.transaction(STORE, "readonly").objectStore(STORE).get(SLOT);
      q.onsuccess = () => res(q.result as { key: string; agg: AggregatedAscendancy[] } | undefined);
      q.onerror = () => rej(q.error);
    });
    db.close();
    return v && v.key === key ? v.agg : null;
  } catch { return null; }
}
/** 最新の 1 つだけ置く (前の物は上書き) */
async function writeSaved(key: string, agg: AggregatedAscendancy[]): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ key, agg }, SLOT);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch { /* 置けなくても次に集計し直すだけ */ }
}

const post = (m: AggMsg): void => (self as unknown as { postMessage: (m: AggMsg) => void }).postMessage(m);

self.onmessage = async (ev: MessageEvent<AggJob>) => {
  const { id, cache } = ev.data;
  const t0 = Date.now();
  try {
    const key = aggKeyOf(cache);
    const saved = await readSaved(key);
    if (saved) { post({ id, ok: true, agg: saved, hit: true, ms: Date.now() - t0 }); return; }
    await prepareDeboost().catch(() => undefined);
    await prepareEngineMods();
    const agg = aggregateFromCache(cache);
    post({ id, ok: true, agg, hit: false, ms: Date.now() - t0 });
    await writeSaved(key, agg);
  } catch (e) {
    post({ id, ok: false, message: e instanceof Error ? e.message : String(e) });
  }
};
