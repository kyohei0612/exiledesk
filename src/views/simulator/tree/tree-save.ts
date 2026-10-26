/**
 * tree-save.ts — 木をその場で保存する (2026-10-26 オーナー「サクッと保存できるようにしたい。名前とか決めずにツリー作ってて保存しますかって聞かれたら保存でおｋ」)。
 * 開いていたレシピなら上書き、無ければ自動の名前 (「<ベース> 10/26 21:30」、後で一覧で直せる) で新しく。名前は聞かない。
 * 帯の「保存」(TreeRecipeBar)・離れる時の「保存して進む」(SimTreePage・StageRecipesPage の setLeaveGuard)・ベースを替える時の「保存して替える」(TreeGoalPage) で同じ
 */
import { currentTreeRecipe, overwriteTreeRecipe, sameTree, saveTreeRecipe, setCurrentTreeRecipe, treeRecipes, type TreeRecipe } from "../../../state/simulator/tree-recipes";
import { openTreePage, treeStep } from "../../../web/page";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { tr } from "../../../i18n/lang";
import { fmtDate } from "../recipe-share";
import { track } from "../../../utils/track";
import { useTree } from "./use-tree";

/**
 * 作りかけ (失うと困る物がある) か。開いているレシピがあればそれと違う時、無ければ完成の狙いか手 (箱 2 つ以上) がある時。
 * ベースだけ選んだ白紙は数えない。離れる・白紙に戻す・タブを閉じる・ベースを替える・貼り付け・レシピを開く時の確かめの元 (10-26 オーナー
 * 「シミュレーターからエミュクリックしたら保存聞かれなくね」: 前は箱 2 つ以上だけで、ベースと狙いを決めた木は聞かずに消えた)。
 * current = この木が今のタブの木か (ほかのタブの木は開いているレシピと比べない)
 */
export function unsaved(d: TreeDoc, current = true): boolean {
  // エミュの「シミュレーターへ」で狙いを入れたままなら聞かない (10-26 夜オーナー「狙いを入れただけで戻る時は聞かずに戻す」)
  if (pristine && pristine === JSON.stringify(d)) return false;
  const cur = current ? currentTreeRecipe.value : null;
  if (cur) return !sameTree(d, cur.tree);
  return !!d.memoAims?.length || Object.keys(d.boxes).length > 1;
}
/** エミュから入れた直後の木 (JSON)。そのままなら作りかけに数えない。tree-paste.ts の requestEmuItem が入れる */
let pristine: string | null = null;
export function markPristine(d: TreeDoc | null): void { pristine = d ? JSON.stringify(d) : null; }
/** 自動の名前 (ベースの名前 + 日時) */
export const autoName = (d: TreeDoc): string => `${tr(jaTypeName(d.base), d.base)} ${fmtDate(Date.now())}`;

/**
 * 保存したレシピへ戻る (10-26 モンキー 6: 「保存して進む」で離れた後のブラウザの戻る・Ctrl+S の後の読み直しで白紙に着いた)。
 * 離れる・閉じる時に開いていたレシピの id をこのタブの間だけ (sessionStorage) 覚え、ツリーのページへ戻った時にそれを開き直す。
 * 作業中の木は持ち越さない決め (10-24 夜) とは別: 保存済みのレシピを開くだけ。保存していない木は覚えない (白紙から)
 */
const RESUME_KEY = "exiledesk.tree.resume";
export function rememberResume(): void {
  try { const id = currentTreeRecipe.value?.id; if (id) sessionStorage.setItem(RESUME_KEY, id); else sessionStorage.removeItem(RESUME_KEY); } catch { /* 覚えられなくてもよい */ }
}
/** 覚えたレシピ (1 回だけ。無い・消えたなら null) */
export function takeResume(): TreeRecipe | null {
  try {
    const id = sessionStorage.getItem(RESUME_KEY);
    sessionStorage.removeItem(RESUME_KEY);
    return id ? treeRecipes.value.find((r) => r.id === id) ?? null : null;
  } catch { return null; }
}
/**
 * 覚えたレシピを開き直す (白紙の木でツリーのページを開いた時)。上のタブの「シミュレーター」はベース選び (sim-base) を開くので、
 * ツリーの画面へ移して URL も sim-tree に (10-26 猿の 8・13: ベース選びに着き「3 ツリー」が押せず、狙いが消えたように見えた)。
 * 作りかけの木がまだ手元にある (このタブで作っていた) 時も、上のタブで来たベース選びでなくその木へ。開き直したら true
 */
export function resumeTree(): boolean {
  const t = useTree(), d = t.doc.value;
  if (d.memoAims?.length || Object.keys(d.boxes).length > 1) {
    if (treeStep.value !== "base" || !d.baseChosen) return false;
  } else {
    const r = takeResume();
    if (!r) return false;
    setCurrentTreeRecipe(r.id);
    t.open(r.tree);
  }
  try { const u = new URL(location.href); u.searchParams.set("page", "sim-tree"); history.replaceState(history.state, "", u.pathname + u.search + u.hash); } catch { /* 置き換えられなくても開く */ }
  openTreePage("tree");
  t.goalPage.value = 0;
  return true;
}
/** 今の木を保存する。返すのは保存先のレシピと、上書きか (画面の一言用) */
export function quickSave(): { r: TreeRecipe; over: boolean } {
  const d = useTree().doc.value, cur = currentTreeRecipe.value;
  if (cur) { overwriteTreeRecipe(cur.id, d); track("tree-recipe:overwrite"); return { r: cur, over: true }; }
  const r = saveTreeRecipe(autoName(d), d);
  track("tree-recipe:save");
  return { r, over: false };
}
