/**
 * tree-frac-pick.ts — ✦ の印の無い木の乱数のフラクチャーの分け方 (10-27 夜オーナー「フラクチャーの場合、未設定なら外れなんて無いよな」「● MOD 名がフラクチャーの場合って記載しないとな」、スイッチ fracPick)。
 * ほかの手と同じく「狙う MOD」の ☑ と狙い無しを選べる:
 *   - 狙い無し (既定): 固定後の形が同じ物どうしで 1 枝 = 固定されうる完成の狙いは 1 つずつ「〇〇がフラクチャーされた場合」、外れ MOD は中身で分けず側と種類ごとに
 *     「外れ MOD がフラクチャーされた場合」(オーナー「1 MOD 3 つなら 3 枝しかできん」「外れ 2 つは同じ側・同じ種類なので固定後の形が同じ」)。
 *     どれが固定されるかはエンジンの乱数のまま (行ごとに等しく、同じ枝の行は足す)
 *   - ☑ あり: ☑ の MOD が固定された = 当たり、ほかが固定された = 外れ (今までの fracRandom の形)
 */
import { aimHits, craftedKindOf, tierIndexOf, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
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
 * 狙い無しの枝: 見本のどれかで固定されうる完成の狙い (完成形の段、完成形の設定の順) と、固定されうる外れ MOD の側と種類 (外れの枝の鍵)
 */
export function fracFreeOuts(data: PatchData, doc: TreeDoc, items: readonly StageItem[]): { aims: Aim[]; junk: string[] } {
  const goals = doc.memoAims ?? [];
  const aims = goals.filter((a) => items.some((it) => aimHeldOn(data, { ...it, prefixes: fixable(it).filter((m) => m.side === "prefix"), suffixes: fixable(it).filter((m) => m.side === "suffix") }, a, { sameText: true }))).map((a) => ({ modId: a.modId, tier: a.tier }));
  const isGoal = (m: StageMod): boolean => goals.some((a) => aimHits(m, { modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, a.tier) }, { data, sameText: true }));
  // 外れは固定後の形 (側と種類) が同じ物どうしで 1 枝 (10-27 夜オーナー「外れ 2 つは同じ側・同じ種類なので固定後の形が同じ」)。並びはプレ → サフィ、普通 → エッセンス
  const junk = new Set<string>();
  for (const it of items) for (const m of fixable(it)) if (!isGoal(m)) junk.add(junkKeyOf(data, m));
  return { aims, junk: [...junk].sort() };
}
/** 外れ MOD の枝の鍵 = 側と種類 (普通 / エッセンスのクラフト MOD。冒涜で付いた物は固定されないので無い。形の比べの外れの数え方 tree-shape の boxSig と同じ分け方) */
export const junkKeyOf = (data: PatchData, m: StageMod): string => `${m.side}|${m.crafted || craftedKindOf(data, m) ? "crafted" : "normal"}`;
/** 外れの枝の名前の付け足し (枝が 2 つ以上の時だけ。例「プレフィックス・エッセンスの MOD」) */
export function junkKeyLabel(key: string): [string, string] {
  const [side, kind] = key.split("|");
  const ja = `${side === "prefix" ? "プレフィックス" : "サフィックス"}${kind === "crafted" ? "・エッセンスの MOD" : ""}`, en = `${side === "prefix" ? "prefix" : "suffix"}${kind === "crafted" ? ", essence mod" : ""}`;
  return [ja, en];
}
/** 固定された MOD が当たる枝の札 (無ければ外れ MOD の枝) */
export function fracFreeHit(data: PatchData, m: StageMod | null, own: readonly Aim[]): Aim | null {
  if (!m) return null;
  return own.find((a) => aimHits(m, { modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, a.tier) }, { data, sameText: true })) ?? null;
}
