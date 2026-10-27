/**
 * tree-open-first.ts — ツリーのページを開いた時の入口 (SimTreePage.vue の onMounted から分けた、中の動きは同じ)。
 * 白紙ならベース選びのページ (?page=sim-base) から。ベースはまだ選んでいない扱い (use-tree の needBase)。
 * ?page=sim-tree / sim-mods を直に開いて木が無い時も sim-base へ (10-24 夜オーナー「エミュレーターみたいにベースから開始」)。
 * URL は先に置き換える (page.ts は URL と同じページへの移りを履歴に積まない。積むと戻るでまた白紙の sim-tree へ来て、ここから出られなくなる)。
 * 見本の木 (?sample=、tree-samples.ts) は 10-25 に消した (オーナー「古いレシピ全て削除で OK」)
 */
import { useTree } from "./use-tree";
import { resumeTree } from "./tree-save";
import { openTreePage, treeStep } from "../../../web/page";

export function openTreeFirst(): void {
  const t = useTree();
  if (resumeTree()) return; // 保存したレシピを開いていた時はそれを開き直してツリーへ (tree-save)
  if (!t.takeAskBase()) return;
  t.needBase.value = true;
  if (treeStep.value !== "base") {
    try { const u = new URL(location.href); u.searchParams.set("page", "sim-base"); history.replaceState(history.state, "", u.pathname + u.search + u.hash); } catch { /* 置き換えられなくても開く */ }
    openTreePage("base");
  }
  t.goalPage.value = 1;
}
