/**
 * market-flow.ts — 捌き速度 (2026-09-16)
 *
 * Rust 側 (src-tauri/src/market_flow.rs) が出品 1 件ずつを ID で追った記録から、
 * 「この商品はどれくらいで売れるのか」を出す。ジェム専用ではなく、trade2 のクエリを
 * 渡して登録した銘柄なら何でも同じ仕組みで測れる。
 *
 * ## 測り方
 * 追跡中の出品には 2 種類ある:
 *   - 消えた物   … 寿命 = 消えた時刻 − 初めて見た時刻 (売れたか取り下げたか)
 *   - まだある物 … 「少なくとも今の齢までは売れなかった」という打ち切りデータ
 * 消えた物だけで平均を取ると売れ残りを無視した速い数字になるので、打ち切りも含めて
 * **生存分析 (Kaplan-Meier)** で「半分が消えるまでの時間」を出す。
 *
 * 以前は「今並んでいる出品が何分前に出された物か」で測っていたが、
 * examples/gem_flow_sim.rs で検証したところ **速い市場ほど遅く出る** (良い出品は覗く前に
 * 売れていて、目に入るのは売れ残りだけ) ため捨てた。
 *
 * ## 判定 (オーナー指示 2026-09-16)
 *   24 時間以内に半分売れる → 速い / 1〜2 日 → 普通 / 48 時間を超える → 遅い
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../utils/isTauriRuntime";

export interface Tracked {
  id: string;
  /** 出品された時刻 (trade2 の listing.indexed)。齢はここを起点に数える */
  listed_at?: number | null;
  first_seen: number;
  last_seen: number;
  gone_at?: number | null;
  amount?: number | null;
  currency?: string | null;
}
export interface Daily {
  day: number;
  added: number;
  gone: number;
  survived: number;
  total_avg: number;
  samples: number;
}
export interface WatchState {
  tracked: Tracked[];
  daily: Daily[];
  total: number;
  sampled_at: number;
  confirmed_at?: number;
  cheapest_amount?: number | null;
  cheapest_currency?: string | null;
}
export interface Watch {
  key: string;
  label: string;
  query: unknown;
  note: string;
  /** 手動で足した銘柄 (自動リストの入れ替えで消えない) */
  manual?: boolean;
}
export interface FlowStore {
  sampled_at: number;
  list_refreshed_at: number;
  league: string;
  site: string;
  watches: Watch[];
  states: Record<string, WatchState>;
}
export interface ListingRef {
  id: string;
  amount?: number | null;
  currency?: string | null;
  /** 出品時刻 (unix 秒) */
  listed_at?: number | null;
}

const EMPTY: FlowStore = { sampled_at: 0, list_refreshed_at: 0, league: "", site: "", watches: [], states: {} };

export async function loadFlow(): Promise<FlowStore> {
  if (!isTauriRuntime()) return EMPTY;
  try {
    return await invoke<FlowStore>("market_flow_load");
  } catch {
    return EMPTY;
  }
}

/** 追跡する銘柄を入れ替える */
export async function setWatches(watches: Watch[], league: string, site: string): Promise<void> {
  if (!isTauriRuntime() || !league) return;
  try {
    await invoke("market_flow_set_watches", { req: { watches, league, site } });
  } catch {
    /* 失敗しても本体の表示には影響しない */
  }
}

export interface FlowStatus {
  sampling: boolean;
  current: string | null;
  done: number;
  total: number;
  rounds: number;
  last_at: number;
  next_at: number;
  auto_watches: number;
  manual_watches: number;
  last_error: string | null;
  rate_state: string | null;
  retry_until: number;
}

/** 自動追跡が今どうなっているか */
export async function loadFlowStatus(): Promise<FlowStatus | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invoke<FlowStatus>("market_flow_status");
  } catch {
    return null;
  }
}

/** 1 銘柄を手動で追跡に足す / 外す */
export async function toggleWatch(watch: Watch, on: boolean, league: string, site: string): Promise<FlowStore | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invoke<FlowStore>("market_flow_toggle_watch", { req: { watch, on, league, site } });
  } catch {
    return null;
  }
}

