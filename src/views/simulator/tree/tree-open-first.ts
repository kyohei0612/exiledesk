/**
 * tree-open-first.ts — ツリーのページを開いた時の入口 (SimTreePage.vue の onMounted から分けた、中の動きは同じ)。
 * 開く木の順 (S-02): このタブで開いていた保存したレシピ (resumeTree、作りかけの方が新しければ作りかけ) → 共有 URL (CraftStage の openSharedRecipe)
 * → ベース選びの空 (端末に残る作りかけの木からは続けない、11-10)。
 * 白紙ならベース選びのページ (?page=sim-base) から。ベースはまだ選んでいない扱い (use-tree の needBase)。
 * ?page=sim-tree / sim-mods を直に開いて木が無い時も sim-base へ (10-24 夜オーナー「エミュレーターみたいにベースから開始」)。
 * URL は先に置き換える (page.ts は URL と同じページへの移りを履歴に積まない。積むと戻るでまた白紙の sim-tree へ来て、ここから出られなくなる)。
 * 見本の木 (?sample=、tree-samples.ts) は 10-25 に消した (オーナー「古いレシピ全て削除で OK」)
 */
import { useTree } from "./use-tree";
import { resumeTree } from "./tree-save";
import { treeLoading } from "./use-tree-open";
import { openTreePage, treeStep } from "../../../web/page";

export function openTreeFirst(): void {
  const t = useTree();
  if (treeLoading.value) return; // レシピを組んでいる間は白紙に見えるだけ (途中の木を描かない、S-196)。ベース選びへ移らない
  if (resumeTree()) return; // 保存したレシピを開いていた時はそれを開き直してツリーへ (tree-save)
  if (!t.takeAskBase()) return;
  // 端末に残る作りかけの木からは続けない = 開いたらベース選び (S-02、11-10 オーナー「前回の続きからじゃなくていいややっぱり。シミュレーター開いたら同じくベース画面がいい」)
  toBase();
}

function toBase(): void {
  const t = useTree();
  t.needBase.value = true;
  if (treeStep.value !== "base") {
    try { const u = new URL(location.href); u.searchParams.set("page", "sim-base"); history.replaceState(history.state, "", u.pathname + u.search + u.hash); } catch { /* 置き換えられなくても開く */ }
    openTreePage("base");
  }
  t.goalPage.value = 1;
}
