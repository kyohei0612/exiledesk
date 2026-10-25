/**
 * tree-save.ts — 木をその場で保存する (2026-10-26 オーナー「サクッと保存できるようにしたい。名前とか決めずにツリー作ってて保存しますかって聞かれたら保存でおｋ」)。
 * 開いていたレシピなら上書き、無ければ自動の名前 (「<ベース> 10/26 21:30」、後で一覧で直せる) で新しく。名前は聞かない。
 * 帯の「保存」(TreeRecipeBar)・離れる時の「保存して進む」(SimTreePage・StageRecipesPage の setLeaveGuard)・ベースを替える時の「保存して替える」(TreeGoalPage) で同じ
 */
import { currentTreeRecipe, overwriteTreeRecipe, saveTreeRecipe, type TreeRecipe } from "../../../state/simulator/tree-recipes";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { tr } from "../../../i18n/lang";
import { fmtDate } from "../recipe-share";
import { track } from "../../../utils/track";
import { useTree } from "./use-tree";

/** 自動の名前 (ベースの名前 + 日時) */
export const autoName = (d: TreeDoc): string => `${tr(jaTypeName(d.base), d.base)} ${fmtDate(Date.now())}`;

/** 今の木を保存する。返すのは保存先のレシピと、上書きか (画面の一言用) */
export function quickSave(): { r: TreeRecipe; over: boolean } {
  const d = useTree().doc.value, cur = currentTreeRecipe.value;
  if (cur) { overwriteTreeRecipe(cur.id, d); track("tree-recipe:overwrite"); return { r: cur, over: true }; }
  const r = saveTreeRecipe(autoName(d), d);
  track("tree-recipe:save");
  return { r, over: false };
}
