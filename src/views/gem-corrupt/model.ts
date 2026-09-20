/**
 * ジェムコラプト収支 — 期待値モデル (純粋関数、UI 非依存) 2026-09-12
 *
 * 目的: 「レベル 21 · 品質 23% のコラプト済みジェム」を手に入れる 4 つの経路の期待値を比べる。
 *   A. 自作: 低レベルジェム → 宝石細工師のプリズム ×4 (品質 20%) → 宝飾職人のオーブ (完全) (5 ソケット)
 *          → ヴァールオーブ → 片方だけ当たったらコラプトの結晶で残りを賭ける (賭けない選択も可)
 *          → 生き残った物だけ原石 (レベル 20) でレベル 20 にする (コラプトの +1 で 21)
 *   B. レベル 21 (品質 20%) を買ってコラプトの結晶で品質 23% を賭ける
 *   C. 品質 23% (レベルは不問) を買ってコラプトの結晶でレベル +1 を賭ける
 *      → 生き残った物は結晶の後に原石 (レベル 20) で上げてから売る
 *        (2026-09-15 オーナー指摘: 原石代が抜けていて収支が合わなかった)
 *   D. 完成品をそのまま買う (基準)
 *
 * 期待費用 / 期待売上 / 期待収支 / 実質コストは結果の内訳 (OutcomeLine) から finish() で一度に出す (2026-09-15)。
 *   期待費用 = 確定費用 + 結晶の期待費用 + 原石の期待費用
 *   期待売上 = Σ 確率 × 売値 (原石代を引く前)
 * 以前は原石代を売上から引いていたため、素材表の合計・N 回の表・収支の帳簿で費用の中身が食い違い、
 * 実質コストには完成品に使う原石が入っていなかった。
 *
 * 確率は GGG 非公開。既定値はコミュニティの推定で、UI から全て変更できる (CorruptParams)。
 *   ヴァールオーブ: 変化なし / レベル ±1 / 品質 −3〜+3 (7 段階均等) / ソケット ±1 の 4 系統を等確率
 *   コラプトの結晶: 50% で破壊、生き残れば「まだ振っていない系統」を振り直す
 *                   (レベル系統は ±1 で半々、品質系統は 0 を除く 6 段階均等)
 * 金額は全て高貴 (Exalted) 建て。
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

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

function normalizedVaal(p: CorruptParams): { none: number; level: number; quality: number; sockets: number } {
  const w = [p.vaalNone, p.vaalLevel, p.vaalQuality, p.vaalSockets].map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sum = w[0] + w[1] + w[2] + w[3];
  if (sum <= 0) return { none: 0.25, level: 0.25, quality: 0.25, sockets: 0.25 };
  return { none: w[0] / sum, level: w[1] / sum, quality: w[2] / sum, sockets: w[3] / sum };
}

/**
 * コラプトの結晶を「品質系統がまだ」の状態 (レベル 21) に使った時の当たり確率。
 * 生存 × 品質段のうち最大段 (0 を除く qualitySteps−1 段の 1 つ)。
 */
function crystalHitQuality(p: CorruptParams): number {
  const steps = Math.max(2, Math.round(p.qualitySteps)) - 1;
  return (1 - clamp01(p.crystalDestroy)) / steps;
}
/** コラプトの結晶を「レベル系統がまだ」の状態 (品質 23%) に使った時の当たり確率 (生存 × 半々) */
function crystalHitLevel(p: CorruptParams): number {
  return (1 - clamp01(p.crystalDestroy)) / 2;
}

/** 売らない結果 (破壊など) */
function lostLine(label: string, p: number, crystal = 0): OutcomeLine {
  return { label, p, net: 0, gross: 0, sale: null, uncut: 0, crystal, profit: 0 };
}
/** 原石でレベル 20 にしてから売る結果。原石代の方が高ければ売らない (原石も使わない) */
function leveledSaleLine(label: string, p: number, price: number, sale: SaleSlot, uncut: number, crystal = 0): OutcomeLine {
  return price > uncut ? { label, p, net: price - uncut, gross: price, sale, uncut: 1, crystal, profit: 0 } : lostLine(label, p, crystal);
}
/** そのまま売る結果 (原石なし) */
function saleLine(label: string, p: number, price: number, sale: SaleSlot): OutcomeLine {
  return price > 0 ? { label, p, net: price, gross: price, sale, uncut: 0, crystal: 0, profit: 0 } : lostLine(label, p);
}

