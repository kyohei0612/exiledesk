/**
 * model-types.ts — ジェムコラプトの型と前提の確率 (CorruptParams / 素材と売値 / 経路の結果)
 *
 * 2026-09-21 に model.ts (601 行) から切り出した。中身は変えていない。
 * 外から使う時は今まで通り `./model` から読む (model.ts がまとめて出している)。
 */

export interface CorruptParams {
  /** ヴァールオーブの 4 系統の重み (合計で正規化する) */
  vaalNone: number;
  vaalLevel: number;
  vaalQuality: number;
  vaalSockets: number;
  /** 品質系統の段数 (−3〜+3 なら 7)。23% になるのは最大段 (+3) だけ */
  qualitySteps: number;
  /** コラプトの結晶で破壊される確率 */
  crystalDestroy: number;
  /** 当たりを外した生存品 (レベル −1、ソケット減、品質 21〜22% 等) を「元の値段の何割」で見るか */
  leftoverFraction: number;
}

export const DEFAULT_PARAMS: CorruptParams = {
  vaalNone: 1,
  vaalLevel: 1,
  vaalQuality: 1,
  vaalSockets: 1,
  qualitySteps: 7,
  crystalDestroy: 0.5,
  leftoverFraction: 0.5,
};

/** 素材の単価 (高貴)。null は相場不明 (その経路は計算不可) */
export interface MaterialPrices {
  /** 低レベルのジェム本体 (自作の出発点) */
  baseGem: number | null;
  gcp: number | null;
  perfectJeweller: number | null;
  vaal: number | null;
  crystal: number | null;
  /** 原石 (レベル 20)。スキルジェムかスピリットジェムかで別物 */
  uncut20: number | null;
}

/** 売値 (高貴)。null は未入力 */
export interface SalePrices {
  /** レベル 21 · 品質 20% · コラプト済 */
  level21: number | null;
  /** 品質 23% · コラプト済 (レベル不問) */
  quality23: number | null;
  /** レベル 21 · 品質 23% (完成品) */
  finished: number | null;
}

/**
 * craftPlain = 自作で賭けない (レベル 21 と品質 23% をそのまま売る)。
 * オーナー指示 2026-09-20:「完成品を売るより普通に品質ジェム 23% とプラ 1 ジェムをそれぞれ
 * 売った方が得、も追加して欲しい。全計算に加えて」。craft は結晶を賭けるかを期待値で決めるが、
 * こちらは常に賭けないので、両方並べれば「賭ける価値があるか」が一目で分かる。
 */
export type RouteId = "craft" | "craftPlain" | "buy21" | "buy23" | "buyFinished";

/** 収支の「売れた物」の行 (売値の 3 状態 + 外れの生存品) */
export type SaleSlot = "level21" | "quality23" | "finished" | "other";

export interface OutcomeLine {
  label: string;
  /** この結果になる確率 (0..1) */
  p: number;
  /** この結果の純額 (高貴) = 売値 − この結果で使う原石代 */
  net: number;
  /** 売る時の 1 個の値段 (原石代を引く前)。売らない結果は 0 */
  gross: number;
  /** 収支の「売れた物」のどの行に入るか。null は売らない (破壊 / 原石代の方が高い) */
  sale: SaleSlot | null;
  /** この結果で使う原石 (レベル 20) の数 */
  uncut: number;
  /** この結果の途中で使うコラプトの結晶の数 (確定費用に入っている物は除く。自作で片方当たって賭けた時だけ 1) */
  crystal: number;
  /** この結果になった 1 回の損益 = 売値 − 確定費用 − 結晶 − 原石。finish() で埋める */
  profit: number;
}

export interface RouteResult {
  id: RouteId;
  label: string;
  /** 計算できたか (相場が足りないと false) */
  ok: boolean;
  /** 1 回の試行にかかる確定費用 (高貴) */
  upfront: number;
  /** 1 回の試行の期待純益 = 期待売上 − 期待費用 */
  ev: number;
  /** 完成品 (21 · 23%) になる確率 */
  pFinished: number;
  /** 完成品 1 個を得るための実質コスト = (期待費用 − 完成品以外の期待売上) / pFinished。完成品を買う経路は完成品の価格 */
  costPerFinished: number | null;
  /** 1 回の試行の期待費用 (確定費用 + 結晶と原石の期待費用)。期待売上 = ev + expectedCost */
  expectedCost: number;
  /** 1 回の試行で使うコラプトの結晶の期待本数 (自作は当たった時だけ、買って賭ける経路は 1) */
  expectedCrystals?: number;
  /** 1 回の試行で使う原石 (レベル 20) の期待本数 (売る物にだけ掛かる) */
  expectedUncut?: number;
  /** 内訳 */
  outcomes: OutcomeLine[];
  /** 自作経路で「片方当たり → 結晶で賭ける」を選ぶか (期待値で決めた結果) */
  gambleAfterLevel?: boolean;
  gambleAfterQuality?: boolean;
  /**
   * 「N 回やったら何個できるか」を段ごとに数えるための確率 (2026-09-20)。
   *
   * オーナー指示:「完成品 = 期待値 23% ジェムの個数 = コラプト結晶 23% 個数 → 期待値完成品
   * → できた個数分 20 ジェム追加。プラ 21 はそのまま期待値通りできた個数を 20 ジェム追加。
   * 最終完成品の期待値の個数と 21 ジェムの個数を足したのが 20 ジェム」。
   * 期待値どうしを掛けるのではなく、**できた個数を切り下げてから次に渡す**ので、
   * 1 回あたりの期待値だけでは足りず、段ごとの確率が要る。
   */
  stage?: StageProbs;
  /** 不足している相場 */
  missing: string[];
}

/** 「賭ける前に何が出来上がるか」の確率 (1 回あたり) */
export interface StageProbs {
  /** レベル +1 が出る (= レベル 21 の素体) */
  pLevel21: number;
  /** 品質 23% が出る */
  pQuality23: number;
  /** どちらも外れ */
  pJunk: number;
  /** レベル 21 に結晶を使うか / 使った時の当たり (品質 23% になる) 確率 */
  gambleLevel21: boolean;
  hitFromLevel21: number;
  /** 品質 23% に結晶を使うか / 使った時の当たり (レベル +1 になる) 確率 */
  gambleQuality23: boolean;
  hitFromQuality23: number;
  /** 結晶で壊れずに残る確率 */
  survive: number;
  /**
   * 1 個売るのに原石 (レベル 20) が要るか。経路で違う
   * (自作の完成品と 21 は要る / 買った 21 は既に 21 なので要らない /
   *  品質 23% はレベル不問で売るので要らない)。
   */
  uncutForFinished: boolean;
  uncutForLevel21: boolean;
  /**
   * 品質 23% を売るのにも原石が要るか。
   * オーナー指示 2026-09-20:「基本的に 23% ジェムは 20 ジェム使うようにしてくれ、
   * 今までのも含めて全部」。買った 23% (buy23 経路) は元から持っている物なので要らない。
   */
  uncutForQuality23: boolean;
}
