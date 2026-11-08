/**
 * tree-draft-open.ts — 端末に残る作りかけの木 (web/feedback-tree.ts の置き場、use-tree-draft が書く) を開く (S-02、11-08)。
 * tree-open-first (どれも無い時の ③) と tree-save の resumeTree (このタブのレシピより新しい時の ①) の両方から呼ぶ
 */
import { useTree } from "./use-tree";
import { treeDraftNow } from "../../../web/feedback-tree";
import { unpackJson } from "../../../services/craft-stage/share";
import { migrateTreeDoc } from "../../../services/simulator/tree/tree-migrate";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { setCurrentTreeRecipe, type TreeRecipe } from "../../../state/simulator/tree-recipes";
import { treeCodeOf } from "../recipe-share";

/** 何も置いていない木 (作りかけの木を上に開いてよい) */
export const blankTree = (d: TreeDoc): boolean => !d.memoAims?.length && Object.keys(d.boxes).length <= 1;

/** 作りかけの木の code (since より後に書いた物だけ。無い・古い・大きすぎる時は null) */
export function draftCode(since = 0): string | null {
  const dr = treeDraftNow();
  if (!dr || !("code" in dr)) return null;
  return Date.now() - dr.ageSec * 1000 > since ? dr.code : null;
}

/**
 * 作りかけの木を開く。recipe = このタブで開いていたレシピ (そのレシピのまま開く = 保存は上書き、名前の横の ● は付く)。
 * 中身がレシピと同じならレシピの木を開く (開いただけで ● を付けない)。読めない時は false、待つ間にほかの木が開いた時は何もせず true
 */
export async function openDraftTree(code: string, recipe: TreeRecipe | null = null): Promise<boolean> {
  const t = useTree();
  try {
    if (recipe && code === (await treeCodeOf({ name: "", tree: recipe.tree }))) { setCurrentTreeRecipe(recipe.id); t.open(recipe.tree, true); return true; }
    const p = (await unpackJson(code)) as { v?: unknown; t?: unknown } | null;
    const d = p?.v === 2 ? migrateTreeDoc(p.t)?.doc : null;
    if (!d) return false;
    if (!blankTree(t.doc.value)) return true;
    setCurrentTreeRecipe(recipe?.id ?? null);
    t.open(d, true);
    return true;
  } catch { return false; }
}