/**
 * 内訳から期待費用 / 期待収支 / 完成率 / 実質コスト / 結果ごとの 1 回の損益を出す。
 * 結晶は確定費用に入っている物 (買って賭ける経路) と、結果の途中で払う物 (OutcomeLine.crystal、自作) を分ける。
 */
function finish(
  base: RouteResult,
  upfront: number,
  crystalPrice: number,
  uncutPrice: number,
  outcomes: OutcomeLine[],
  extra: Partial<RouteResult>,
): RouteResult {
  let revenue = 0;
  let salvage = 0;
  let pFinished = 0;
  let expectedUncut = 0;
  let expectedCrystals = 0;
  for (const o of outcomes) {
    revenue += o.p * o.gross;
    expectedUncut += o.p * o.uncut;
    expectedCrystals += o.p * o.crystal;
    if (o.sale === "finished") pFinished += o.p;
    else salvage += o.p * o.gross;
  }
  const expectedCost = upfront + expectedCrystals * crystalPrice + expectedUncut * uncutPrice;
  return {
    ...base,
    ok: true,
    upfront,
    ev: revenue - expectedCost,
    pFinished,
    costPerFinished: pFinished > 0 ? (expectedCost - salvage) / pFinished : null,
    expectedCost,
    expectedCrystals,
    expectedUncut,
    outcomes: outcomes.map((o) => ({ ...o, profit: o.gross - upfront - o.crystal * crystalPrice - o.uncut * uncutPrice })),
    ...extra,
  };
}

/**
 * 自作経路。ヴァールの結果ごとに「止める / 結晶で賭ける」の良い方を採る。
 * 原石代は「売る物」にだけ掛かる (壊れた物・売らない物には掛からない)。
 */
