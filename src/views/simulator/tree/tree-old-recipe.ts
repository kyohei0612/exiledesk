/**
 * tree-old-recipe.ts — 古いレシピ (S-104e ③、スイッチ oldRecipeView): 印のある木で手・狙い・分かれ目の窓を開こうとしたら、先に 1 回だけ打ち方から今の決まりで組み直し、
 * 同じ道の札 (S-106、tree-recipe-v1 の pathKeysOf) の箱で窓を開き直す (古い箱と今の決まりを混ぜない)。札の箱が無くなった時は組み直しだけ。置き場は SimTreePage
 */
import { watch, type Ref } from "vue";
import { isOldRecipe } from "../../../services/simulator/tree/tree-built";
import { pathKeysOf } from "../../../services/simulator/tree/tree-recipe-v1";
import { useTree } from "./use-tree";
import type { Panel } from "./use-tree-surface";

/** 組み替えの窓 (見るだけの窓 start・note・base は use-tree の edit が受ける) */
const EDIT_PANELS: ReadonlySet<Panel["kind"]> = new Set(["hand", "aim", "split"]);

export function guardOldRecipe(panel: Ref<Panel | null>): void {
  let busy = false;
  // 同期で受ける (窓が一瞬開いて古い箱で手を決められないように)
  watch(panel, (p) => {
    const t = useTree();
    if (!p || busy || !EDIT_PANELS.has(p.kind) || !isOldRecipe(t.doc.value)) return;
    const key = pathKeysOf(t.doc.value).get(p.id);
    panel.value = null;
    busy = true;
    void t.renewOld().then((d) => {
      busy = false;
      const id = d && key ? [...pathKeysOf(d)].find(([, k]) => k === key)?.[0] : undefined;
      if (id) panel.value = { ...p, id };
    });
  }, { flush: "sync" });
}
