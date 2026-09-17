/**
 * market-flow.ts — 捌き速度 (2026-09-16)
 *
 * Rust 側 (src-tauri/src/market_flow.rs) が出品 1 件ずつを ID で追った記録から、
 * 「この商品はどれくらいで売れるのか」を出す。ジェム専用ではなく、trade2 のクエリを
 * 渡して登録した銘柄なら何でも同じ仕組みで測れる。
 *
 * ## 測り方
 * 追跡中の出品には 2 種類ある:
 *   - 消えた物   … 寿命 = 消えた時刻 − 出品時刻 (売れたか取り下げたか)
 *   - まだある物 … 「少なくとも今の齢までは売れていない」という情報
 * これを「1 日以内に売れた割合」「2 日以内に売れた割合」に直して判定する。
 *   割合 = (その時間内に消えた件数) ÷ (その時間の時点で結果が分かっている件数)
 *   まだ生きていて齢がその時間に届いていない物は「結果不明」として母数から外す。
 *
 * 以前は生存分析 (Kaplan-Meier) の中央値を使っていたが、実データで中央値 0.3 時間 (実際は
 * 4 時間) のような値が出た。出品直後に捕まえた品ほど早く消えるため、早い時刻では母数が
 * 数件しかなく、生存率が一気に落ちて中央値がそこで確定してしまう (左側切断の小標本問題)。
 * 割合ベースなら母数がはっきりしていて壊れない。
 *
 * ## 判定 (オーナー指示 2026-09-16)
 *   1 日以内に半分売れる → 速い / 2 日以内に半分売れる → 普通 / それ以下 → 遅い
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
  /** 出品者のアカウント名 */
  account?: string | null;
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
  /** 今の自動リストに入っている (1 時間ごとの巡回で取る)。manual と両方 true もあり得る */
  auto?: boolean;
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
  /** 出品者のアカウント名 (同じ人のまとめ出しを見分ける。2026-09-17) */
  account?: string | null;
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
  retry_at: number;
  slice: number;
  slices: number;
  slice_done: number;
  /** 1 度でも取れた自動銘柄の数 (1 周目の進捗) */
  sampled_watches: number;
  /** 検索から消えていて、まだ直接照会で決着していない出品の数 */
  pending_missing: number;
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

/**
 * 手で取った結果を同じ記録に差し込む (ジェムコラプトの「再取得」)。
 *
 * 戻り値は「search の一覧に載らなかった追跡中の ID」。出品が 100 件を超えると
 * search は安い順 100 件しか返さないので、これらは直接 fetch しないと生死が分からない。
 * 呼び出し側で checkListingsAlive → confirmFlow まで繋ぐ (2026-09-17)。
 */
export async function recordFlow(sample: { key: string; label?: string; total: number; ids: string[]; entries: ListingRef[]}): Promise<string[]> {
  if (!isTauriRuntime()) return [];
  try {
    return (await invoke<string[]>("market_flow_record", { req: sample })) ?? [];
  } catch {
    /* 記録できなくても価格表示には影響しない */
    return [];
  }
}

/** 直接 fetch した結果 (実在した ID) を記録に反映する */
export async function confirmFlow(key: string, checked: string[], alive: string[]): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await invoke("market_flow_confirm", { req: { key, checked, alive } });
  } catch {
    /* 確認できなければ次の取得でまた試す */
  }
}

export type FlowTone = "fast" | "normal" | "slow" | "unknown";

