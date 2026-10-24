/**
 * tree-recipes.ts — クラフトの道 (ツリー) のレシピ = 名前を付けて残した木の一覧 (2026-10-21 オーナー 10-22「ツリー形式に変えてから無くなった物を足さないと」、
 * 工程ページ式の sim-recipe-store.ts と同じ作り: 保存・上書き・名前替え・複製・消す (元に戻せる)・控え。共有は URL だけ、ファイルは作らない (オーナー 10-22))。
 * 中身は TreeDoc をそのまま (名前・id・保存時刻で包む)。前の工程式のレシピ (exiledesk.craftStageSim.*) は読み込んだ時に消す (10-25)
 */
import { computed, ref } from "vue";
import { isTreeDoc, type TreeDoc } from "../../services/simulator/tree/tree-model";
import { clone, newId, parseList } from "./recipe-store-util";

const TREE_RECIPES_KEY = "exiledesk.tree.recipes";
/** 直前の一覧の控え (本体が読めなかった時はここから) */
const BAK = "exiledesk.tree.recipes.bak";
/** 読めなかった物 (捨てずにここへ) */
const UNREAD = "exiledesk.tree.recipes.unread";
/** 今ツリーで開いているレシピ (読み込み直しても続く) */
const CURRENT = "exiledesk.tree.recipes.current";
/** レシピの形の版 (形を変えたら上げて normalize で読み替える) */
const TREE_RECIPE_FORMAT = 1;
export interface TreeRecipe { id: string; name: string; savedAt: number; updatedAt: number; v: number; tree: TreeDoc }

function normalizeTreeRecipe(x: unknown): TreeRecipe | null {
  const r = x as Partial<TreeRecipe> | null;
  if (!r || typeof r !== "object" || !isTreeDoc(r.tree)) return null;
  const savedAt = typeof r.savedAt === "number" ? r.savedAt : Date.now();
  // 前の版の妥協の完成は未完成として読む (use-tree の load と同じ)
  for (const b of Object.values(r.tree.boxes)) if (b.done !== "main") b.done = null;
  return { id: typeof r.id === "string" && r.id ? r.id : newId(), name: typeof r.name === "string" && r.name.trim() ? r.name : r.tree.base, savedAt, updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : savedAt, v: TREE_RECIPE_FORMAT, tree: r.tree };
}
function keepUnread(xs: unknown[]): void {
  if (!xs.length) return;
  try {
    const cur = parseList(localStorage.getItem(UNREAD)) ?? [];
    const seen = new Set(cur.map((x) => JSON.stringify(x)));
    localStorage.setItem(UNREAD, JSON.stringify([...cur, ...xs.filter((x) => !seen.has(JSON.stringify(x)))]));
  } catch { /* 無くてよい */ }
}
function read(): TreeRecipe[] {
  try {
    const list = parseList(localStorage.getItem(TREE_RECIPES_KEY)) ?? parseList(localStorage.getItem(BAK)) ?? [];
    const ok: TreeRecipe[] = [], bad: unknown[] = [];
    for (const x of list) { const r = normalizeTreeRecipe(x); if (r) ok.push(r); else bad.push(x); }
    keepUnread(bad);
    return ok;
  } catch { return []; }
}
function write(v: TreeRecipe[]): void {
  try {
    const prev = localStorage.getItem(TREE_RECIPES_KEY);
    if (parseList(prev)) localStorage.setItem(BAK, prev!);
    localStorage.setItem(TREE_RECIPES_KEY, JSON.stringify(v));
  } catch { /* 覚えられなくても動く */ }
}

export const treeRecipes = ref<TreeRecipe[]>(read());
function reloadTreeRecipes(): void { treeRecipes.value = read(); }
try { window.addEventListener("storage", (e) => { if (e.key === TREE_RECIPES_KEY) reloadTreeRecipes(); }); } catch { /* 無くてよい */ }
function put(v: TreeRecipe[]): void { treeRecipes.value = v; write(v); }