function craftRoute(m: MaterialPrices, s: SalePrices, p: CorruptParams, plain = false): RouteResult {
  const missing: string[] = [];
  if (m.baseGem == null) missing.push("低レベルジェム");
  if (m.gcp == null) missing.push("宝石細工師のプリズム");
  if (m.perfectJeweller == null) missing.push("宝飾職人のオーブ (完全)");
  if (m.vaal == null) missing.push("ヴァールオーブ");
  if (m.uncut20 == null) missing.push("原石 (レベル 20)");
  if (s.level21 == null) missing.push("売値: レベル 21");
  if (s.quality23 == null) missing.push("売値: 品質 23%");
  if (s.finished == null) missing.push("売値: 完成品");
  const base: RouteResult = {
    id: plain ? "craftPlain" : "craft",
    label: plain ? "自作 (賭けずにそのまま売る)" : "自作 (ヴァール → 結晶)",
    ok: false,
    upfront: 0,
    ev: 0,
    pFinished: 0,
    costPerFinished: null,
    expectedCost: 0,
    outcomes: [],
    missing,
  };
  if (missing.length > 0) return base;
  const baseGem = m.baseGem!;
  const gcp = m.gcp!;
  const pj = m.perfectJeweller!;
  const vaal = m.vaal!;
  const uncut = m.uncut20!;
  const s21 = s.level21!;
  const s23 = s.quality23!;
  const sF = s.finished!;
  const crystal = m.crystal;
  const lf = clamp01(p.leftoverFraction);
  const v = normalizedVaal(p);
  const steps = Math.max(2, Math.round(p.qualitySteps));
  const survive = 1 - clamp01(p.crystalDestroy);

  const upfront = baseGem + 4 * gcp + pj + vaal;
  /** 原石でレベルを上げて売った時の純額 (原石代の方が高ければ売らないので 0) */
  const sell = (price: number): number => Math.max(0, price - uncut);

  // レベル +1 が出た後: 止める (21 として売る) か、結晶で品質を賭けるか
  const hitQ = crystalHitQuality(p);
  const gambleAfterLevel =
    !plain && crystal != null && -crystal + hitQ * sell(sF) + (survive - hitQ) * sell(lf * s21) > sell(s21);

  // 品質 +3 が出た後: 止める (23% として売る) か、結晶でレベルを賭けるか
  const hitL = crystalHitLevel(p);
  const gambleAfterQuality =
    !plain && crystal != null && -crystal + hitL * sell(sF) + (survive - hitL) * sell(lf * s23) > sell(s23);

  const pLevelUp = v.level / 2;
  const pQualityTop = v.quality / steps;
  const pJunk = 1 - pLevelUp - pQualityTop;

  const outcomes: OutcomeLine[] = [];
  if (gambleAfterLevel) {
    outcomes.push(leveledSaleLine("レベル +1 → 結晶で品質 23% 当たり (完成品)", pLevelUp * hitQ, sF, "finished", uncut, 1));
    outcomes.push(leveledSaleLine("レベル +1 → 結晶で外れ (レベル 21 のまま、品質は崩れる)", pLevelUp * (survive - hitQ), lf * s21, "other", uncut, 1));
    outcomes.push(lostLine("レベル +1 → 結晶で破壊", pLevelUp * (1 - survive), 1));
  } else {
    outcomes.push(leveledSaleLine("レベル +1 → そのまま売る", pLevelUp, s21, "level21", uncut));
  }
  if (gambleAfterQuality) {
    outcomes.push(leveledSaleLine("品質 23% → 結晶でレベル +1 当たり (完成品)", pQualityTop * hitL, sF, "finished", uncut, 1));
    outcomes.push(leveledSaleLine("品質 23% → 結晶で外れ (レベル −1)", pQualityTop * (survive - hitL), lf * s23, "other", uncut, 1));
    outcomes.push(lostLine("品質 23% → 結晶で破壊", pQualityTop * (1 - survive), 1));
  } else {
    outcomes.push(leveledSaleLine("品質 23% → そのまま売る", pQualityTop, s23, "quality23", uncut));
  }
  outcomes.push(leveledSaleLine("外れ (変化なし / レベル −1 / 品質 22% 以下 / ソケット増減)", pJunk, lf * baseGem, "other", uncut));

  const stage: StageProbs = {
    pLevel21: pLevelUp,
    pQuality23: pQualityTop,
    pJunk,
    gambleLevel21: !!gambleAfterLevel,
    hitFromLevel21: hitQ,
    gambleQuality23: !!gambleAfterQuality,
    hitFromQuality23: hitL,
    survive,
    uncutForFinished: true,
    uncutForLevel21: true,
    uncutForQuality23: true,
  };
  return finish(base, upfront, crystal ?? 0, uncut, outcomes, { gambleAfterLevel, gambleAfterQuality, stage });
}

/** レベル 21 を買って結晶で品質を賭ける (買った物は既に 21 なので原石代は不要) */
function buy21Route(m: MaterialPrices, s: SalePrices, p: CorruptParams): RouteResult {
  const missing: string[] = [];
  if (s.level21 == null) missing.push("売値: レベル 21");
  if (s.finished == null) missing.push("売値: 完成品");
  if (m.crystal == null) missing.push("コラプトの結晶");
  const base: RouteResult = { id: "buy21", label: "レベル 21 を買って結晶", ok: false, upfront: 0, ev: 0, pFinished: 0, costPerFinished: null, expectedCost: 0, outcomes: [], missing };
  if (missing.length > 0) return base;
  const s21 = s.level21!;
  const lf = clamp01(p.leftoverFraction);
  const survive = 1 - clamp01(p.crystalDestroy);
  const hit = crystalHitQuality(p);
  const outcomes: OutcomeLine[] = [
    saleLine("品質 23% 当たり (完成品)", hit, s.finished!, "finished"),
    saleLine("外れ (レベル 21 のまま、品質は崩れる)", survive - hit, lf * s21, "other"),
    lostLine("破壊", 1 - survive),
  ];
  const stage: StageProbs = {
    pLevel21: 1, pQuality23: 0, pJunk: 0,
    gambleLevel21: true, hitFromLevel21: hit,
    gambleQuality23: false, hitFromQuality23: 0,
    survive, uncutForFinished: false, uncutForLevel21: false, uncutForQuality23: false,
  };
  return finish(base, s21 + m.crystal!, 0, 0, outcomes, { expectedCrystals: 1, stage });
}