export interface FlowSummary {
  /** "速い" / "普通" / "遅い" / "" ((暫定) 付きは売れ残りを 1 件も観測できていない) */
  label: string;
  tone: FlowTone;
  /** 売れ残りを 1 件も観測できていない = 率が 100% にしかならない状態 (2026-09-17) */
  provisional: boolean;
  /** 消えた出品の寿命の中央値 (分)。参考表示用 */
  medianMin: number | null;
  /** 1 日 / 2 日以内に売れた割合 (0-1)。結果が分かっている件数に対する割合 */
  soldIn24h: number | null;
  soldIn48h: number | null;
  /** その割合の分母 (結果が分かっている件数) と分子 */
  known24: number;
  hit24: number;
  known48: number;
  hit48: number;
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

const EMPTY_SUMMARY: FlowSummary = {
  label: "",
  tone: "unknown",
  provisional: false,
  medianMin: null,
  soldIn24h: null,
  soldIn48h: null,
  known24: 0,
  hit24: 0,
  known48: 0,
  hit48: 0,
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
 * ある時間内に売れた割合。
 * 分母は「その時間の時点で結果が分かっている出品」= その時間内に消えた物 + 齢がその時間を
 * 超えた物 (消えた物もまだある物も)。まだ齢が足りない物は数えない。
 */
export function soldWithin(
  records: { life: number; gone: boolean }[],
  windowSecs: number,
): { hit: number; known: number; rate: number | null } {
  let hit = 0;
  let known = 0;
  for (const r of records) {
    if (r.gone) {
      known++;
      if (r.life <= windowSecs) hit++;
    } else if (r.life >= windowSecs) {
      known++; // 生きたままその時間を超えた = 売れなかったと確定
    }
  }
  return { hit, known, rate: known > 0 ? hit / known : null };
}

/** 判定に要る最低の母数 */
const MIN_KNOWN = 3;

/** 追跡記録から捌き速度を出す */
export function summarizeFlow(state: WatchState | undefined, nowSec: number = Math.floor(Date.now() / 1000)): FlowSummary {
  if (!state || !Array.isArray(state.tracked)) return EMPTY_SUMMARY;

  const records: { life: number; gone: boolean }[] = [];
  const goneLives: number[] = [];
  const aliveAges: number[] = [];
  let stale = 0;
  const stalePrices: number[] = [];
  const allPrices: number[] = [];
  for (const t of state.tracked) {
    const start = t.listed_at ?? t.first_seen;
    const life = Math.max(60, (t.gone_at ?? nowSec) - start);
    const gone = !!t.gone_at;
    records.push({ life, gone });
    if (gone) goneLives.push(life);
    else {
      aliveAges.push(life);
      if (life >= NORMAL_SECS) {
        stale++;
        if (t.amount != null) stalePrices.push(t.amount);
      }
    }
    if (t.amount != null) allPrices.push(t.amount);
  }
  if (records.length === 0) {
    return { ...EMPTY_SUMMARY, total: state.total ?? null, lastAt: state.sampled_at || null };
  }

  const d1 = soldWithin(records, FAST_SECS);
  const d2 = soldWithin(records, NORMAL_SECS);

  // 値段不相応の目安: 2 日以上残っている出品は、最安の何倍で出しているか
  const cheapest = allPrices.length > 0 ? Math.min(...allPrices) : null;
  const staleAvg = stalePrices.length > 0 ? stalePrices.reduce((a, b) => a + b, 0) / stalePrices.length : null;
  const staleRatio = cheapest != null && cheapest > 0 && staleAvg != null ? staleAvg / cheapest : null;

  // 「売れなかった」を 1 件も観測できていないうちは、母数が売れた分だけになるので
  // 必ず 100% になる。判定は出すが (暫定) を付けて、鵜呑みにしないようにする (2026-09-17 全点検)
  const censored24 = records.some((r) => !r.gone && r.life >= FAST_SECS);
  const censored48 = records.some((r) => !r.gone && r.life >= NORMAL_SECS);

  let tone: FlowTone = "unknown";
  let label = "";
  let provisional = false;
  if (d1.known >= MIN_KNOWN && (d1.rate ?? 0) >= 0.5) {
    tone = "fast";
    provisional = !censored24 && d1.hit === d1.known;
    label = provisional ? "速い (暫定)" : "速い";
  } else if (d2.known >= MIN_KNOWN) {
    if ((d2.rate ?? 0) >= 0.5) {
      tone = "normal";
      provisional = !censored48 && d2.hit === d2.known;
      label = provisional ? "普通 (暫定)" : "普通";
    } else {
      tone = "slow";
      label = "遅い";
    }
  }
  const enough = label !== "";

  // まだ判定できない時の目安: 2 日の母数が 3 件になるのはいつか
  aliveAges.sort((a, b) => b - a);
  const need = MIN_KNOWN - d2.known;
  let etaSecs: number | null = null;
  if (!enough && need > 0 && aliveAges.length >= need) {
    etaSecs = Math.max(0, NORMAL_SECS - aliveAges[need - 1]);
  }

  goneLives.sort((a, b) => a - b);
  const median = goneLives.length > 0 ? goneLives[Math.floor(goneLives.length / 2)] : null;

  return {
    label,
    tone,
    provisional,
    medianMin: median != null ? Math.round(median / 60) : null,
    soldIn24h: d1.rate,
    soldIn48h: d2.rate,
    known24: d1.known,
    hit24: d1.hit,
    known48: d2.known,
    hit48: d2.hit,
    gone: goneLives.length,
    alive: aliveAges.length,
    total: state.total ?? null,
    lastAt: state.sampled_at || null,
    enough,
    stale,
    staleRatio,
    oldestMin: aliveAges.length > 0 ? Math.round(aliveAges[0] / 60) : null,
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
