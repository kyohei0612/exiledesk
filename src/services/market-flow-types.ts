/**
 * market-flow-types.ts — 捌き速度の記録の型 (Rust 側 market_flow.rs と同じ形)
 *
 * market-flow.ts から切り出し (2026-09-26)。呼ぶ側は今まで通り market-flow から取れる。
 */
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
  /** 消えたのと同時に同じ出品者が並べ直した = 値段の付け替え。売れた件数には数えない */
  relisted?: boolean;
  /** 一覧から 1 回だけ消えている (確定待ち) 時の、最初に消えた時刻。2 回続けて居なければ売れた (2026-09-26) */
  missing_since?: number | null;
  /** 消えたが出品時刻か出品者が分からず、売れたとも付け替えとも言えない (2026-09-26)。売れた件数に数えない */
  unknown?: boolean;
}
export interface Daily {
  day: number;
  added: number;
  gone: number;
  survived: number;
  /** 最安帯から沈んで追うのをやめた件数 (売れたかは不明) */
  buried?: number;
  total_avg: number;
  samples: number;
}
export interface WatchState {
  tracked: Tracked[];
  daily: Daily[];
  total: number;
  sampled_at: number;
  /** 直近のサンプルで ID 一覧が全部取れていたか (false = 出品 100 件超で判定できない) */
  list_complete?: boolean;
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
  /** 今の自動リストに入っている (周期ごとの一括取得で取る)。manual と両方 true もあり得る */
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

export interface FlowStatus {
  /** 取得中か (自動か手動のどちらか) */
  sampling: boolean;
  /** 手動の一括が走っているか */
  manual_sampling: boolean;
  /** 自動巡回が走っているか。他の取得ボタンはこれを見て押せなくする (2026-09-20) */
  auto_sampling: boolean;
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
  /** 取り直しを待っている銘柄数 (429 / 通信で取れなかった分) */
  retry_keys: number;
  /** 今の 1 巡で取り終わった銘柄数 (自動巡回は周期をかけて回る) */
  sweep_done: number;
  /** 今の送信間隔 (秒)。自動巡回は 周期 ÷ 本数 で薄く流す */
  pace_secs: number;
  /** 1 度でも取れた自動銘柄の数 (1 周目の進捗) */
  sampled_watches: number;
  /** 今の 1 巡の周期 (秒)。画面の設定で変えられる。無効なら -1 */
  cycle_secs: number;
  /** 自動取得しない設定か */
  auto_off: boolean;
  /** 直前の 1 巡で取れなかった銘柄数 (取り直しを諦めた後も残る) */
  last_failed: number;
  /** 最後に全銘柄を 1 巡した時刻 (手動の一括取得を含む)。次の自動取得はここから周期ぶん後 */
  swept_at: number;
  /** レート制限の規則 (x-rate-limit-ip) */
  rate_rules: string | null;
  /** 次の 1 本を投げられる時刻 (unix 秒)。**止まりではなく順番待ち** */
  wait_until: number;
  /** 5 分あたり全窓口あわせて何回使ったか / 今の上限 (画面の「5 分で n/N 回」) */
  budget_used: number;
  budget_max: number;
}

/** 記録と今の検索結果を突き合わせた結果 */
export interface VerifyResult {
  total: number;
  ids: number;
  tracked: number;
  matched: number;
  missing: string[];
  untracked: number;
}
