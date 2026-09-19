/**
 * materials.ts — ジェムコラプトの素材 (どの相場をどう使うか) を 1 か所にまとめる (2026-09-18)
 *
 * ジェムコラプトの賭け (useGemCorrupt) と自動ジェム監視の期待値 (expected-value) が
 * 別々に同じ定義を持っていて、片方だけ取引所の繰り上げ単価を見ていた (レビュー指摘)。
 * ここに寄せて、両方が同じ素材価格で計算するようにする。
 *
 * 単価の決め方 (オーナー指示 2026-09-16 / 09-17):
 *   - 基本はカレンシーランキングの相場 (poe2scout、高貴建て)
 *   - 取引所のレートを取ってあれば、実際に払う額 (1 以上は繰り上げ) と比べて安い方
 */
import { marketStore } from "../../state/market-store";
import { baseSourceOf, cachedBaseBuy, type BaseSource } from "../../state/gem-base-source";
import type { MaterialPrices } from "./model";

/** 素材の poe2scout ApiId。原石はスキル / スピリットで分かれる */
export const MATERIAL_API = {
  gcp: "gcp",
  perfectJeweller: "perfect-jewellers-orb",
  vaal: "vaal",
  crystal: "crystallised-corruption",
  uncutSkill20: "uncut-skill-gem-20",
  uncutSpirit20: "uncut-spirit-gem-20",
} as const;

/**
 * 低レベルのジェム本体 = 原石のうち一番安い物を使う
 * (2026-09-16 オーナー指示「スキルジェムとスピリットジェムの 15 以上を対象に一番安いのを表示」)。
 */
export const BASE_GEM_MIN_LEVEL = 15;
export const BASE_GEM_MAX_LEVEL = 20;

export interface BaseGemSource {
  apiId: string | null;
  level: number | null;
  /** 相場 (高貴)。取引所との比較前 */
  price: number | null;
  /** "uncut" = 原石から作る / "buy" = トレードで現物 (コラプト無し) を買う */
  mode: BaseSource;
}

/**
 * 低レベルのジェム本体の調達先。
 *   - 原石から作れるジェム: 原石 lv15〜20 のうち相場が一番安い物
 *   - 原石から作れないジェム (カルグール系): トレードで現物 (コラプト無し) を買う。
 *     値段は売値の取得のついでに取って覚えてある物 (state/gem-base-source.ts)。
 *     まだ無ければ null (= 相場なし) で、取得を待つ
 */
export function baseGemSourceFor(spirit: boolean, nameEn?: string | null): BaseGemSource {
  if (nameEn && baseSourceOf(nameEn) === "buy") {
    return { apiId: null, level: null, price: cachedBaseBuy(nameEn)?.exalted ?? null, mode: "buy" };
  }
  const kind = spirit ? "spirit" : "skill";
  let best: BaseGemSource = { apiId: null, level: null, price: null, mode: "uncut" };
  for (let lv = BASE_GEM_MIN_LEVEL; lv <= BASE_GEM_MAX_LEVEL; lv++) {
    const apiId = `uncut-${kind}-gem-${lv}`;
    const p = marketStore.priceOf(apiId);
    if (p != null && (best.price == null || p < best.price)) best = { apiId, level: lv, price: p, mode: "uncut" };
  }
  return best;
}

/**
 * 仕上げ (売る前にレベル 20 へ上げる) に使う物の ApiId。**調達先と揃える**。
 *
 * 2026-09-19 オーナー「原石に関してはソーマタージフラックス 20 レベルが仕上げになるよ」
 * → 「普通のカレンシージェムから作れるやつでもソーマタージフラックスになってる。あれは
 *     作れん現物のやつの表示だから同期させてくれ。普通のジェムの選択のときはカレンシーの 20 ジェムや」。
 *
 *   - 原石から作るジェム  … 原石 (レベル 20)。スキル / スピリットは本体と同じ側
 *   - 現物を買うジェム    … ソーマタージ・フラックス (レベル 20)。原石では上げられないため
 *
 * フラックスは poe2scout の ApiId のスラッグが分からないので英語表記で引く。
 * 相場一覧に無い時 (まだ取っていない / poe2scout が扱っていない) は原石に落とす。
 */
export const FINISHER_TEXT = "Thaumaturgic Flux (Level 20)";
export const FINISHER_JA = "ソーマタージ・フラックス (レベル 20)";

export function uncut20ApiId(spirit: boolean, mode: BaseSource = "uncut"): string {
  const uncut = spirit ? MATERIAL_API.uncutSpirit20 : MATERIAL_API.uncutSkill20;
  if (mode !== "buy") return uncut;
  return marketStore.apiIdByText(FINISHER_TEXT) ?? uncut;
}

/** その調達先で仕上げに ソーマタージ・フラックス を使うか (現物を買うジェムで、相場一覧にある時だけ) */
export function finisherIsFlux(mode: BaseSource = "uncut"): boolean {
  return mode === "buy" && marketStore.apiIdByText(FINISHER_TEXT) != null;
}

/**
 * 取引所で実際に払う額 (高貴換算、繰り上げ後)。取ってなければ null。
 * useGemCorrupt は画面の状態 (exchange ref) から、自動ジェム監視は localStorage のキャッシュから渡す
 */
export type BuyOf = (apiId: string | null | undefined) => number | null;

/** 相場と取引所の安い方 (取引所を取っていなければ相場のまま) */
export function withExchange(apiId: string | null | undefined, market: number | null, buyOf: BuyOf): number | null {
  const b = buyOf(apiId);
  if (b == null) return market;
  return market == null ? b : Math.min(market, b);
}

/** そのジェムを作る時の素材の単価 (高貴建て)。相場が無い物は null */
export function materialPricesFor(spirit: boolean, buyOf: BuyOf, base: BaseGemSource = baseGemSourceFor(spirit)): MaterialPrices {
  const priceOf = marketStore.priceOf;
  // 仕上げは調達先と揃える (原石から作るなら原石、現物を買うならフラックス)
  const uncut = uncut20ApiId(spirit, base.mode);
  return {
    baseGem: withExchange(base.apiId, base.price, buyOf),
    gcp: withExchange(MATERIAL_API.gcp, priceOf(MATERIAL_API.gcp), buyOf),
    perfectJeweller: withExchange(MATERIAL_API.perfectJeweller, priceOf(MATERIAL_API.perfectJeweller), buyOf),
    vaal: withExchange(MATERIAL_API.vaal, priceOf(MATERIAL_API.vaal), buyOf),
    crystal: withExchange(MATERIAL_API.crystal, priceOf(MATERIAL_API.crystal), buyOf),
    uncut20: withExchange(uncut, priceOf(uncut), buyOf),
  };
}
