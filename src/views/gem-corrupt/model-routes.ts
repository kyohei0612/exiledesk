/**
 * model-routes.ts — 4 つの経路の組み立て (自作 / 賭けない自作 / 21 を買う / 23% を買う / 完成品を買う)
 *
 * 2026-09-21 に model.ts (601 行) から切り出した。中身は変えていない。
 * 外から使う時は今まで通り `./model` から読む (model.ts がまとめて出している)。
 */
import {
  type CorruptParams,
  type MaterialPrices,
  type OutcomeLine,
  type RouteResult,
  type SaleSlot,
  type SalePrices,
  type StageProbs,
} from "./model-types";
import { clamp01, crystalHitLevel, crystalHitQuality, normalizedVaal } from "./model-probs";

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

/**
 * 買う経路の仕入れ値。`buy` を渡さなければ今まで通り売値と同じ値で買う (ジェムコラプトの賭けの画面)。
 * 渡した時は**その値だけ**を使い、無い (null / 0 以下) なら経路を計算しない (2026-09-26 監査:
 * 自動ジェム監視が「売れない = 0」の売値をそのまま仕入れ値にして、21 / 23% を 0 で買う偽の黒字を出していた)
 */
function buyPriceOf(key: keyof SalePrices, s: SalePrices, buy?: SalePrices): number | null {
  const v = buy ? buy[key] : s[key];
  return v != null && v > 0 ? v : null;
}

/** レベル 21 を買って結晶で品質を賭ける (買った物は既に 21 なので原石代は不要) */
function buy21Route(m: MaterialPrices, s: SalePrices, p: CorruptParams, buy?: SalePrices): RouteResult {
  const missing: string[] = [];
  const cost21 = buyPriceOf("level21", s, buy);
  if (s.level21 == null) missing.push("売値: レベル 21");
  if (cost21 == null) missing.push("買値: レベル 21");
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
  return finish(base, cost21! + m.crystal!, 0, 0, outcomes, { expectedCrystals: 1, stage });
}

/**
 * 品質 23% を買って結晶でレベルを賭ける。
 * 買う 23% はレベル不問なので、生き残った物 (当たり / 外れ) は結晶の後に原石でレベル 20 に上げてから売る
 * (2026-09-15 オーナー確認: 原石は結晶の後、残った物にだけ使う)。
 */
function buy23Route(m: MaterialPrices, s: SalePrices, p: CorruptParams, buy?: SalePrices): RouteResult {
  const missing: string[] = [];
  const cost23 = buyPriceOf("quality23", s, buy);
  if (s.quality23 == null) missing.push("売値: 品質 23%");
  if (cost23 == null) missing.push("買値: 品質 23%");
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
  return finish(base, cost23! + m.crystal!, 0, uncut, outcomes, { expectedCrystals: 1, stage });
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

/**
 * @param buy 買う経路の仕入れ値 (省略時は売値と同じ)。自動ジェム監視は「今の最安値」を渡す
 *            (売値は実売の中央値、売れていなければ 0。仕入れ値とは別物)
 */
export function evaluateRoutes(m: MaterialPrices, s: SalePrices, p: CorruptParams, buy?: SalePrices): RouteResult[] {
  return [craftRoute(m, s, p), craftRoute(m, s, p, true), buy21Route(m, s, p, buy), buy23Route(m, s, p, buy), buyFinishedRoute(s)];
}

/**
 * 1 回あたりの「売れた物」の期待数と、その行の平均の売値 (原石代を引く前)。
 * 収支で回数を入れた時に売れた数を期待値で埋める (2026-09-15 オーナー指示)。
 * 外れの生存品 (other) は相場が無いので、平均の売値 (前提の割合 × 元の値段) も使う。
 */
