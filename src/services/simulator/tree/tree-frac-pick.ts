/**
 * tree-frac-pick.ts — ✦ の印の無い木の乱数のフラクチャーの分け方 (10-27 夜オーナー「フラクチャーの場合、未設定なら外れなんて無いよな」「● MOD 名がフラクチャーの場合って記載しないとな」、スイッチ fracPick)。
 * ほかの手と同じく「狙う MOD」の ☑ と狙い無しを選べる:
 *   - 狙い無し (既定): 固定されうる MOD ごとに箱を分ける (「〇〇がフラクチャーされた場合」)。外れという言い方はしない。どれが固定されるかはエンジンの乱数のまま (等しく)
 *   - ☑ あり: ☑ の MOD が固定された = 当たり、ほかが固定された = 外れ (今までの fracRandom の形)
 * 狙い無しの箱の札の MOD が完成の狙いに無い時 (知性など) は、その箱の札だけで、以降の手では狙いに数えない (aimsOf)
 */
import { stepOutcomes } from "../../simulator/sim-engine";
import { tierRankOf, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import { effectOf } from "./tree-hands";
import { fractureMarks, type Aim, type Hand, type TreeDoc } from "./tree-model";
import { flag } from "../../../web/release-flags";

/** 印の無い木の、狙い無しの乱数のフラクチャー (MOD ごとに箱を分ける手) */
export const fracFree = (doc: TreeDoc, h: Pick<Hand, "currency" | "free"> | null | undefined): boolean => !!h && flag("fracPick") && effectOf(h.currency) === "fracture" && !!h.free && !fractureMarks(doc).length;
/** 打った前後で新しく ✦ になった MOD (無ければ null) */
export function newlyFractured(before: StageItem, after: StageItem): StageMod | null {
  const had = new Set([...before.prefixes, ...before.suffixes].filter((m) => m.fractured).map((m) => m.modId));
  return [...after.prefixes, ...after.suffixes].find((m) => m.fractured && !had.has(m.modId)) ?? null;
}
/** 見本たちで固定されうる MOD ごとの札 (段は出た中で一番低い段 = その段以上で全部の段が当たる。完成の狙いの MOD は完成形の段) */
export function fracFreeAims(data: PatchData, doc: TreeDoc, items: readonly StageItem[]): Aim[] {
  const worst = new Map<string, number>(), goals = doc.memoAims ?? [];
  for (const it of items) for (const o of stepOutcomes(data, it, "fracture") ?? []) {
    if (o.void) continue;
    const m = newlyFractured(it, o.item);
    if (m) worst.set(m.modId, Math.max(worst.get(m.modId) ?? 0, tierRankOf(data, m.modId, m.tierIndex)));
  }
  const at = (id: string): number => { const i = goals.findIndex((g) => g.modId === id); return i < 0 ? 999 : i; };
  return [...worst].map(([modId, tier]) => ({ modId, tier: goals.find((g) => g.modId === modId)?.tier ?? tier })).sort((a, z) => at(a.modId) - at(z.modId));
}
