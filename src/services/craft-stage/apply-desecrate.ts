/**
 * クラフトステージ: 冒涜 (骨) と発現 (2026-09-27、ADR-001)。打つ処理は 2026-10-16 から spec/ (ADR-004)。
 * ここに残るのは画面・手順の再生が使う入り口だけ: 未発現の枠 (unrevealedOf) と発現の候補 (revealOffers)。
 * 候補の組み方は打つ処理と同じ spec/parts.ts の drawOffers (2026-10-16 に、ここにあった写しを外した)。
 *
 * ゲームと同じく 2 手に分ける:
 *   1. 骨: **レア**に未発現の冒涜 MOD を 1 つ付ける (側の決め方は spec/parts.ts の unrevealedPlan)
 *   2. 発現 (reveal:N): 候補から N 番目を選ぶ。アビスの反響のお告げがあれば 1 回引き直せる (reveal:N:reroll = 引き直した方)
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { allMods } from "./stage-core";
import type { StageItem, StageMod } from "./types";
import { drawOffers } from "./spec/parts";
import { REVEAL_SPEC } from "./spec/desecrate-specs";

/** 発現の候補の数 (説明文の分解 REVEAL_SPEC の reveal の部品) */
const OFFERS = REVEAL_SPEC.actions.flatMap((a) => ("reveal" in a ? [a.reveal.offers] : []))[0] ?? 3;

/** 未発現の枠 */
export const unrevealedOf = (item: StageItem): StageMod | undefined => allMods(item).find((m) => m.unrevealed);

/**
 * 発現の候補 (と、アビスの反響で引き直した組)。同じ rng から順に引くので、画面で見せる候補と手順の結果 (reveal:N) が一致する。
 * chances = 候補に出た瞬間の確率 (その段の重み ÷ 引いた置き場の全部の重み)
 */
export function revealOffers(data: PatchData, item: StageItem, rng: () => number): { first: StageMod[]; reroll: StageMod[]; chances: Map<StageMod, number> } {
  const hidden = unrevealedOf(item);
  if (!hidden?.unrevealed) return { first: [], reroll: [], chances: new Map() };
  const { sets, chances } = drawOffers(data, item, hidden, rng, OFFERS, 2);
  return { first: sets[0]!, reroll: sets[1]!, chances };
}
