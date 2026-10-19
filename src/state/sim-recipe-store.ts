/**
 * sim-recipe-store.ts — シミュレーターのレシピの一覧を 1 か所で持つ (2026-10-21 オーナー「レシピ消したり上書きしたり色々できるようにしないと
 * そもそも作りがお粗末、シェアもない。しっかり作りこんでくれ」)。
 * 保存・上書き・名前替え・複製・消す (元に戻せる) はここだけを通す。レシピのページ (StageRecipesPage)・シミュレーターの右上 (SimRecipeBar)・
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
export function renameRecipe(id: string, name: string): void {
  const n = name.trim();
  if (n) put(recipeList.value.map((r) => (r.id === id ? { ...r, name: n } : r)));
}
/** 複製: 元のすぐ後ろに「〜 のコピー」 */
export function duplicateRecipe(id: string, suffix: string): SimRecipe | null {
  const list = recipeList.value;
  const at = list.findIndex((r) => r.id === id);
  if (at < 0) return null;
  const now = Date.now();
  const r: SimRecipe = { ...clone(list[at]!), id: newId(), name: `${list[at]!.name}${suffix}`, savedAt: now, updatedAt: now };
  put([...list.slice(0, at + 1), r, ...list.slice(at + 1)]);
  return r;
}
/** 消す (元に戻す用に、消した物と場所を返す) */
export function removeRecipe(id: string): { r: SimRecipe; at: number } | null {
  const at = recipeList.value.findIndex((r) => r.id === id);
  if (at < 0) return null;
  const r = recipeList.value[at]!;
  put(recipeList.value.filter((x) => x.id !== id));
  if (currentRecipeId.value === id) currentRecipeId.value = null;
  return { r, at };
}
export function restoreRecipe(x: { r: SimRecipe; at: number }): void {
  const list = recipeList.value.filter((r) => r.id !== x.r.id);
  put([...list.slice(0, x.at), x.r, ...list.slice(x.at)]);
}
/** ファイルから足した後など、一覧ごと入れ替える */
export function replaceRecipes(v: SimRecipe[]): void { put(v); }