/**
 * 品質 23% を買って結晶でレベルを賭ける。
 * 買う 23% はレベル不問なので、生き残った物 (当たり / 外れ) は結晶の後に原石でレベル 20 に上げてから売る
 * (2026-09-15 オーナー確認: 原石は結晶の後、残った物にだけ使う)。
 */
function buy23Route(m: MaterialPrices, s: SalePrices, p: CorruptParams): RouteResult {
  const missing: string[] = [];
  if (s.quality23 == null) missing.push("売値: 品質 23%");
  if (s.finished == null) missing.push("売値: 完成品");
  if (m.crystal == null) missing.push("コラプトの結晶");
  if (m.uncut20 == null) missing.push("原石 (レベル 20)");
  const base: RouteResult = { id: "buy23", label: "品質 23% を買って結晶", ok: false, upfront: 0, ev: 0, pFinished: 0, costPerFinished: null, expectedCost: 0, outcomes: [], missing };
  if (missing.length > 0) return base;
  const s23 = s.quality23!;
  const uncut = m.uncut20!;
  const lf = clamp01(p.leftoverFraction);
  const survive = 1 - clamp01(p.crystalDestroy);
  const hit = crystalHitLevel(p);
  const outcomes: OutcomeLine[] = [
    leveledSaleLine("レベル +1 当たり (完成品)", hit, s.finished!, "finished", uncut),
    leveledSaleLine("外れ (レベル −1)", survive - hit, lf * s23, "other", uncut),
    lostLine("破壊", 1 - survive),
  ];
  const stage: StageProbs = {
    pLevel21: 0, pQuality23: 1, pJunk: 0,
    gambleLevel21: false, hitFromLevel21: 0,
    gambleQuality23: true, hitFromQuality23: hit,
    survive, uncutForFinished: true, uncutForLevel21: false, uncutForQuality23: false,
  };
  return finish(base, s23 + m.crystal!, 0, uncut, outcomes, { expectedCrystals: 1, stage });
}

function buyFinishedRoute(s: SalePrices): RouteResult {
  const missing = s.finished == null ? ["売値: 完成品"] : [];
  const base: RouteResult = { id: "buyFinished", label: "完成品を買う (基準)", ok: false, upfront: 0, ev: 0, pFinished: 1, costPerFinished: null, expectedCost: 0, outcomes: [], missing };
  if (missing.length > 0) return base;
  const stage: StageProbs = {
    pLevel21: 0, pQuality23: 0, pJunk: 0,
    gambleLevel21: false, hitFromLevel21: 0,
    gambleQuality23: false, hitFromQuality23: 0,
    survive: 1, uncutForFinished: false, uncutForLevel21: false, uncutForQuality23: false,
  };
  // 完成品を買う経路は「1 回 = 完成品 1 個」。段の確率では表せないので個数だけ後で足す
  return finish(base, s.finished!, 0, 0, [saleLine("完成品", 1, s.finished!, "finished")], { expectedCrystals: 0, stage });
}

export function evaluateRoutes(m: MaterialPrices, s: SalePrices, p: CorruptParams): RouteResult[] {
  return [craftRoute(m, s, p), craftRoute(m, s, p, true), buy21Route(m, s, p), buy23Route(m, s, p), buyFinishedRoute(s)];
}

/**
 * 1 回あたりの「売れた物」の期待数と、その行の平均の売値 (原石代を引く前)。
 * 収支で回数を入れた時に売れた数を期待値で埋める (2026-09-15 オーナー指示)。
 * 外れの生存品 (other) は相場が無いので、平均の売値 (前提の割合 × 元の値段) も使う。
 */
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

