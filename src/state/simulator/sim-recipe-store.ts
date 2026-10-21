/**
 * sim-recipe-store.ts — シミュレーターのレシピの一覧を 1 か所で持つ (2026-10-21 オーナー「レシピ消したり上書きしたり色々できるようにしないと
 * そもそも作りがお粗末、シェアもない。しっかり作りこんでくれ」)。
 * 保存・上書きはここだけを通す (名前替え・複製・消すはレシピのページが木のレシピ tree-recipes.ts に移って使われなくなり、10-22 に消した)。レシピのページ (StageRecipesPage)・シミュレーターの右上 (SimRecipeBar)・
 * ベースを選ぶページの「レシピから始める」(StageRecipeStart) が同じ一覧を見る。保存先は今までどおり sim-recipes.ts (localStorage)
 */
import { computed, ref, shallowRef } from "vue";
import { readSimRecipes, SIM_RECIPES_KEY, writeSimRecipes, type SimRecipe, type SimSession } from "./sim-recipes";

export const recipeList = ref<SimRecipe[]>(readSimRecipes());
/** 読み直す (ほかのタブで変わった時・URL から足した時) */
export function reloadRecipes(): void { recipeList.value = readSimRecipes(); }
try { window.addEventListener("storage", (e) => { if (e.key === SIM_RECIPES_KEY) reloadRecipes(); }); } catch { /* 無くてよい */ }
function put(v: SimRecipe[]): void { recipeList.value = v; writeSimRecipes(v); }

/** 今シミュレーターで開いているレシピ (呼び出した・保存した物。リセット・別のベースで始めたら null) */
export const currentRecipeId = ref<string | null>(null);
export const currentRecipe = computed(() => recipeList.value.find((r) => r.id === currentRecipeId.value) ?? null);

/**
 * シミュレーターの今の状態 (StageSimPanel が開いている間だけ入る)。レシピのページから「今の状態で上書き」「今の状態を保存」する時に使う
 */
export const simNow = shallowRef<{ session: () => SimSession; baseJa: () => string } | null>(null);

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const newId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
/** 一覧の並び・「更新」に出す時刻 */
export const touchedAt = (r: SimRecipe): number => r.updatedAt ?? r.savedAt;

/**
 * 中身が同じか (保存していない変更があるかの判定)。工程の「決めた」・入れた値段は比べない
 * (値段は覚え方がベースごとで、ほかのレシピを触っても変わる。決めたは進めるだけで変わる)
 */
export function sameContent(a: SimSession, b: SimSession): boolean {
  const k = (x: SimSession): string => JSON.stringify([x.base, x.itemLevel, x.targets, x.sockets, x.order, x.patterns, x.start ?? "white", x.startItem ?? null]);
  return k(a) === k(b);
}

export function saveNewRecipe(name: string, baseJa: string, session: SimSession): SimRecipe {
  const now = Date.now();
  const r: SimRecipe = { id: newId(), name: name.trim() || baseJa, savedAt: now, updatedAt: now, baseJa, session: clone(session) };
  put([r, ...recipeList.value]);
  currentRecipeId.value = r.id;
  return r;
}
export function overwriteRecipe(id: string, session: SimSession, baseJa?: string): void {
  put(recipeList.value.map((r) => (r.id === id ? { ...r, session: clone(session), ...(baseJa ? { baseJa } : {}), updatedAt: Date.now() } : r)));
}
