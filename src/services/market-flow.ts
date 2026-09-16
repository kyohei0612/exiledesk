/**
 * market-flow.ts — 捌き速度 (2026-09-16、旧 gem-flow)
 *
 * Rust 側 (src-tauri/src/market_flow.rs) が 1 時間ごとに記録した出品の状態から、
 * 「この商品はどれくらいで売れるのか」を出す。ジェム専用ではなく、trade2 のクエリを
 * 渡して登録した銘柄なら何でも同じ仕組みで測れる。
 *
 * ## 指標の選び方 (examples/gem_flow_sim.rs で 6 パターンの市場を作って検証)
 * 「今並んでいる出品の滞留時間」は **速い市場ほど遅く出る** (良い出品は覗く前に売れていて、
 * 目に入るのは売れ残りだけ)。実際の待ち時間と順序が合ったのは **消失率** だけだった。
 *   需給均衡 (実際 21 分): 滞留の中央値 18.4 時間 / 消失率 31%
 *   供給過多 (実際 1.5 時間): 滞留 20.6 時間 / 消失率 11%
 *   死んだ市場 (実際 8.8 時間): 滞留 2.7 日 / 消失率 2%
 * よって主指標は「前回見えていた出品 ID が 1 時間後に何割消えたか」。
 *
 * 1 つだけ検出できない市場がある: 「即売れ + 強気出品だらけ」(見える範囲が全部売れ残り)。
 * これは「最安だけ頻繁に入れ替わるのに在庫が動かない」という形で出るので、別に警告する。
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../utils/isTauriRuntime";

export interface FlowSample {
  t: number;
  total: number;
  median_age_min: number | null;
  avg_age_min?: number | null;
  seen: number;
  entries?: ListingRef[];
  cheapest_amount: number | null;
  cheapest_currency: string | null;
}
export interface ListingRef {
  id: string;
  amount?: number | null;
  currency?: string | null;
}
export interface Watch {
  key: string;
  label: string;
  query: unknown;
  note: string;
}
export interface FlowStore {
  sampled_at: number;
  list_refreshed_at: number;
  league: string;
  site: string;
  watches: Watch[];
  samples: Record<string, FlowSample[]>;
}

const EMPTY: FlowStore = { sampled_at: 0, list_refreshed_at: 0, league: "", site: "", watches: [], samples: {} };

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

/** 手で取った結果を同じ履歴に差し込む */
export async function recordFlow(sample: {
  key: string;
  total: number;
  median_age_min: number | null;
  avg_age_min: number | null;
  seen: number;
  entries: ListingRef[];
  cheapest_amount: number | null;
  cheapest_currency: string | null;
}): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await invoke("market_flow_record", { req: sample });
  } catch {
    /* 記録できなくても価格表示には影響しない */
  }
}

export type FlowTone = "fast" | "normal" | "slow" | "suspect" | "unknown";

export interface FlowSummary {
  /** "速い" / "普通" / "遅い" / "速いかも" / "" */
  label: string;
  tone: FlowTone;
  /** 1 時間あたりの消失率 (0-1)。主指標 */
  turnover: number | null;
  /** 待ち時間の目安 (分)。見えている件数 ÷ 1 時間の消失数 */
  waitMin: number | null;
  /** 最安が入れ替わった割合 (0-1) */
  cheapestChurn: number | null;
  /** 出品総数 (直近) と 24 時間の増減 */
  totalNow: number | null;
  totalDelta: number | null;
  /** 判定に使えた比較の回数 (サンプル間の対) */
  pairs: number;
  /** 値段帯が入れ替わって比較できなかった回数 */
  skipped: number;
  count: number;
  lastAt: number | null;
  /** 参考: 今並んでいる出品の滞留時間 (判定には使わない) */
  avgAge: number | null;
}

/** シミュレーションから決めたしきい値 (1 時間あたりの消失率) */
const FAST_TURNOVER = 0.2;
const SLOW_TURNOVER = 0.08;
/** 在庫が動かないのに最安だけ入れ替わる = 見えている価格帯より下で売れている疑い */
const SUSPECT_CHURN = 0.5;

const EMPTY_SUMMARY: FlowSummary = {
  label: "",
  tone: "unknown",
  turnover: null,
  waitMin: null,
  cheapestChurn: null,
  totalNow: null,
  totalDelta: null,
  pairs: 0,
  skipped: 0,
  count: 0,
  lastAt: null,
  avgAge: null,
};

