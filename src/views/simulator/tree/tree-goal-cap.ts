/**
 * tree-goal-cap.ts — 完成形の候補を枠に縛らず 10 まで (S-04、10-28 オーナー「上限10と設定して８こMOD設定→好きな位置でツリーは完成できる」、スイッチ goalTen)。
 * 断りの中身はエンジンの入口 goalBlock のまま。枠 (プレ・サフィの数) で断られないように、狙いの組を 1 つずつ add と組にして聞く
 * (同じ系統・タグで止め合う組・冒涜 1 つ・クラフト MOD の上限は 2 つの組でも出る。アイテムレベル・ベースに無いは組無しで出る)
 */
import { goalBlock, tagClash, TAG_CLASH } from "../../../services/simulator/sim-engine";
import { craftedKindOf, familiesOf as familiesOfMod, isDesecratedSource, type PatchData } from "../../../services/craft-stage/engine";
import { tr } from "../../../i18n/lang";
import { flag } from "../../../web/release-flags";

/** 完成形の候補の上限 */
export const GOAL_MAX = 10;
type TierMod = { modId: string; tier: number };

/** 候補 aims に add を足せない理由 (足せれば null)。same = add と同じ MOD がもう候補にある (段の替えは数に入れない) */
export function goalBlockLoose(data: PatchData, base: string, itemLevel: number, aims: readonly TierMod[], add: TierMod, same: boolean): string | null {
  if (flag("goalAllIn")) {
    // 上限は付け方ごとに 10 (S-04c、スイッチ goalAllIn)
    const k = kindOf(data, add);
    if (!same && aims.filter((a) => kindOf(data, a) === k).length >= GOAL_MAX) return KIND_FULL[k]();
  } else if (!same && aims.length >= GOAL_MAX) return tr(`完成形の候補は ${GOAL_MAX} まで`, `Up to ${GOAL_MAX} final targets`);
  const alone = goalBlock(data, base, itemLevel, [], add);
  if (alone) return alone;
  for (const a of aims) {
    // 冒涜の MOD は何個でも候補にできる (S-10b、10-31 オーナー「冒涜もいくつか候補…上限とかなくていいんじゃない」)。同じ系統・タグで止め合う組 (E-11i) だけは断る
    if (isDesecrated(data, a) && isDesecrated(data, add)) { if (familiesOf(data, a).some((f) => familiesOf(data, add).includes(f))) return SAME_FAMILY(); if (tagClash(data, a, add)) return TAG_CLASH(); continue; }
    const w = goalBlock(data, base, itemLevel, [a], add); if (w) return w;
  }
  return null;
}
const isDesecrated = (data: PatchData, m: TierMod): boolean => isDesecratedSource(data.mods.get(m.modId)?.source);
/** 付け方の分け (MOD の出どころで見る: エッセンス・合金 = クラフト MOD、冒涜専用 MOD = 冒涜、ほか = ふつう) */
type Kind = "normal" | "craft" | "desecrated";
const kindOf = (data: PatchData, m: TierMod): Kind => (craftedKindOf(data, m) ? "craft" : isDesecrated(data, m) ? "desecrated" : "normal");
const KIND_FULL: Record<Kind, () => string> = {
  normal: () => tr(`ふつうの MOD の候補は ${GOAL_MAX} まで`, `Up to ${GOAL_MAX} regular mod targets`),
  craft: () => tr(`エッセンス・合金の MOD の候補は ${GOAL_MAX} まで`, `Up to ${GOAL_MAX} Essence / Alloy mod targets`),
  desecrated: () => tr(`冒涜の MOD の候補は ${GOAL_MAX} まで`, `Up to ${GOAL_MAX} desecrated mod targets`),
};
/** 系統 (同じ系統は 1 品に 1 つ) はエンジンの familiesOf */
const familiesOf = (data: PatchData, m: TierMod): readonly string[] => { const d = data.mods.get(m.modId); return d ? familiesOfMod(d) : []; };
const SAME_FAMILY = (): string => tr("同じ系統の MOD がもう狙いにある", "A mod of the same family is already a target");