/** N 回やった時の個数 (段ごとに切り下げ) */
export interface ExpectedCounts {
  /** 売る物 */
  level21: number;
  quality23: number;
  finished: number;
  other: number;
  /** 使う物 */
  crystals: number;
  /** 原石 (レベル 20)。売る物 (完成品 / レベル 21 / 品質 23%) の個数だけ使う */
  uncut20: number;
}

/**
 * N 回やった時の個数を、段ごとに切り下げながら数える (オーナー指示 2026-09-20)。
 *
 * 「期待値 × N」を項目ごとに独立して出すと、23% が 7.4 個できて結晶を 7.4 本使い
 * 完成品が 1.85 個…と小数のまま話が進む。実際は **7 個できて 7 本使い 1 個できる**。
 * 出来上がった個数を切り下げてから次の段に渡すので、ここで順に数える。
 *
 *   1. できた レベル 21 の素体 = floor(N × pLevel21)
 *   2. できた 品質 23%        = floor(N × pQuality23)
 *   3. 賭ける方に結晶を 1 本ずつ  → 当たりは floor(個数 × 当たり確率)
 *   4. 原石は **完成品 + レベル 21** の個数だけ (23% と外れには使わない)
 *
 * 切り下げは「収入は厳しく」の方針どおり (オーナー:「ジェムの期待値も切り下げ」)。
 */
export function expectedCounts(r: RouteResult, attempts: number): ExpectedCounts {
  const zero: ExpectedCounts = { level21: 0, quality23: 0, finished: 0, other: 0, crystals: 0, uncut20: 0 };
  const n = Math.max(0, Math.floor(attempts));
  const st = r.stage;
  if (!r.ok || n <= 0 || !st) return zero;
  const fl = (x: number): number => (Number.isFinite(x) && x > 0 ? Math.floor(x + 1e-9) : 0);

  // 1-2. 賭ける前に出来上がった個数
  const made21 = fl(n * st.pLevel21);
  const made23 = fl(n * st.pQuality23);
  let other = fl(n * st.pJunk);

  // 3. 結晶を使う方は、できた個数ぶん 1 本ずつ賭ける
  let crystals = 0;
  let finished = 0;
  let level21 = made21;
  let quality23 = made23;
  if (st.gambleLevel21 && made21 > 0) {
    crystals += made21;
    finished += fl(made21 * st.hitFromLevel21);
    other += fl(made21 * (st.survive - st.hitFromLevel21));
    level21 = 0; // 全部賭けたので 21 のままでは残らない
  }
  if (st.gambleQuality23 && made23 > 0) {
    crystals += made23;
    finished += fl(made23 * st.hitFromQuality23);
    other += fl(made23 * (st.survive - st.hitFromQuality23));
    quality23 = 0;
  }

  // 4. 原石は完成品とレベル 21 にだけ (経路によっては要らない)
  const uncut20 =
    (st.uncutForFinished ? finished : 0) + (st.uncutForLevel21 ? level21 : 0) + (st.uncutForQuality23 ? quality23 : 0);
  return { level21, quality23, finished, other, crystals, uncut20 };
}

export function expectedSales(r: RouteResult): Record<SaleSlot, { qty: number; price: number | null }> {
  const acc: Record<SaleSlot, { qty: number; value: number }> = {
    level21: { qty: 0, value: 0 },
    quality23: { qty: 0, value: 0 },
    finished: { qty: 0, value: 0 },
    other: { qty: 0, value: 0 },
  };
  for (const o of r.outcomes) {
    if (!o.sale || o.p <= 0) continue;
    acc[o.sale].qty += o.p;
    acc[o.sale].value += o.p * o.gross;
  }
  const out = {} as Record<SaleSlot, { qty: number; price: number | null }>;
  for (const k of Object.keys(acc) as SaleSlot[]) {
    out[k] = { qty: acc[k].qty, price: acc[k].qty > 0 ? acc[k].value / acc[k].qty : null };
  }
  return out;
}

/** 利回り = 1 回の期待収支 ÷ 1 回の期待費用 (計算できない経路は null) */
export function roi(r: RouteResult): number | null {
  return r.ok && r.expectedCost > 0 && Number.isFinite(r.ev) ? r.ev / r.expectedCost : null;
}

