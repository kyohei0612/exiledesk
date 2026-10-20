/**
 * auto-types.ts — 「順番だけ自動」の計算 (auto-model・auto-solve・auto-actions・auto-engine・auto-rules・auto-linear、解析君) と、
 * 呼ぶ側 (auto-order.ts・auto-order.worker.ts・画面、シミュ部長) の間の型だけの 1 枚 (2026-10-20 R1)。
 * 呼ぶ側は型をここから、関数は auto-model.ts の buildAutoModel・auto-solve.ts の solveOrder / orderDetail・auto-rules.ts から直に読む
 * (auto-solve の buildAutoModel の再輸出は使わない。ワーカーに再輸出の連鎖を作らない)。形を変える時は開発部長に先に 1 行
 */
import type { QuizSimIn } from "../quiz-build";
import type { QuizSlot } from "../quiz-recipe";

/** 形 (auto-actions.ts の頭に中身): [固定の候補, 札ごとの状態…, プレの外れ, サフィの外れ, 冒涜の印] */
export type State = number[];

/** 重みの等級: 高貴・カオスの 普通 / 上級 / 完全 (a0〜a2)、骨の 保存 / 古代 (b0・b4) */
export type Grade = "a0" | "a1" | "a2" | "b0" | "b4";
/** 置き場の 1 つの MOD: 系統 (番号)、全部の重み、札の候補なら札ごとの当たり・段が低い重み、冒涜専用か */
export interface MCand { fams: number[]; w: number; ex: boolean; refs: Array<{ k: number; m: number; hit: number; low: number }> }
/** 札 (フラクチャー以外)。members の m 番目が付いたら fams[m] を塞ぐ。ess = 完璧なエッセンスの鍵 (エッセンスの札だけ) */
export interface MSlot { id: string; side: 0 | 1; kind: QuizSlot["kind"]; members: Array<{ modId: string; fams: number[]; ess: string | null }>; group: number; cap: number }

/** 計算の材料 (組み立て済み、構造化複製できる素の物)。中身は auto-model・auto-actions・auto-solve だけが見る */
export interface AutoModel {
  /** 並べる行のキー (④ の simOrder のうち自動で並べる物: "mod:<id>"・"rest:frac"・"rest:<id>") */
  keys: string[];
  /** 始め 1 個の代金 (高貴建て) */
  R: number;
  /** 始めに入っていないルーンの代金 (1 本ごと、⑤ の最初に差す) */
  runeCost: number;
  /** 狙いに要るルーン (英語の名前)。始めに無い物は ⑤ の最初に差す (auto-rules) */
  runes: string[];
  /** 側ごとの枠 [プレ, サフィ] */
  cap: [number, number];
  slots: MSlot[];
  /** キー → 札の番号 */
  keyIds: Record<string, number[]>;
  /** フラクチャーの側と、固定された候補ごとの割合・塞ぐ系統 */
  frac: { side: 0 | 1; picks: Array<{ p: number; fams: number[]; modId: string }> };
  /** 等級 → [プレの置き場, サフィの置き場]。使えない等級 (アイテムレベルが足りない) は無い */
  pools: Partial<Record<Grade, [MCand[], MCand[]]>>;
  /** 値段 (高貴建て)。0 以下・無い物はその手を使わない (発現は 0 でよい) */
  prices: Record<string, number>;
  /** 発現の冒涜専用 MOD の個数 1 / 2 / 3 の割合 (エンジンの DESECRATION_EXCLUSIVE_COUNT) */
  exRates: number[];
  /** 発現の候補の数 (エンジンの REVEAL_SPEC) */
  offers: number;
  /** 始めの形の分かれ方 [割合, 形] (⑤ の始めのアイテムの作り方を stepOutcomes でたどった物、auto-engine の startStates) */
  starts: Array<[number, number[]]>;
  /** 消去・光・骨・完璧なエッセンスの行き先の表 (形の中身の鍵 → 手の名前 → [p, 差分…] の並び)。build の時に stepOutcomes で作る (auto-engine.ts) */
  eng: Record<string, Record<string, number[][]>>;
  /**
   * 両側の「どれか」がある時 (K6): ⑤ の route ごとの model (その札を側の候補だけにした狙いで組んだ物)。
   * ⑤ は札が付くまで 1 つ目の route (prefix) で打つので、この model 自身は routes[0] の写し (solveOrder はそのまま 1 つ目を解く)
   */
  routes?: Array<{ id: string; model: AutoModel }>;
  /** 形の版 (中身を変えたら上げる。ワーカーの持つ写しの見分け) */
  version: 3;
}

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

/** 計算の中身 (確かめの台本用): 見えている形ごとの最善手と、本当の形の評価 */
export interface OrderDetail {
  result: OrderResult;
  /** 関門 (札の番号) */
  gates: number[];
  /** 見えている形ごと: 形・最善手の名前 (restart = 作り直し)・値・mc で通った回数 */
  view: Array<{ s: State; act: string; V: number; visits: number }>;
  /** 本当の形で、方策の手がその形で打てなかった数 (0 が正しい) */
  bad: number;
  /** 止まる (完成にも作り直しにも届かない) 本当の形の数 */
  stuck: number;
  /** 見えている形・本当の形の数と、方策の繰り返しの回数 + 本当の形の評価 (2)、表 (model.eng) に無かった形を引いた数 (今までの累計、0 が正しい) */
  size: { view: number; true: number; sweeps: number; miss: number };
}
