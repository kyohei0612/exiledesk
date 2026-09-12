/**
 * ジェムコラプト収支 — 期待値モデル (純粋関数、UI 非依存) 2026-09-12
 *
 * 目的: 「レベル 21 · 品質 23% のコラプト済みジェム」を手に入れる 4 つの経路の期待値を比べる。
 *   A. 自作: 低レベルジェム → 宝石細工師のプリズム ×4 (品質 20%) → 宝飾職人のオーブ (完全) (5 ソケット)
 *          → ヴァールオーブ → 片方だけ当たったらコラプトの結晶で残りを賭ける (賭けない選択も可)
 *          → 生き残った物だけ原石 (レベル 20) でレベル 20 にする (コラプトの +1 で 21)
 *   B. レベル 21 (品質 20%) を買ってコラプトの結晶で品質 23% を賭ける
 *   C. 品質 23% (レベルは不問) を買ってコラプトの結晶でレベル +1 を賭ける
 *   D. 完成品をそのまま買う (基準)
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

export type RouteId = "craft" | "buy21" | "buy23" | "buyFinished";

export interface OutcomeLine {
  label: string;
  /** この結果になる確率 (0..1) */
  p: number;
  /** この結果の売上 (高貴)。原石代など後払いの費用を引いた純額 */
  net: number;
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
  /** 1 回の試行の期待費用 (確定費用 + 結晶などの条件付き費用の期待値)。期待売上 = ev + expectedCost */
  expectedCost: number;
  /** 1 回の試行で使うコラプトの結晶の期待本数 (自作は当たった時だけ、買って賭ける経路は 1) */
  expectedCrystals?: number;
  /** 1 回の試行で使う原石 (レベル 20) の期待本数 (売る物 = 壊れなかった物にだけ掛かる) */
  expectedUncut?: number;
  /** 内訳 */
  outcomes: OutcomeLine[];
  /** 自作経路で「片方当たり → 結晶で賭ける」を選ぶか (期待値で決めた結果) */
  gambleAfterLevel?: boolean;
  gambleAfterQuality?: boolean;
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

/**
 * 自作経路。ヴァールの結果ごとに「止める / 結晶で賭ける」の良い方を採る。
 * 原石代は「売る物」にだけ掛かる (壊れた物・売らない物には掛からない)。
 */
function craftRoute(m: MaterialPrices, s: SalePrices, p: CorruptParams): RouteResult {
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
    id: "craft",
    label: "自作 (ヴァール → 結晶)",
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
  const sell = (price: number): number => Math.max(0, price - uncut);

  // レベル +1 が出た後: 止める (21 として売る) か、結晶で品質を賭けるか
  const stopAfterLevel = sell(s21);
  const hitQ = crystalHitQuality(p);
  const gambleAfterLevelEv =
    crystal == null ? Number.NEGATIVE_INFINITY : -crystal + hitQ * sell(sF) + (survive - hitQ) * sell(lf * s21);
  const gambleAfterLevel = gambleAfterLevelEv > stopAfterLevel;

  // 品質 +3 が出た後: 止める (23% として売る) か、結晶でレベルを賭けるか
  const stopAfterQuality = sell(s23);
  const hitL = crystalHitLevel(p);
  const gambleAfterQualityEv =
    crystal == null ? Number.NEGATIVE_INFINITY : -crystal + hitL * sell(sF) + (survive - hitL) * sell(lf * s23);
  const gambleAfterQuality = gambleAfterQualityEv > stopAfterQuality;

  const pLevelUp = v.level / 2;
  const pQualityTop = v.quality / steps;
  const pJunk = 1 - pLevelUp - pQualityTop;
  const junkNet = sell(lf * baseGem);

  const outcomes: OutcomeLine[] = [];
  let ev = -upfront;
  let pFinished = 0;
  let salvage = 0; // 完成品以外の期待売上 (実質コスト計算用)
  let expectedCost = upfront;

  if (gambleAfterLevel && crystal != null) {
    expectedCost += pLevelUp * crystal;
    outcomes.push({ label: "レベル +1 → 結晶で品質 23% 当たり (完成品)", p: pLevelUp * hitQ, net: sell(sF) });
    outcomes.push({ label: "レベル +1 → 結晶で外れ (レベル 21 のまま、品質は崩れる)", p: pLevelUp * (survive - hitQ), net: sell(lf * s21) });
    outcomes.push({ label: "レベル +1 → 結晶で破壊", p: pLevelUp * (1 - survive), net: 0 });
    pFinished += pLevelUp * hitQ;
    salvage += pLevelUp * (survive - hitQ) * sell(lf * s21);
    ev += pLevelUp * gambleAfterLevelEv;
  } else {
    outcomes.push({ label: "レベル +1 → そのまま売る", p: pLevelUp, net: stopAfterLevel });
    salvage += pLevelUp * stopAfterLevel;
    ev += pLevelUp * stopAfterLevel;
  }

  if (gambleAfterQuality && crystal != null) {
    expectedCost += pQualityTop * crystal;
    outcomes.push({ label: "品質 23% → 結晶でレベル +1 当たり (完成品)", p: pQualityTop * hitL, net: sell(sF) });
    outcomes.push({ label: "品質 23% → 結晶で外れ (レベル −1)", p: pQualityTop * (survive - hitL), net: sell(lf * s23) });
    outcomes.push({ label: "品質 23% → 結晶で破壊", p: pQualityTop * (1 - survive), net: 0 });
    pFinished += pQualityTop * hitL;
    salvage += pQualityTop * (survive - hitL) * sell(lf * s23);
    ev += pQualityTop * gambleAfterQualityEv;
  } else {
    outcomes.push({ label: "品質 23% → そのまま売る", p: pQualityTop, net: stopAfterQuality });
    salvage += pQualityTop * stopAfterQuality;
    ev += pQualityTop * stopAfterQuality;
  }

  outcomes.push({ label: "外れ (変化なし / レベル −1 / 品質 22% 以下 / ソケット増減)", p: pJunk, net: junkNet });
  salvage += pJunk * junkNet;
  ev += pJunk * junkNet;

  const useCrystalAfterLevel = gambleAfterLevel && crystal != null;
  const useCrystalAfterQuality = gambleAfterQuality && crystal != null;
  const destroyed = (useCrystalAfterLevel ? pLevelUp : 0) * (1 - survive) + (useCrystalAfterQuality ? pQualityTop : 0) * (1 - survive);
  return {
    ...base,
    ok: true,
    upfront,
    ev,
    pFinished,
    costPerFinished: pFinished > 0 ? (expectedCost - salvage) / pFinished : null,
    expectedCost,
    expectedCrystals: (useCrystalAfterLevel ? pLevelUp : 0) + (useCrystalAfterQuality ? pQualityTop : 0),
    expectedUncut: 1 - destroyed,
    outcomes,
    gambleAfterLevel,
    gambleAfterQuality,
  };
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
  const sF = s.finished!;
  const crystal = m.crystal!;
  const lf = clamp01(p.leftoverFraction);
  const survive = 1 - clamp01(p.crystalDestroy);
  const hit = crystalHitQuality(p);
  const upfront = s21 + crystal;
  const outcomes: OutcomeLine[] = [
    { label: "品質 23% 当たり (完成品)", p: hit, net: sF },
    { label: "外れ (レベル 21 のまま、品質は崩れる)", p: survive - hit, net: lf * s21 },
    { label: "破壊", p: 1 - survive, net: 0 },
  ];
  const salvage = (survive - hit) * lf * s21;
  const ev = -upfront + hit * sF + salvage;
  return { ...base, ok: true, upfront, ev, pFinished: hit, costPerFinished: hit > 0 ? (upfront - salvage) / hit : null, expectedCost: upfront, expectedCrystals: 1, outcomes };
}

