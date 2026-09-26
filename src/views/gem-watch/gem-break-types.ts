/**
 * gem-break-types.ts — 使用率ランキングの取得結果の型 (Rust 側 gem_break.rs と同じ形)
 *
 * GemBreak.vue から切り出し (2026-09-26)。
 */
export interface Row {
  name: string;
  users: number;
  lvl21: number;
  q23: number;
  both: number;
  max_level: number;
  max_quality: number;
  /** コラプト済みで使っていた人数 */
  corrupted: number;
  /** [レベル, 人数] 昇順 */
  level_dist: [number, number][];
  /** [品質, 人数] 昇順 */
  quality_dist: [number, number][];
}
export interface Result {
  class: string;
  classes?: string[];
  percentage: number;
  characters: number;
  /** そのうちキャッシュ / 同梱データから流用した人数 */
  reused?: number;
  requested?: number;
  cancelled?: boolean;
  league: string;
  snapshot: string;
  fetched_at: number;
  rows: Row[];
}
/** 取得の進み具合 (gem-break-progress) */
export interface Progress {
  phase: string;
  done: number;
  total: number;
  reused?: number;
}
