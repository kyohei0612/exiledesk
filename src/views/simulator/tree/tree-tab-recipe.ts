/**
 * tree-tab-recipe.ts — タブごとの「開いているレシピ」の印と保存の控え (S-09 ②、スイッチ tabRecipe、11-14 オーナー
 * 「ツリー①とツリー２で別のレシピ表示したいのにレシピ変更したものが２つ並ぶのバグだね」「別々で管理したいタブみたいな感じで」)。
 * 印 (currentTreeRecipeId) と控え (tree-save の作りかけの比べの元) はページに 1 つなので、タブを替える時に今のタブの分をしまい、替えた先の分を出す。
 * 前は替えても印が残り、①で保存すると②で開いたレシピが①の木で上書きされ、一覧に同じ中身が 2 つ並んだ
 */
import { currentTreeRecipeId, setCurrentTreeRecipe } from "../../../state/simulator/tree-recipes";
import { flag } from "../../../web/release-flags";

/** 開いたレシピを読み込み終えた時の打ち方の形 (S-03c。tree-save の unsaved・markOpened が読み書きする) */
export type OpenedAs = { id: string; at: number; v1: string } | null;
export const openedMark: { v: OpenedAs } = { v: null };

type Mark = { id: string | null; opened: OpenedAs };
/** タブの並びと同じ順。今のタブの分は印そのものが持つので、ここは替えた時にしまった物 */
const marks: Array<Mark | undefined> = [];

/** タブを替える時 (use-tree の setActive): from のタブの印をしまい、to のタブの印を出す (新しいタブ・写したタブは無し) */
export function swapTabRecipe(from: number | null, to: number): void {
  if (!flag("tabRecipe")) return;
  if (from !== null) marks[from] = { id: currentTreeRecipeId.value, opened: openedMark.v };
  const m = marks[to];
  marks[to] = undefined;
  setCurrentTreeRecipe(m?.id ?? null);
  openedMark.v = m?.opened ?? null;
}
/** タブを閉じた時 (並びを詰める) */
export function dropTabRecipe(i: number): void { marks.splice(i, 1); }
/** 全部のタブを白紙に戻した時 */
export function clearTabRecipes(): void { marks.length = 0; }
/** このレシピを開いているほかのタブ (無ければ -1)。一覧・帯でそのレシピを押した時に読み込み直さずそのタブへ移る */
export function tabOfRecipe(id: string, active: number): number {
  if (!flag("tabRecipe")) return -1;
  return marks.findIndex((m, i) => i !== active && m?.id === id);
}
