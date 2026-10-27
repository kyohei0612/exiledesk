/**
 * tree-veil.ts — 骨 (冒涜) の手の発現の分け方 (10-27 夜オーナー、スイッチ boneLater)。
 * ゲームどおり未発現のまま次の手を打てる (veil keep)。発現させる時 (骨の手の「発現させる」☑ = veil pick、後から打つ発現の手 REVEAL_KEY) は、
 * 発現で出うる MOD から ☑ の物が出て選べたら当たり、出なければ外れ。発現の 3 つの出方・アビスの反響はエンジンの revealOffers / reveal:N のまま (tree-sample の revealBy)。
 * ☑ の MOD が完成の狙いに無い物 (置き石。例: 全耐性の前に冷気耐性で系統を埋める) は、その手の時だけ当たりで、以降は冒涜の外れ MOD (aimsOf で数えない)
 */
import { aimHits, tierIndexOf, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import { isBone } from "./tree-hands";
import type { Aim, Hand } from "./tree-model";
import { flag } from "../../../web/release-flags";

/** 後から打つ発現の手のキー (エンジンの発現は reveal:N。どれを選ぶかは tree-sample の revealBy が ☑ で決める) */
export const REVEAL_KEY = "reveal";
/** 後から打つ発現の手か */
export const isRevealHand = (key: string | undefined): boolean => key === REVEAL_KEY;
/** 骨の手を未発現のまま次へ (結果は「未発現の冒涜が付いた」1 つ) */
export const veilKeep = (h: Pick<Hand, "currency" | "veil"> | null | undefined): boolean => !!h && flag("boneLater") && isBone(h.currency) && h.veil === "keep";
/** 発現で ☑ の MOD を選ぶ手 (骨の「発現させる」☑・後から打つ発現の手) */
export const veilPick = (h: Pick<Hand, "currency" | "veil"> | null | undefined): boolean => !!h && flag("boneLater") && (isRevealHand(h.currency) || (isBone(h.currency) && h.veil === "pick"));

/** 打った前後で、発現して付いた MOD (前に無く、後で未発現でない冒涜の MOD)。発現していなければ null */
export function revealedOf(before: StageItem, after: StageItem): StageMod | null {
  const had = new Set([...before.prefixes, ...before.suffixes].filter((m) => !m.unrevealed).map((m) => m.modId));
  return [...after.prefixes, ...after.suffixes].find((m) => m.desecrated && !m.unrevealed && !had.has(m.modId)) ?? null;
}
/** 発現した MOD が当たる ☑ の札 (段は「その段以上」、同じ文の別の modId も当たり = 木の当たりの判定と同じ) */
export function revealHitOf(data: PatchData, m: StageMod | null, own: readonly Aim[]): Aim | null {
  if (!m) return null;
  return own.find((a) => aimHits(m, { modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, a.tier) }, { data, sameText: true })) ?? null;
}
