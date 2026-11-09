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
import { askLeave } from "../../web/page";
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

/**
 * 離れる時の確かめ (D-36c)。挑戦のページ (DailyPlay) が置き、ask(to) が true なら「保存していない変更」の窓 (LeaveConfirm) で聞く。
 * to = 移る先 (page の値、"unload" = 閉じる・読み直す)。今つないでいるのは「一覧へ戻る」と閉じる / 読み直す。
 * ブラウザの戻る・上のタブは web/page.ts の外の層の確かめの口 (デザイン部長に頼み中) へこの guard を渡してつなぐ
 */
export type DailyLeaveGuard = { ask: (to: string) => boolean; save: () => void };
let guard: DailyLeaveGuard | null = null;
export function setDailyLeaveGuard(g: DailyLeaveGuard): void { guard = g; }
/** 外す (自分の置いた物の時だけ。挑戦の画面が作り直される時、新しい画面が置いた後に古い画面が閉じても消さない) */
export function dropDailyLeaveGuard(g: DailyLeaveGuard): void { if (guard === g) guard = null; }
/** 「一覧へ戻る」など、デイリーのボタンで挑戦から離れる時。聞くべきなら窓、「保存して進む」は最初の名前で写しを足してから */
export function leaveDaily(to: string, go: () => void): void {
  const g = guard;
  if (g?.ask(to)) askLeave(go, g.save);
  else go();
}
