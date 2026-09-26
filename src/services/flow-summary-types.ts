/**
 * flow-summary-types.ts — 捌き速度の判定結果の型と、判定の基準 (時間・最低の母数)
 *
 * flow-summary.ts から切り出し (2026-09-26)。呼ぶ側は今まで通り market-flow / flow-summary から取れる。
 */
export type FlowTone = "fast" | "normal" | "slow" | "unknown";

export interface FlowSummary {
  /** "速い" / "普通" / "遅い" / "" (母数不足) */
  label: string;
  tone: FlowTone;
  /** まだ並んでいる出品のうち、表示している「売れるまでの時間」より長く並んでいる件数 */
  olderThanMedian: number;
  /** 7 日売れずに打ち切った件数 (日次集計から。中央値には入らない) */
  droppedUnsold: number;
  /** 最安帯から沈んで追跡をやめた件数 (売れたかは分からないので売れ残りとは分ける) */
  droppedBuried: number;
  /** 一覧から 1 回だけ消えた確定待ちの件数 (売れたにも並んでいるにも数えない) */
  pending: number;
  /** 消えたが売れたと言えない件数 (出品時刻か出品者が不明) */
  unknown: number;
  /** 売れた出品の値段 (出品時の通貨のまま)。実売の中央値 (期待値の売値) の計算に使う */
  soldPrices: { amount: number; currency: string }[];
  /** 出品が 100 件を超えていて「消えた」を判定できない状態か */
  truncated: boolean;
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
  /**
   * 判定は出ているが、根拠の売れた件数が MIN_KNOWN (3 件) に届いていない。
   *
   * 2026-09-19 のオーナー指示「1 件でも短時間で売れたら一応早いんじゃないの?」で、
   * 6 時間以内に売れた実績が 1 件でもあれば「速い」と言うようにした。文には
   * 「1 件だけで出した判定です」と書いていたが、一覧で見えるのは札だけなので、
   * 3 件以上で出した判定と区別が付かなかった (2026-09-20)。札に印を付けるために出す。
   */
  thin: boolean;
  /**
   * この銘柄をまだ 1 回しか見ていない (初回の取得)。
   *
   * 2026-09-19 オーナー「初回の時遅いって出るけど、初回だから次回更新時判断ってやつ追加しなきゃね」:
   * 「2 日以上並んでいる」は出品時刻から初回でも分かるので、古い在庫が並んでいる銘柄は
   * 1 回目でいきなり「遅い」になっていた。こちらはまだ市場の動きを一度も見ていないのに。
   */
  firstLook: boolean;
  /** 48 時間以上売れ残っている件数と、その最安に対する値段の倍率 (値段不相応の目安) */
  stale: number;
  staleRatio: number | null;
  /** まだ売れていない出品のうち一番古い物の齢 (分) */
  oldestMin: number | null;
  /** 判定が出せるまでの目安 (分)。売れ残りが 48 時間に届くまで。判定済みなら null */
  etaMin: number | null;
}

export const HOUR = 3600;
/** オーナー指示: 24 時間以内=速い / 48 時間以内=普通 / それ以降=遅い */
export const FAST_SECS = 24 * HOUR;
export const NORMAL_SECS = 48 * HOUR;

export const EMPTY_SUMMARY: FlowSummary = {
  label: "",
  tone: "unknown",
  olderThanMedian: 0,
  droppedUnsold: 0,
  droppedBuried: 0,
  pending: 0,
  unknown: 0,
  soldPrices: [],
  truncated: false,
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
  thin: false,
  firstLook: false,
  stale: 0,
  staleRatio: null,
  oldestMin: null,
  etaMin: null,
};

/** 判定に要る最低の母数 */
export const MIN_KNOWN = 3;
