/**
 * tree-goal-quality.ts — 完成形の品質の 2 択 (S-31c、スイッチ qualityAsk)。TreeGoalQuality (欄) と TreeGoalPage (「決めた」で止める) が同じ関数を見る
 */
import { inAny, type StageItem } from "../../../services/craft-stage/engine";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";
import { flag } from "../../../web/release-flags";

/** 品質がカタリストの品質そのものの部位 (指輪・アミュレット・ジュエル。品質の種類を選ぶのもこの部位だけ、StageQualityBar と同じ) */
export const catalystGoal = (it: StageItem | null | undefined): boolean => !!it && inAny(it.cls.category, ["ringAmulet", "jewel"]);
/** 2 択で聞く部位か (スイッチ qualityAsk の時だけ) */
export const askQuality = (it: StageItem | null | undefined): boolean => flag("qualityAsk") && catalystGoal(it);
/** 「決めた」で止める理由 (決まっていれば null): 狙う / 狙わないが未選択、狙うのにカタリストの種類が未選択 */
export function qualityUndecided(doc: TreeDoc, it: StageItem | null | undefined): string | null {
  if (!askQuality(it)) return null;
  if (!doc.goalQualityOn && !doc.goalQualityNo) return tr("品質を狙うか決めてください (「品質を狙う」か「品質は狙わない」)", "Choose whether to aim for quality (Aim for quality / No quality)");
  if (doc.goalQualityOn && !doc.goalQualityTag) return tr("カタリストの種類を選んでください", "Choose the catalyst type");
  return null;
}
