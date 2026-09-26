/**
 * expected-value.ts — ジェム 1 つの「1 回あたりの期待収支」を出す (2026-09-17)
 *
 * オーナー指示:「売値平均じゃなくて期待値順に並べてくれ」。
 * 自動ジェム監視の並べ替えで使うため、ジェムコラプトの賭けの計算を
 * 画面 (useGemCorrupt) から切り離して、ジェム名と売値だけで呼べる形にした。
 *
 * 売値は捌き速度の記録から出した「実際に売れた値段の中央値」を渡す
 * (画面の最安 1 件ではなく、実売で期待値を出したいため。2026-09-26 に平均 → 中央値)。
 * 仕入れ値 (21 / 23% を買う経路) は売値とは別に「今の最安値」を渡す (2026-09-26 監査)。
 * 素材はジェムコラプトの賭けと同じ materials.ts (相場と取引所の繰り上げ単価の安い方)。
 * 前提確率は既定値 (DEFAULT_PARAMS)。画面で前提を変えても一覧には反映しない。
 */
import { evaluateRoutes, roi, DEFAULT_PARAMS, type RouteResult, type SalePrices } from "./model";
import { baseGemSourceFor, materialPricesFor } from "./materials";
import { cachedBuy, payable } from "../../services/trade2/exchange";
import type { GemInfo } from "./useGemCorrupt";

/**
 * 取引所の繰り上げ単価 (30 分キャッシュ)。画面を開いていなくても localStorage から読める。
 * cachedBuy / cachedBaseBuy は中で版 (exchangeCacheVersion / baseBookVersion) を読むので、
 * これを呼ぶ computed は取り直し・期限切れで計算し直される (2026-09-26 監査)
 */
function cachedPayable(apiId: string | null | undefined): number | null {
  if (!apiId) return null;
  const b = cachedBuy(apiId)?.best;
  return b ? payable(b).payExalted : null;
}

/**
 * 実売の中央値 (売値) と今の最安値 (仕入れ値) から「1 回あたりの期待収支が一番大きい経路」(高貴建て) を出す。
 *
 * 画面 (ジェムコラプトの賭け) の bestRoute は**利回り**で選ぶが、ここは並べ替えのために
 * 「このジェムを 1 回回したら手元にいくら残るか」を比べたいので、金額の大きい経路を採る
 * (オーナー指示 2026-09-17:「期待値順に並べてくれ」)。利回りは補足として返す。
 *
 * 「完成品を買う (基準)」は比べる相手ではないので選ばない (2026-09-26 監査: 期待収支が常に 0 の
 * この経路が候補に入っていたので、全部の経路がマイナスのジェムが「±0」と出ていた)。
 * 本物の経路が全部マイナスなら、その中で一番ましな (マイナスの) 経路をそのまま出す。
 *
 * @param sale 売値 = 実売の中央値 (売れた実績が無い条件は 0 = 売れない)
 * @param buy  仕入れ値 = 今の最安値。無い条件はその条件を買う経路を計算しない
 */
export function expectedValueOf(
  gem: Pick<GemInfo, "spirit" | "en">,
  sale: SalePrices,
  buy: SalePrices,
): { ev: number; roi: number | null; route: RouteResult } | null {
  if (sale.level21 == null && sale.quality23 == null && sale.finished == null) return null;
  // 原石から作れないジェム (カルグール系) は、覚えてある現物の最安を元のジェムの値段にする
  const base = baseGemSourceFor(gem.spirit, gem.en);
  const routes = evaluateRoutes(materialPricesFor(gem.spirit, cachedPayable, base), sale, DEFAULT_PARAMS, buy);
  let best: RouteResult | null = null;
  for (const r of routes) {
    if (r.id === "buyFinished") continue;
    if (!r.ok || !Number.isFinite(r.ev)) continue;
    if (!best || r.ev > best.ev) best = r;
  }
  if (!best) return null;
  return { ev: best.ev, roi: roi(best), route: best };
}
