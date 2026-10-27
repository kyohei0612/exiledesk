/**
 * tree-frac-pick.ts — ✦ の印の無い木の乱数のフラクチャーの分け方 (10-27 夜オーナー「フラクチャーの場合、未設定なら外れなんて無いよな」「● MOD 名がフラクチャーの場合って記載しないとな」、スイッチ fracPick)。
 * ほかの手と同じく「狙う MOD」の ☑ と狙い無しを選べる:
 *   - 狙い無し (既定): カードの行ごとの枝 = 固定されうる完成の狙いは 1 つずつ「〇〇がフラクチャーされた場合」、外れ MOD は中身で分けず「外れ MOD がフラクチャーされた場合」の 1 枝
 *     (オーナー「1 MOD 3 つなら 3 枝しかできん」「見本ごとの外れの名前で枝を増やさない」)。どれが固定されるかはエンジンの乱数のまま (行ごとに等しく)
 *   - ☑ あり: ☑ の MOD が固定された = 当たり、ほかが固定された = 外れ (今までの fracRandom の形)
 */
import { aimHits, tierIndexOf, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import { aimHeldOn } from "./tree-aim";
import { effectOf } from "./tree-hands";
import { fractureMarks, type Aim, type Hand, type TreeDoc } from "./tree-model";
import { flag } from "../../../web/release-flags";

/** 印の無い木の、狙い無しの乱数のフラクチャー (カードの行ごとに箱を分ける手) */
export const fracFree = (doc: TreeDoc, h: Pick<Hand, "currency" | "free"> | null | undefined): boolean => !!h && flag("fracPick") && effectOf(h.currency) === "fracture" && !!h.free && !fractureMarks(doc).length;
/** 打った前後で新しく ✦ になった MOD (無ければ null) */
export function newlyFractured(before: StageItem, after: StageItem): StageMod | null {
  const had = new Set([...before.prefixes, ...before.suffixes].filter((m) => m.fractured).map((m) => m.modId));
  return [...after.prefixes, ...after.suffixes].find((m) => m.fractured && !had.has(m.modId)) ?? null;
}
/** 固定されうる MOD (✦・未発現・冒涜で付いた物は固定されない) */
const fixable = (it: StageItem): StageMod[] => [...it.prefixes, ...it.suffixes].filter((m) => !m.fractured && !m.unrevealed && !m.desecrated);
/**
 * 狙い無しの枝: 見本のどれかで固定されうる完成の狙い (完成形の段、完成形の設定の順) と、固定されうる外れ MOD があるか (外れの 1 枝)
 */
export function fracFreeOuts(data: PatchData, doc: TreeDoc, items: readonly StageItem[]): { aims: Aim[]; junk: boolean } {
  const goals = doc.memoAims ?? [];
  const aims = goals.filter((a) => items.some((it) => aimHeldOn(data, { ...it, prefixes: fixable(it).filter((m) => m.side === "prefix"), suffixes: fixable(it).filter((m) => m.side === "suffix") }, a, { sameText: true }))).map((a) => ({ modId: a.modId, tier: a.tier }));
  const isGoal = (m: StageMod): boolean => goals.some((a) => aimHits(m, { modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, a.tier) }, { data, sameText: true }));
  return { aims, junk: items.some((it) => fixable(it).some((m) => !isGoal(m))) };
}
/** 固定された MOD が当たる枝の札 (無ければ外れ MOD の枝) */
export function fracFreeHit(data: PatchData, m: StageMod | null, own: readonly Aim[]): Aim | null {
  if (!m) return null;
  return own.find((a) => aimHits(m, { modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, a.tier) }, { data, sameText: true })) ?? null;
}