/** 手で取った結果を同じ記録に差し込む (ジェムコラプトの「再取得」) */
export async function recordFlow(sample: { key: string; total: number; ids: string[]; entries: ListingRef[] }): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await invoke("market_flow_record", { req: sample });
  } catch {
    /* 記録できなくても価格表示には影響しない */
  }
}

export type FlowTone = "fast" | "normal" | "slow" | "unknown";

export interface FlowSummary {
  /** "速い" / "普通" / "遅い" / "" */
  label: string;
  tone: FlowTone;
  /** 半分が売れるまでの時間 (分)。生存分析の中央値。求まらなければ null */
  medianMin: number | null;
  /** 24 時間 / 48 時間以内に売れる割合 (0-1) */
  soldIn24h: number | null;
  soldIn48h: number | null;
  /** 追跡した件数 */
  gone: number;
  alive: number;
  /** 直近の出品総数 */
  total: number | null;
  lastAt: number | null;
  /** 判定に足りるだけのデータがあるか */
  enough: boolean;
  /** 48 時間以上売れ残っている件数と、その最安に対する値段の倍率 (値段不相応の目安) */
  stale: number;
  staleRatio: number | null;
  /** まだ売れていない出品のうち一番古い物の齢 (分) */
  oldestMin: number | null;
  /** 判定が出せるまでの目安 (分)。売れ残りが 48 時間に届くまで。判定済みなら null */
  etaMin: number | null;
}

const HOUR = 3600;
/** オーナー指示: 24 時間以内=速い / 48 時間以内=普通 / それ以降=遅い */
const FAST_SECS = 24 * HOUR;
const NORMAL_SECS = 48 * HOUR;
/** 判定を出すのに要る最低件数 */
const MIN_EVENTS = 3;

const EMPTY_SUMMARY: FlowSummary = {
  label: "",
  tone: "unknown",
  medianMin: null,
  soldIn24h: null,
  soldIn48h: null,
  gone: 0,
  alive: 0,
  total: null,
  lastAt: null,
  enough: false,
  stale: 0,
  staleRatio: null,
  oldestMin: null,
  etaMin: null,
};

/**
 * Kaplan-Meier 法の生存曲線 (左側切断つき)。
 *
 * こちらが見つけた時点で既に何時間も出品されている物が多い (オーナー指摘: 17 時間前の
 * 出品を今拾う)。そこで「出品時刻からの齢」を寿命とし、観測に入った齢 (entry) より前の
 * 区間ではその出品を母数に入れない = 遅れて参加した扱いにする。
 * こうしないと「見つけてから何時間で消えたか」になり、実際より速く見える。
 */
export function survivalCurve(records: { entry: number; exit: number; event: boolean }[]): { t: number; s: number }[] {
  const times = [...new Set(records.filter((r) => r.event).map((r) => r.exit))].sort((a, b) => a - b);
  const curve: { t: number; s: number }[] = [];
  let s = 1;
  for (const t of times) {
    // その時刻に「観測中」だった件数 (entry < t <= exit)
    const atRisk = records.filter((r) => r.entry < t && r.exit >= t).length;
    const d = records.filter((r) => r.event && r.exit === t).length;
    if (atRisk > 0 && d > 0) {
      s *= 1 - d / atRisk;
      curve.push({ t, s });
    }
  }
  return curve;
}

/** 生存曲線から「その時刻までに消える割合」を読む */
function soldBy(curve: { t: number; s: number }[], t: number): number | null {
  if (curve.length === 0) return null;
  let s = 1;
  for (const p of curve) {
    if (p.t > t) break;
    s = p.s;
  }
  return 1 - s;
}

/** 生存率が 0.5 を切る時刻 (= 半分が売れるまで)。届かなければ null */
function medianFrom(curve: { t: number; s: number }[]): number | null {
  for (const p of curve) {
    if (p.s <= 0.5) return p.t;
  }
  return null;
}

