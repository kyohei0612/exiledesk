/**
 * tree-open-first.ts — ツリーのページを開いた時の入口 (SimTreePage.vue の onMounted から分けた、中の動きは同じ)。
 * 開く木の順 (S-02): このタブで開いていた保存したレシピ (resumeTree) → 共有 URL (CraftStage の openSharedRecipe) → 端末に残る作りかけの木 → ベース選びの空。
 * 白紙ならベース選びのページ (?page=sim-base) から。ベースはまだ選んでいない扱い (use-tree の needBase)。
 * ?page=sim-tree / sim-mods を直に開いて木が無い時も sim-base へ (10-24 夜オーナー「エミュレーターみたいにベースから開始」)。
 * URL は先に置き換える (page.ts は URL と同じページへの移りを履歴に積まない。積むと戻るでまた白紙の sim-tree へ来て、ここから出られなくなる)。
 * 見本の木 (?sample=、tree-samples.ts) は 10-25 に消した (オーナー「古いレシピ全て削除で OK」)
 */
import { useTree } from "./use-tree";
import { resumeTree } from "./tree-save";
import { openTreePage, treeStep } from "../../../web/page";
import { treeDraftNow } from "../../../web/feedback-tree";
import { unpackJson } from "../../../services/craft-stage/share";
import { migrateTreeDoc } from "../../../services/simulator/tree/tree-migrate";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { setCurrentTreeRecipe } from "../../../state/simulator/tree-recipes";

/** 何も置いていない木 (作りかけの木を上に開いてよい) */
const blank = (d: TreeDoc): boolean => !d.memoAims?.length && Object.keys(d.boxes).length <= 1;

export function openTreeFirst(): void {
  const t = useTree();
  if (resumeTree()) return; // 保存したレシピを開いていた時はそれを開き直してツリーへ (tree-save)
  if (!t.takeAskBase()) return;
  // 端末に残る作りかけの木 (要望に添える物と同じ置き場、24 時間まで) から続ける (S-02 ③、11-08 オーナー「そーしよう」)。共有 URL で来た時はそちら
  const dr = location.hash.startsWith("#recipe=") ? null : treeDraftNow();
  if (dr && "code" in dr) { void openDraft(dr.code).then((ok) => { if (!ok) toBase(); }); return; }
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

/** 作りかけの木を開く (保存したレシピには足さない)。読めない・待つ間にほかの木 (共有 URL など) が開いた時は false / 何もしない */
async function openDraft(code: string): Promise<boolean> {
  const t = useTree();
  try {
    const p = (await unpackJson(code)) as { v?: unknown; t?: unknown } | null;
    const d = p?.v === 2 ? migrateTreeDoc(p.t)?.doc : null;
    if (!d) return false;
    if (!blank(t.doc.value)) return true;
    setCurrentTreeRecipe(null);
    t.open(d, true);
    try { const u = new URL(location.href); u.searchParams.set("page", "sim-tree"); history.replaceState(history.state, "", u.pathname + u.search + u.hash); } catch { /* 置き換えられなくても開く */ }
    openTreePage("tree");
    t.goalPage.value = 0;
    return true;
  } catch { return false; }
}
