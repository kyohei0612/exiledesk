/**
 * _tree-old-recipe-probe.test.ts — 古いレシピ (S-104e) の開き方を版を仮に埋めて見る台本 (11-16 シミュ部長 69)。合否は付けず並べるだけ。
 *
 *   pnpm exec vitest run -c scripts/_tree-old-recipe-probe.config.ts
 *
 * 金の指輪の新しい木の写しを作り、(1) 同じ版 (2) 版が違う (3) 版が違い打ち方も違う で fromBuilt を呼び、印 (oldBuilt)・保存の写し (builtOf) の版を出す
 */
import { it } from "vitest";
import { builtOf, fromBuilt, isOldRecipe, TREE_BUILD } from "../src/services/simulator/tree/tree-built";
import { newTree, type TreeDoc } from "../src/services/simulator/tree/tree-model";
import { toRecipeV1 } from "../src/services/simulator/tree/tree-recipe-v1";
import { flag } from "../src/web/release-flags";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
it("old recipe", () => {
  console.log("TREE_BUILD", TREE_BUILD, "oldRecipeView", flag("oldRecipeView"));
  const d = newTree("Gold Ring", 82);
  const b = builtOf(d)!;
  const saved = (v: string, note?: string): TreeDoc => ({ ...toRecipeV1(note ? { ...d, note } : d), built: { ...clone(b), v } });
  const show = (name: string, t: TreeDoc): void => {
    const o = fromBuilt(t);
    console.log(name, "→", o ? `写しで開く 印=${isOldRecipe(o)} 保存の写しの版=${builtOf(o)?.v}` : "組み直す (null)");
  };
  show("(1) 同じ版", saved("v-now"));
  show("(2) 版が違う", saved("v-old"));
  show("(3) 版が違い打ち方も違う", { ...saved("v-old"), memoAims: [{ modId: "Rings/IncreasedMana", tier: 1 }] });
});
