/**
 * auto-solve.ts — ④ の「順番だけ自動」の計算の入口 (解析君、2026-10-20。設計 = 共有メモ auto-order-design.md の手 1)。
 *
 * 順番 1 つ (④ の simOrder のキー) について、⑤ を各場面で一番安い手で打った時の「始め 1 個から完成まで」の平均費用と完成の割合を
 * 動的計画法 (方策の繰り返し) で出す。⑤・⑥ と同じ決まり: まだの関門より後ろの狙いは外れに見える、関門ごとの打ち止め (GATE_CAPS)。
 * 形・手・重みは auto-model.ts・auto-actions.ts (重みはエンジンの modTierWeight と段の下限から)。
 *
 * この型はシミュ部長の auto-order.ts・ワーカーが使う。変える時は共有メモ auto-order-api.md に書いて知らせる。
 */
import type { QuizSimIn } from "../quiz-build";
import type { AutoModel } from "./auto-model";

/** 計算の入力。sim は ⑤ に渡す物と同じ (order は見ない、順番は solveOrder に渡す)。値段は runQuiz と同じ (キー → 高貴建て) */
export interface AutoInput {
  sim: QuizSimIn;
  price: (key: string) => number;
}

/** buildAutoModel の結果。対応外 (範囲外の組み合わせ) は reason を画面にそのまま出す (日本語・英語 1 行) */
export type AutoBuilt = { ok: true; model: AutoModel } | { ok: false; reason: { ja: string; en: string } };

/** 順番 1 つの計算結果。費用はどれも高貴建て */
export interface OrderResult {
  /** 始め 1 個を買った後、完成か打ち止めまでの 1 人あたりの平均費用 (作り直しの始めの代金込み、最初の 1 個の代金 R は除く) */
  cost: number;
  /** 完成の割合 (0〜1)。止まる = 堂々巡りで二度と届かない形、mc ありなら関門の累計の打ち止めも */
  finish: number;
  /** 始め 1 個の代金 (= 作り直しの費用) */
  R: number;
  /** 並べ方の点数: 完成 1 個あたり = (R + cost) ÷ finish − R (finish = 0 なら Infinity)。安い順に並べる */
  perFinish: number;
  /** mc 人数 (0 = 値だけ) */
  mc: number;
  /** 計算にかかった時間 (ミリ秒) */
  ms: number;
}

export interface SolveOpts {
  /** 計算の中で 1 人ずつたどる人数 (関門の累計の打ち止めつき)。0 か省略 = 値だけ (速い) */
  mc?: number;
  /** mc の乱数の種 (mulberry32) */
  seed?: number;
}

export type { AutoModel } from "./auto-model";
/** 画面の側 (s.data がある所) で 1 回。model は構造化複製できる素の物 (ワーカーへ postMessage で渡す)。重みも値段も中に入れてある */
export { buildAutoModel } from "./auto-model";

/**
 * 順番 1 つの費用 (ワーカーの中で何回も。model だけで閉じる、エンジンのデータは読まない)。order = ④ の simOrder のキー ("mod:<id>"・"rest:frac"・"rest:<id>"・"rune:<名前>")。
 * 並べない行 (ルーン・増強スパム・フラクチャー済み) は入っていても無視する。model に無いキーも無視
 */
export function solveOrder(model: AutoModel, order: readonly string[], opts: SolveOpts = {}): OrderResult {
  void model; void order; void opts;
  throw new Error("solveOrder: まだ作っている途中");
}
