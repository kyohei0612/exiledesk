/**
 * web-materials.ts — Web 版のジェムコラプトの素材の単価 (2026-10-16 ロードマップの土台「ジェムコラプト計算機の Web 版」)
 *
 * Web は取引所を自動で取らない (メモ web-version-plan: 「コラプトは 3 つ手入力で収支だけ」)。
 * 素材はアプリと同じ materialPricesFor (カレンシーの相場) を、取引所のレート無し (buyOf = 常に null) で使う。
 * = アプリで取引所を取っていない時と同じ単価。計算 (evaluateRoutes / bestRoute) もアプリと同じ物を呼ぶ。
 *
 * 原石から作れないジェム (カルグール系) の「低レベルのジェム本体」は、アプリは売値の取得のついでに取引所で取るが、
 * Web は取れないので手入力 (baseManual)。入れなければ自作の経路は「不足」のまま。
 */
import { baseGemSourceFor, materialPricesFor, type BaseGemSource } from "./materials";
import type { MaterialPrices } from "./model";

/** 取引所のレートは使わない (アプリで取引所をまだ取っていない時と同じ) */
const noExchange = (): null => null;

export function webBaseGemSource(spirit: boolean, gemEn?: string | null): BaseGemSource {
  return baseGemSourceFor(spirit, gemEn ?? null);
}

/** Web の素材の単価 (高貴建て)。base は webBaseGemSource の結果 (画面で名前にも使うので外から渡す) */
export function webMaterialPrices(spirit: boolean, base: BaseGemSource, baseManual: number | null = null): MaterialPrices {
  const m = materialPricesFor(spirit, noExchange, base);
  return base.mode === "buy" ? { ...m, baseGem: baseManual != null && baseManual > 0 ? baseManual : m.baseGem } : m;
}
