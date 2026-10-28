/**
 * tree-goal-cap.ts — 完成形の候補を枠に縛らず 10 まで (S-04、10-28 オーナー「上限10と設定して８こMOD設定→好きな位置でツリーは完成できる」、スイッチ goalTen)。
 * 断りの中身はエンジンの入口 goalBlock のまま。枠 (プレ・サフィの数) で断られないように、狙いの組を 1 つずつ add と組にして聞く
 * (同じ系統・冒涜 1 つ・クラフト MOD の上限は 2 つの組でも出る。アイテムレベル・ベースに無いは組無しで出る)
 */
import { goalBlock } from "../../../services/simulator/sim-engine";
import type { PatchData } from "../../../services/craft-stage/engine";
import { tr } from "../../../i18n/lang";

/** 完成形の候補の上限 */
export const GOAL_MAX = 10;
type TierMod = { modId: string; tier: number };

/** 候補 aims に add を足せない理由 (足せれば null)。same = add と同じ MOD がもう候補にある (段の替えは数に入れない) */
export function goalBlockLoose(data: PatchData, base: string, itemLevel: number, aims: readonly TierMod[], add: TierMod, same: boolean): string | null {
  if (!same && aims.length >= GOAL_MAX) return tr(`完成形の候補は ${GOAL_MAX} まで`, `Up to ${GOAL_MAX} final targets`);
  const alone = goalBlock(data, base, itemLevel, [], add);
  if (alone) return alone;
  for (const a of aims) { const w = goalBlock(data, base, itemLevel, [a], add); if (w) return w; }
  return null;
}
