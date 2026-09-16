/**
 * gem-flow.ts — ジェムの売れ行き (2026-09-16)
 *
 * Rust 側 (src-tauri/src/gem_flow.rs) が 1 時間ごとに記録した
 * 「出品総数」と「今並んでいる出品の滞留時間 (中央値)」を読んで、表示用にまとめる。
 *
 * 追跡対象はクラフト選定ジェム (全アセンダンシー) で完成品 5 人以上だったジェム。
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../utils/isTauriRuntime";

export interface FlowSample {
  t: number;
  total: number;
  median_age_min: number | null;
  seen: number;
  cheapest_amount: number | null;
  cheapest_currency: string | null;
}
export interface TrackedGem {
  name: string;
  finished_users: number;
  users: number;
}
export interface GemFlowStore {
  sampled_at: number;
  list_refreshed_at: number;
  league: string;
  site: string;
  gems: TrackedGem[];
  samples: Record<string, FlowSample[]>;
}

const EMPTY: GemFlowStore = { sampled_at: 0, list_refreshed_at: 0, league: "", site: "", gems: [], samples: {} };

export async function loadGemFlow(): Promise<GemFlowStore> {
  if (!isTauriRuntime()) return EMPTY;
  try {
    return await invoke<GemFlowStore>("gem_flow_load");
  } catch {
    return EMPTY;
  }
}

/** 追跡リストを入れ替える (クラフト選定ジェムの取得後に呼ぶ) */
export async function setTrackedGems(gems: TrackedGem[], league: string, site: string): Promise<void> {
  if (!isTauriRuntime() || !league) return;
  try {
    await invoke("gem_flow_set_tracked", { req: { gems, league, site } });
  } catch {
    /* 失敗しても本体の表示には影響しない */
  }
}

/** 手で取った結果を同じ履歴に差し込む (ジェムコラプトの「再取得」から) */
export async function recordGemFlow(sample: {
  name: string;
  total: number;
  median_age_min: number | null;
  seen: number;
  cheapest_amount: number | null;
  cheapest_currency: string | null;
}): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await invoke("gem_flow_record", { req: sample });
  } catch {
    /* 記録できなくても価格表示には影響しない */
  }
}

/** 今すぐ 1 周サンプルを取る (手動) */
export async function sampleGemFlowNow(): Promise<GemFlowStore> {
  if (!isTauriRuntime()) return EMPTY;
  return await invoke<GemFlowStore>("gem_flow_sample_now");
}

export type FlowTone = "fast" | "normal" | "slow" | "unknown";

export interface FlowSummary {
  /** "速い" / "普通" / "遅い" / "" */
  label: string;
  tone: FlowTone;
  /** 今並んでいる出品の滞留時間の中央値 (分) */
  medianAge: number | null;
  /** 直近の出品総数 */
  totalNow: number | null;
  /** 24 時間前 (取れなければ最古) との差 */
  totalDelta: number | null;
  /** スパークライン用の出品総数の並び */
  spark: number[];
  /** サンプル数 */
  count: number;
  /** 最後に取った時刻 (unix 秒) */
  lastAt: number | null;
}

/** 滞留時間から「さばきの速さ」を決める。1 時間以内に入れ替わるなら速い */
const FAST_MIN = 60;
const SLOW_MIN = 360;

export function summarizeFlow(samples: FlowSample[] | undefined): FlowSummary {
  const list = samples ?? [];
  if (list.length === 0) {
    return { label: "", tone: "unknown", medianAge: null, totalNow: null, totalDelta: null, spark: [], count: 0, lastAt: null };
  }
  const last = list[list.length - 1];
  const spark = list.map((s) => s.total);
  // 24 時間前 (= 24 サンプル前) との比較。足りなければ一番古い物と比べる
  const base = list[Math.max(0, list.length - 25)];
  const medianAge = last.median_age_min;
  let tone: FlowTone = "unknown";
  let label = "";
  if (medianAge != null) {
    if (medianAge <= FAST_MIN) {
      tone = "fast";
      label = "速い";
    } else if (medianAge <= SLOW_MIN) {
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
    medianAge,
    totalNow: last.total,
    totalDelta: list.length > 1 ? last.total - base.total : null,
    spark,
    count: list.length,
    lastAt: last.t,
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