const readCurrent = (): string | null => { try { return localStorage.getItem(CURRENT); } catch { return null; } };
export const currentTreeRecipeId = ref<string | null>(readCurrent());
export function setCurrentTreeRecipe(id: string | null): void {
  currentTreeRecipeId.value = id;
  try { if (id) localStorage.setItem(CURRENT, id); else localStorage.removeItem(CURRENT); } catch { /* 無くてよい */ }
}
export const currentTreeRecipe = computed(() => treeRecipes.value.find((r) => r.id === currentTreeRecipeId.value) ?? null);
/** 一覧の並び・「更新」に出す時刻 */
export const touchedAtTree = (r: TreeRecipe): number => r.updatedAt;
/** 中身が同じか (保存していない変更があるか)。箱の位置も木の一部として比べる */
export const sameTree = (a: TreeDoc, b: TreeDoc): boolean => JSON.stringify(a) === JSON.stringify(b);

export function saveTreeRecipe(name: string, tree: TreeDoc): TreeRecipe {
  const now = Date.now();
  const r: TreeRecipe = { id: newId(), name: name.trim() || tree.base, savedAt: now, updatedAt: now, v: TREE_RECIPE_FORMAT, tree: clone(tree) };
  put([r, ...treeRecipes.value]);
  setCurrentTreeRecipe(r.id);
  return r;
}
export function overwriteTreeRecipe(id: string, tree: TreeDoc): void {
  put(treeRecipes.value.map((r) => (r.id === id ? { ...r, tree: clone(tree), updatedAt: Date.now() } : r)));
}
export function renameTreeRecipe(id: string, name: string): void {
  const n = name.trim();
  if (n) put(treeRecipes.value.map((r) => (r.id === id ? { ...r, name: n } : r)));
}
/** 複製: 元のすぐ後ろに「〜 のコピー」 */
export function duplicateTreeRecipe(id: string, suffix: string): TreeRecipe | null {
  const list = treeRecipes.value;
  const at = list.findIndex((r) => r.id === id);
  if (at < 0) return null;
  const now = Date.now();
  const r: TreeRecipe = { ...clone(list[at]!), id: newId(), name: `${list[at]!.name}${suffix}`, savedAt: now, updatedAt: now };
  put([...list.slice(0, at + 1), r, ...list.slice(at + 1)]);
  return r;
}
/** 消す (元に戻す用に、消した物と場所を返す) */
export function removeTreeRecipe(id: string): { r: TreeRecipe; at: number } | null {
  const at = treeRecipes.value.findIndex((r) => r.id === id);
  if (at < 0) return null;
  const r = treeRecipes.value[at]!;
  put(treeRecipes.value.filter((x) => x.id !== id));
  if (currentTreeRecipeId.value === id) setCurrentTreeRecipe(null);
  return { r, at };
}
export function restoreTreeRecipe(x: { r: TreeRecipe; at: number }): void {
  const list = treeRecipes.value.filter((r) => r.id !== x.r.id);
  put([...list.slice(0, x.at), x.r, ...list.slice(x.at)]);
}
/** そのレシピがこのブラウザの保存 (localStorage) に本当に書けているか (書けたのを確かめてから元を消す時に) */
export function treeRecipeSaved(id: string): boolean {
  try { return (parseList(localStorage.getItem(TREE_RECIPES_KEY)) ?? []).some((x) => (x as Partial<TreeRecipe> | null)?.id === id); } catch { return false; }
}
/** 同じ中身があればそれ、無ければ足す (URL から開いた時) */
export function addTreeRecipe(name: string, tree: TreeDoc): TreeRecipe {
  const same = treeRecipes.value.find((r) => sameTree(r.tree, tree));
  if (same) return same;
  const now = Date.now();
  const r: TreeRecipe = { id: newId(), name: name.trim() || tree.base, savedAt: now, updatedAt: now, v: TREE_RECIPE_FORMAT, tree: clone(tree) };
  put([r, ...treeRecipes.value]);
  return r;
}

// 前の工程式のレシピ・控え (exiledesk.craftStageSim.*) は木に読み替えられないので、読み込んだ時にこのブラウザから消す
// (前は残して一覧に件数を出していた。10-25 オーナー「古いレシピ全て削除で OK」)
try { for (const k of Object.keys(localStorage)) if (k.startsWith("exiledesk.craftStageSim")) localStorage.removeItem(k); } catch { /* 無くてよい */ }