/** 追跡記録から捌き速度を出す */
export function summarizeFlow(state: WatchState | undefined, nowSec: number = Math.floor(Date.now() / 1000)): FlowSummary {
  if (!state || !Array.isArray(state.tracked)) return EMPTY_SUMMARY;

  const records: { entry: number; exit: number; event: boolean }[] = [];
  let gone = 0;
  let alive = 0;
  let stale = 0;
  const stalePrices: number[] = [];
  const allPrices: number[] = [];
  for (const t of state.tracked) {
    const start = t.listed_at ?? t.first_seen;
    const exit = Math.max(60, (t.gone_at ?? nowSec) - start);
    const entry = Math.max(0, t.first_seen - start);
    records.push({ entry, exit, event: !!t.gone_at });
    if (t.gone_at) gone++;
    else {
      alive++;
      if (exit >= NORMAL_SECS) {
        stale++;
        if (t.amount != null) stalePrices.push(t.amount);
      }
    }
    if (t.amount != null) allPrices.push(t.amount);
  }
  if (records.length === 0) {
    return { ...EMPTY_SUMMARY, total: state.total ?? null, lastAt: state.sampled_at || null };
  }

  const curve = survivalCurve(records);
  const median = medianFrom(curve);
  const soldIn24h = soldBy(curve, FAST_SECS);
  const soldIn48h = soldBy(curve, NORMAL_SECS);

  // 値段不相応の目安: 48 時間以上残っている出品は、最安の何倍で出しているか
  const cheapest = allPrices.length > 0 ? Math.min(...allPrices) : null;
  const staleAvg = stalePrices.length > 0 ? stalePrices.reduce((a, b) => a + b, 0) / stalePrices.length : null;
  const staleRatio = cheapest != null && cheapest > 0 && staleAvg != null ? staleAvg / cheapest : null;

  // 判定に足りるか: 消えた記録が 3 件以上、または 48 時間以上売れ残りが 3 件以上
  const enough = gone >= MIN_EVENTS || stale >= MIN_EVENTS;

  // まだ判定できない時、「あとどれくらいで判定できるか」を出す。
  // 消えれば早く判定が付くが、売れ残りで判定する場合は 3 件目が 48 時間に届くまで待つ (オーナー指摘)
  const aliveAges = records.filter((r) => !r.event).map((r) => r.exit).sort((a, b) => b - a);
  const oldest = aliveAges.length > 0 ? aliveAges[0] : null;
  let etaSecs: number | null = null;
  if (!enough) {
    const need = MIN_EVENTS - gone; // 消えた記録で足りない分
    const nth = aliveAges[Math.max(0, Math.min(aliveAges.length - 1, need - 1))];
    if (aliveAges.length >= need && nth != null) etaSecs = Math.max(0, NORMAL_SECS - nth);
  }

  let tone: FlowTone = "unknown";
  let label = "";
  if (enough) {
    if (median != null && median <= FAST_SECS) {
      tone = "fast";
      label = "速い";
    } else if (median != null && median <= NORMAL_SECS) {
      tone = "normal";
      label = "普通";
    } else {
      tone = "slow";
      label = "遅い";
    }
  }

  return {
    label,
    tone,
    medianMin: median != null ? Math.round(median / 60) : null,
    soldIn24h,
    soldIn48h,
    gone,
    alive,
    total: state.total ?? null,
    lastAt: state.sampled_at || null,
    enough,
    stale,
    staleRatio,
    oldestMin: oldest != null ? Math.round(oldest / 60) : null,
    etaMin: etaSecs != null ? Math.round(etaSecs / 60) : null,
  };
}

/** 分 → "18 分" / "3 時間 20 分" / "2 日" */
export function fmtAge(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min} 分`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 === 0 ? `${h} 時間` : `${h} 時間 ${min % 60} 分`;
  const d = Math.floor(h / 24);
  return h % 24 === 0 ? `${d} 日` : `${d} 日 ${h % 24} 時間`;
}

/** 0-1 → "78%" */
export function fmtPct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}