/** 品質 23% を買って結晶でレベルを賭ける */
function buy23Route(m: MaterialPrices, s: SalePrices, p: CorruptParams): RouteResult {
  const missing: string[] = [];
  if (s.quality23 == null) missing.push("売値: 品質 23%");
  if (s.finished == null) missing.push("売値: 完成品");
  if (m.crystal == null) missing.push("コラプトの結晶");
  const base: RouteResult = { id: "buy23", label: "品質 23% を買って結晶", ok: false, upfront: 0, ev: 0, pFinished: 0, costPerFinished: null, expectedCost: 0, outcomes: [], missing };
  if (missing.length > 0) return base;
  const s23 = s.quality23!;
  const sF = s.finished!;
  const crystal = m.crystal!;
  const lf = clamp01(p.leftoverFraction);
  const survive = 1 - clamp01(p.crystalDestroy);
  const hit = crystalHitLevel(p);
  const upfront = s23 + crystal;
  const outcomes: OutcomeLine[] = [
    { label: "レベル +1 当たり (完成品)", p: hit, net: sF },
    { label: "外れ (レベル −1)", p: survive - hit, net: lf * s23 },
    { label: "破壊", p: 1 - survive, net: 0 },
  ];
  const salvage = (survive - hit) * lf * s23;
  const ev = -upfront + hit * sF + salvage;
  return { ...base, ok: true, upfront, ev, pFinished: hit, costPerFinished: hit > 0 ? (upfront - salvage) / hit : null, expectedCost: upfront, expectedCrystals: 1, outcomes };
}

function buyFinishedRoute(s: SalePrices): RouteResult {
  const missing = s.finished == null ? ["売値: 完成品"] : [];
  const base: RouteResult = { id: "buyFinished", label: "完成品を買う (基準)", ok: false, upfront: 0, ev: 0, pFinished: 1, costPerFinished: null, expectedCost: 0, outcomes: [], missing };
  if (missing.length > 0) return base;
  return { ...base, ok: true, upfront: s.finished!, ev: 0, costPerFinished: s.finished!, expectedCost: s.finished!, outcomes: [{ label: "完成品", p: 1, net: s.finished! }] };
}

export function evaluateRoutes(m: MaterialPrices, s: SalePrices, p: CorruptParams): RouteResult[] {
  return [craftRoute(m, s, p), buy21Route(m, s, p), buy23Route(m, s, p), buyFinishedRoute(s)];
}

/**
 * 1 回あたりの期待収支が最も高い経路 (計算できた物の中で)。
 * 完成品を買う経路は収支 0 の基準なので、他が全てマイナスなら「買った方が得」になる。
 * (実質コストは自作で片方だけ売る戦略だと完成率 0 になり比べられないので、比較軸には使わない)
 */
export function bestRoute(routes: RouteResult[]): RouteResult | null {
  const ok = routes.filter((r) => r.ok && Number.isFinite(r.ev));
  if (ok.length === 0) return null;
  return ok.reduce((a, b) => (b.ev > a.ev ? b : a));
}

/** ヴァールオーブの表示用確率 (正規化後) */
export function vaalProbabilities(p: CorruptParams): { levelUp: number; qualityTop: number; junk: number } {
  const v = normalizedVaal(p);
  const steps = Math.max(2, Math.round(p.qualitySteps));
  const levelUp = v.level / 2;
  const qualityTop = v.quality / steps;
  return { levelUp, qualityTop, junk: 1 - levelUp - qualityTop };
}
