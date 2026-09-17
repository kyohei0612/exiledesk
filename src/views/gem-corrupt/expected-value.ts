/**
 * expected-value.ts — ジェム 1 つの「1 回あたりの期待収支」を出す (2026-09-17)
 *
 * オーナー指示:「売値平均じゃなくて期待値順に並べてくれ」。
 * 自動ジェム監視の並べ替えで使うため、ジェムコラプトの賭けの計算を
 * 画面 (useGemCorrupt) から切り離して、ジェム名と売値だけで呼べる形にした。
 *
 * 売値は捌き速度の記録から出した「実際に売れた値段の平均」を渡す
 * (画面の最安 1 件ではなく、実売の平均で期待値を出したいため)。
 */
import { evaluateRoutes, roi, DEFAULT_PARAMS, type MaterialPrices, type RouteResult, type SalePrices } from "./model";
import { marketStore } from "../../state/market-store";
import type { GemInfo } from "./useGemCorrupt";

/** 素材の poe2scout ApiId (useGemCorrupt と同じ) */
const MATERIAL_API = {
  gcp: "gcp",
  perfectJeweller: "perfect-jewellers-orb",
  vaal: "vaal",
  crystal: "crystallised-corruption",
  uncutSkill20: "uncut-skill-gem-20",
  uncutSpirit20: "uncut-spirit-gem-20",
} as const;

/** 本体に使う原石の探索範囲 (安いレベルを選ぶ) */
const BASE_GEM_MIN_LEVEL = 15;
const BASE_GEM_MAX_LEVEL = 20;

/** そのジェムを作る時の素材の単価 (高貴建て)。相場が無い物は null */
export function materialsForGem(gem: Pick<GemInfo, "spirit">): MaterialPrices {
  const priceOf = marketStore.priceOf;
  const kind = gem.spirit ? "spirit" : "skill";
  let baseGem: number | null = null;
  for (let lv = BASE_GEM_MIN_LEVEL; lv <= BASE_GEM_MAX_LEVEL; lv++) {
    const p = priceOf(`uncut-${kind}-gem-${lv}`);
    if (p != null && (baseGem == null || p < baseGem)) baseGem = p;
  }
  return {
    baseGem,
    gcp: priceOf(MATERIAL_API.gcp),
    perfectJeweller: priceOf(MATERIAL_API.perfectJeweller),
    vaal: priceOf(MATERIAL_API.vaal),
    crystal: priceOf(MATERIAL_API.crystal),
    uncut20: priceOf(gem.spirit ? MATERIAL_API.uncutSpirit20 : MATERIAL_API.uncutSkill20),
  };
}

/**
 * 実売の平均売値から「1 回あたりの期待収支が一番大きい経路」(高貴建て) を出す。
 *
 * 画面 (ジェムコラプトの賭け) の bestRoute は**利回り**で選ぶが、ここは並べ替えのために
 * 「このジェムを 1 回回したら手元にいくら残るか」を比べたいので、金額の大きい経路を採る
 * (オーナー指示 2026-09-17:「期待値順に並べてくれ」)。利回りは補足として返す。
 * 完成品を買う経路は期待収支 0 の基準なので、他が全部マイナスなら 0 付近に落ち着く。
 */
export function expectedValueOf(
  gem: Pick<GemInfo, "spirit">,
  sale: SalePrices,
): { ev: number; roi: number | null; route: RouteResult } | null {
  if (sale.level21 == null && sale.quality23 == null && sale.finished == null) return null;
  const routes = evaluateRoutes(materialsForGem(gem), sale, DEFAULT_PARAMS);
  let best: RouteResult | null = null;
  for (const r of routes) {
    if (!r.ok || !Number.isFinite(r.ev)) continue;
    if (!best || r.ev > best.ev) best = r;
  }
  if (!best) return null;
  return { ev: best.ev, roi: roi(best), route: best };
}