/**
 * 直近のサンプルから捌き速度を出す。
 *
 * 消失の数え方に 1 つ仕掛けがある: 「安い出品がまとめて出てきて、前に見えていた高い出品が
 * 一覧から押し出された」時に、それを売れたと数えてはいけない (オーナーの例: 50 神が滞留して
 * いるところに 40 神が 20 件参戦 → 一見 100% 入れ替わるが 1 件も売れていない)。
 * そこで「前回見えていた出品のうち、**今回の一覧に載る値段だったはずの物**」だけを数える。
 *
 * @param toEx 値段を高貴建てに直す関数 (通貨がまちまちなので呼び出し側の相場を使う)
 */
export function summarizeFlow(
  samples: FlowSample[] | undefined,
  toEx: (amount: number, currency: string) => number | null = () => null,
): FlowSummary {
  const list = samples ?? [];
  if (list.length === 0) return EMPTY_SUMMARY;
  const last = list[list.length - 1];
  const base = list[Math.max(0, list.length - 25)];

  /** 出品の値段 (高貴建て)。換算できなければ null */
  const priceOf = (e: ListingRef): number | null => {
    if (e.amount == null || !e.currency) return null;
    return toEx(e.amount, e.currency);
  };

  let goneWeighted = 0;
  let hoursTotal = 0;
  let churnHit = 0;
  let pairs = 0;
  let skipped = 0;
  for (let i = 1; i < list.length; i++) {
    const prev = list[i - 1];
    const cur = list[i];
    const prevEntries = prev.entries ?? [];
    const curEntries = cur.entries ?? [];
    if (prevEntries.length === 0 || curEntries.length === 0) continue;
    const hours = (cur.t - prev.t) / 3600;
    // 間が空きすぎた対 (アプリを閉じていた等) は捨てる
    if (!(hours > 0.2 && hours <= 6)) continue;

    // 今回の一覧に載っている一番高い値段。これより高い出品は「見えなくなっただけ」かもしれない
    const curPrices = curEntries.map(priceOf).filter((v): v is number => v != null);
    const visibleMax = curPrices.length > 0 && curEntries.length >= 10 ? Math.max(...curPrices) : Infinity;
    const curIds = new Set(curEntries.map((e) => e.id));

    let checked = 0;
    let gone = 0;
    for (const e of prevEntries) {
      const p = priceOf(e);
      // 押し出された可能性がある物は数えない (値段が分からない物は数える = 保守的)
      if (p != null && p > visibleMax) continue;
      checked++;
      if (!curIds.has(e.id)) gone++;
    }
    // 比較できる出品が少なすぎる対は捨てる (値段帯がごっそり入れ替わった時など)
    if (checked < 3) {
      skipped++;
      continue;
    }
    goneWeighted += gone / checked;
    hoursTotal += hours;
    if (prevEntries[0]?.id !== curEntries[0]?.id) churnHit++;
    pairs++;
  }

  const turnover = pairs > 0 && hoursTotal > 0 ? goneWeighted / hoursTotal : null;
  const cheapestChurn = pairs > 0 ? churnHit / pairs : null;
  // 待ち時間 = 1 ÷ 1 時間あたりの消失率
  const waitMin = turnover != null && turnover > 0 ? Math.round(60 / turnover) : null;

  let tone: FlowTone = "unknown";
  let label = "";
  if (turnover != null) {
    if (turnover >= FAST_TURNOVER) {
      tone = "fast";
      label = "速い";
    } else if (turnover >= SLOW_TURNOVER) {
      tone = "normal";
      label = "普通";
    } else if ((cheapestChurn ?? 0) >= SUSPECT_CHURN) {
      // 在庫は動かないのに最安だけ毎回入れ替わる = 表示価格より下で即売れしている疑い
      tone = "suspect";
      label = "速いかも";
    } else {
      tone = "slow";
      label = "遅い";
    }
  }

  return {
    label,
    tone,
    turnover,
    waitMin,
    cheapestChurn,
    totalNow: last.total,
    totalDelta: list.length > 1 ? last.total - base.total : null,
    pairs,
    skipped,
    count: list.length,
    lastAt: last.t,
    avgAge: last.avg_age_min ?? last.median_age_min ?? null,
  };
}

/** 分 → "18 分" / "3 時間 20 分" / "2 日" */
export function fmtAge(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min} 分`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 時間 ${min % 60} 分`;
  return `${Math.floor(h / 24)} 日 ${h % 24} 時間`;
}