/**
 * 利回りが最も高い経路 (計算できた物の中で)。
 * 2026-09-16 オーナー指摘「投資額が多いのに 1 回あたりで比べるのはおかしい」: 以前は 1 回あたりの期待収支の金額で選んでいて、
 * 1 回の費用が 10 倍近い「買って賭ける」経路ほど、少しのプラスでも金額が大きく見えて有利に出ていた。
 * 完成品を買う経路は利回り 0% の基準なので、他が全てマイナスなら「買った方が得」になる。
 */
export function bestRoute(routes: RouteResult[]): RouteResult | null {
  let best: RouteResult | null = null;
  let bestRoi = Number.NEGATIVE_INFINITY;
  for (const r of routes) {
    const v = roi(r);
    if (v != null && v > bestRoi) {
      best = r;
      bestRoi = v;
    }
  }
  return best;
}

export interface BudgetRisk {
  /** 予算でできる回数 (予算 ÷ 1 回の期待費用を丸め、最低 1 回) */
  attempts: number;
  /** 期待総費用 */
  cost: number;
  /** 期待損益 = 回数 × 1 回の期待収支 */
  profit: number;
  /** 赤字で終わる確率 */
  pLoss: number;
  /** 損益の下位 5% / 中央 / 上位 5% */
  p05: number;
  median: number;
  p95: number;
  /** 完成品が 1 個以上できる確率と期待数 */
  pAnyFinished: number;
  expectedFinished: number;
}

/**
 * 同じ予算でその経路をやった時の損益の分布 (2026-09-16)。
 * 結果ごとの 1 回の損益 (OutcomeLine.profit) を回数ぶん引く試行を `trials` 回やって集計する。
 * 乱数は種を固定しているので、同じ入力なら同じ数字が出る (表示がちらつかない)。
 */
export function budgetRisk(r: RouteResult, budget: number, trials = 10000): BudgetRisk | null {
  if (!r.ok || !(r.expectedCost > 0) || !(budget > 0)) return null;
  // 予算を超えないよう切り捨て (1 回分に届かない予算は呼び出し側で「予算不足」にする)。+1e-9 は n × 費用 ÷ 費用 の丸め誤差よけ
  const n = Math.max(1, Math.floor(budget / r.expectedCost + 1e-9));
  const lines = r.outcomes.filter((o) => o.p > 0);
  const total = lines.reduce((s, o) => s + o.p, 0);
  if (lines.length === 0 || !(total > 0)) return null;
  const cum: number[] = [];
  let acc = 0;
  for (const o of lines) cum.push((acc += o.p / total));
  // mulberry32
  let seed = 0x2f6b7a31;
  const rand = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const results = new Float64Array(trials);
  let losses = 0;
  for (let t = 0; t < trials; t++) {
    let sum = 0;
    for (let k = 0; k < n; k++) {
      const u = rand();
      let i = 0;
      while (i < cum.length - 1 && u > cum[i]) i++;
      sum += lines[i].profit;
    }
    results[t] = sum;
    if (sum < -1e-6) losses++;
  }
  results.sort();
  const q = (x: number): number => results[Math.min(trials - 1, Math.floor(x * trials))];
  return {
    attempts: n,
    cost: n * r.expectedCost,
    profit: n * r.ev,
    pLoss: losses / trials,
    p05: q(0.05),
    median: q(0.5),
    p95: q(0.95),
    pAnyFinished: r.pFinished > 0 ? 1 - Math.pow(1 - r.pFinished, n) : 0,
    expectedFinished: n * r.pFinished,
  };
}

/** ヴァールオーブの表示用確率 (正規化後) */
export function vaalProbabilities(p: CorruptParams): { levelUp: number; qualityTop: number; junk: number } {
  const v = normalizedVaal(p);
  const steps = Math.max(2, Math.round(p.qualitySteps));
  const levelUp = v.level / 2;
  const qualityTop = v.quality / steps;
  return { levelUp, qualityTop, junk: 1 - levelUp - qualityTop };
}
