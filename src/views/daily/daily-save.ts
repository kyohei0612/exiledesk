/**
 * daily-save.ts — 挑戦の木をシミュのレシピ一覧に写しで保存する (D-36b) と、レシピに保存していない変更があるか (D-36c)。
 * 保存はシミュのレシピの保存 (saveTreeRecipe) をそのまま使い、シミュで今開いているレシピは替えない (挑戦の木とレシピはつながらない)。
 * 保存した時の打ち方は挑戦の控え (DailyTry.saved) に覚え、離れる時の窓はそれと比べる
 */
import { ref } from "vue";
import { tr } from "../../i18n/lang";
import { toRecipeV1 } from "../../services/simulator/tree/tree-recipe-v1";
import type { TreeDoc } from "../../services/simulator/tree/tree-model";
import { currentTreeRecipe, saveTreeRecipe, setCurrentTreeRecipe } from "../../state/simulator/tree-recipes";
import { track } from "../../utils/track";
import { getTry, updateTry, type DailyTopic } from "./daily-api";

const v1Of = (d: TreeDoc): string => JSON.stringify(toRecipeV1(d));

/** 最初の名前「デイリー MM-DD <お題の品>」(英語 "Daily MM-DD <item>")。日付はお題の日 (id = dYYYY-MM-DD) */
export function dailyRecipeName(topic: DailyTopic): string {
  const md = topic.id.slice(6, 11);
  return tr(`デイリー ${md} ${topic.baseJa}`, `Daily ${md} ${topic.base}`);
}

/** 保存した直後の印 (S-03b と同じく、次に木を変えるまで残す)。どの挑戦の木を保存したかの打ち方 */
export const dailySavedNow = ref<string | null>(null);

/** 写しを 1 つ足す。もう一度押せばもう 1 つ (前の写しは上書きしない) */
export function saveDailyCopy(topic: DailyTopic, name: string, d: TreeDoc): void {
  const keep = currentTreeRecipe.value?.id ?? null;
  saveTreeRecipe(name.trim() || dailyRecipeName(topic), d);
  setCurrentTreeRecipe(keep);
  const v1 = v1Of(d);
  updateTry(topic.id, { saved: v1 });
  dailySavedNow.value = v1;
  track("daily:save-recipe");
}

/** レシピに保存していない変更があるか。保存したことが無ければ手を 1 つ以上置いた木、保存した後はその時の打ち方と違う木 */
export function dailyUnsaved(topicId: string, d: TreeDoc): boolean {
  const saved = getTry(topicId)?.saved;
  if (saved) return v1Of(d) !== saved;
  return !!d.memoAims?.length && Object.keys(d.boxes).length > 1;
}

