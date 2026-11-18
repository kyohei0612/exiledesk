/**
 * tree-recipes.ts — クラフトの道 (ツリー) のレシピ = 名前を付けて残した木の一覧 (2026-10-21 オーナー 10-22「ツリー形式に変えてから無くなった物を足さないと」、
 * 工程ページ式の sim-recipe-store.ts と同じ作り: 保存・上書き・名前替え・複製・消す (元に戻せる)・控え。共有は URL、ファイルへの書き出し・読み込みは控え (10-25 オーナー「絶対に消したくない」))。
 * 木の版の読み替え・読めない箱の要確認は tree-migrate.ts。読めないレシピも捨てずに unread へ取っておく
 * 中身は TreeDoc をそのまま (名前・id・保存時刻で包む)。前の工程式のレシピ (exiledesk.craftStageSim.*) は読み込んだ時に消す (10-25)
 */
import { computed, ref } from "vue";
import type { TreeDoc } from "../../services/simulator/tree/tree-model";
import { migrateTreeDoc } from "../../services/simulator/tree/tree-migrate";
import { toRecipeV1 } from "../../services/simulator/tree/tree-recipe-v1";
import { recipeOf } from "../../services/simulator/tree/tree-frame";
import { craftStage } from "../craft-stage";
import { clone, newId, parseList } from "./recipe-store-util";
import { flag } from "../../web/release-flags";
import { track } from "../../utils/track";
import { readZ, writeZ, Z_AT, Z_KEY } from "./tree-recipe-z";

const TREE_RECIPES_KEY = "exiledesk.tree.recipes";
/** 直前の一覧の控え (本体が読めなかった時はここから) */
const BAK = "exiledesk.tree.recipes.bak";
/** 読めなかった物 (捨てずにここへ) */
const UNREAD = "exiledesk.tree.recipes.unread";
/** 読めなかった物の置き場の上限 (字数、S-101c ⑤) */
const UNREAD_MAX = 200_000;
/** ブラウザーの保存の枠 (Chrome は鍵と値の字数の合計で 5,242,880 字。読み込みの途中の移しの失敗でも数えるので頭に置く) */
const ROOM_CHARS = 5 * 1024 * 1024;
/** 今ツリーで開いているレシピ (読み込み直しても続く) */
const CURRENT = "exiledesk.tree.recipes.current";
/** レシピの包みの版 (名前・時刻などの包みを変えたら上げて normalize で読み替える。木の中身の版は tree-migrate の schema の番号)。版の無い物 (10-25 までの開発版) も捨てずに読む */
const TREE_RECIPE_FORMAT = 1;
export interface TreeRecipe { id: string; name: string; savedAt: number; updatedAt: number; v: number; tree: TreeDoc }

function normalizeTreeRecipe(x: unknown): TreeRecipe | null {
  const r = x as Partial<TreeRecipe> | null;
  if (!r || typeof r !== "object") return null;
  // 木は今の形へ読み替える (前の版の妥協の完成は未完成に、読めない箱は要確認の印で残す。tree-migrate)
  const m = migrateTreeDoc(r.tree);
  if (!m) return null;
  const savedAt = typeof r.savedAt === "number" ? r.savedAt : Date.now();
  return { id: typeof r.id === "string" && r.id ? r.id : newId(), name: typeof r.name === "string" && r.name.trim() ? r.name : m.doc.base, savedAt, updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : savedAt, v: TREE_RECIPE_FORMAT, tree: m.doc };
}
function keepUnread(xs: unknown[]): void {
  if (!xs.length) return;
  try {
    const cur = parseList(localStorage.getItem(UNREAD)) ?? [];
    const seen = new Set(cur.map((x) => JSON.stringify(x)));
    const all = [...cur, ...xs.filter((x) => !seen.has(JSON.stringify(x)))];
    // (recipeRoom、S-101c ⑤) 合わせて 20 万字まで。超えたら古い物 (頭) から捨てる
    if (flag("recipeRoom")) while (all.length > 1 && JSON.stringify(all).length > UNREAD_MAX) all.shift();
    localStorage.setItem(UNREAD, JSON.stringify(all));
  } catch { /* 無くてよい */ }
}
/**
 * (スイッチ saveCap15) 詰めた一覧 Z があれば Z を読み、今の鍵に移した後の物 (古い版のタブがその後に保存・上書きした物 = 更新が移した時刻より後) を id で足す。
 * Z が無ければ今の鍵を読む (その後 moveToZ が Z へ移す)。Z はスイッチを切っても読む (切った間の保存は今の鍵へ = 次に入れた時に足す)
 */
function readList(): unknown[] {
  const z = readZ();
  const old = parseList(localStorage.getItem(TREE_RECIPES_KEY)) ?? parseList(localStorage.getItem(BAK));
  if (!z) return old ?? [];
  if (!old?.length) return z;
  const atRaw = localStorage.getItem(Z_AT);
  // (スイッチ recipeRoom、S-101c) 移した時刻が無い = 移しが途中で止まった (置き場が一杯で書けなかった)。今の鍵の一覧を元の並びのまま正とし、Z にしか無い物だけ前に足す
  if (atRaw == null && flag("recipeRoom")) return mergeInto(old, z, 0);
  return mergeInto(z, old, Number(atRaw) || 0);
}
/** base に、add のうち更新が at より後の物を id で足す (無い物は add の並びのまま頭へ、ある物は更新の新しい方) */
function mergeInto(base: unknown[], add: unknown[], at: number): unknown[] {
  const ids = new Map(base.map((x, i) => [(x as { id?: unknown })?.id, i]));
  const out = [...base], fresh: unknown[] = [];
  for (const x of add) {
    const r = x as { id?: unknown; updatedAt?: unknown } | null;
    if (!r || typeof r.updatedAt !== "number" || r.updatedAt <= at) continue;
    const i = ids.get(r.id);
    if (i === undefined) fresh.push(x);
    else if (r.updatedAt > ((out[i] as { updatedAt?: number })?.updatedAt ?? 0)) out[i] = x;
  }
  // 前は 1 つずつ頭へ足していて並びが逆になった (recipeRoom の前の形)
  return flag("recipeRoom") ? [...fresh, ...out] : [...fresh.reverse(), ...out];
}
function read(): TreeRecipe[] {
  try {
    const list = readList();
    const ok: TreeRecipe[] = [], bad: unknown[] = [];
    for (const x of list) { const r = normalizeTreeRecipe(x); if (r) ok.push(r); else bad.push(x); }
    keepUnread(bad);
    return ok;
  } catch { return []; }
}
/** 書く (スイッチ saveCap15 の間は詰めた一覧 Z へ = tree-recipe-z。本体は先に書き、入らなければ控えを空ける) */
function write(v: TreeRecipe[]): void {
  if (flag("saveCap15")) {
    try { writeZ(v); recipeWriteFailed.value = false; return; } catch { /* 下で空けて書き直す */ }
    if (flag("recipeRoom") && freeOldBak()) try { writeZ(v); recipeWriteFailed.value = false; return; } catch { /* 下で知らせる */ }
    failed();
    return;
  }
  try {
    const prev = localStorage.getItem(TREE_RECIPES_KEY), pl = parseList(prev);
    if (pl) localStorage.setItem(BAK, prev!);
    localStorage.setItem(TREE_RECIPES_KEY, JSON.stringify(v));
    recipeWriteFailed.value = false;
  } catch { failed(); }
}
/**
 * (スイッチ recipeRoom、S-101c) 書けなかった印 (置き場が一杯)。前は黙って捨て、画面の中だけ保存・消したように見えて、読み直すと前の一覧へ戻った
 * (11-18 オーナーの端末: 本番の置き場の残り 114 字で 11-15 から 1 つも書けていなかった)。画面の知らせはこの印を見る
 */
export const recipeWriteFailed = ref(false);
function failed(): void {
  if (!flag("recipeRoom")) return;
  if (!recipeWriteFailed.value) track("recipe:write-failed", roomNote());
  recipeWriteFailed.value = true;
  try { console.warn("[ExileDesk] レシピをこの端末に保存できませんでした (ブラウザーの保存の枠が一杯)"); } catch { /* 無くてよい */ }
}
/** 古い鍵の控え (BAK) を空ける。本体の古い鍵が読める時だけ (控えは本体の 1 つ前の写し = ほぼ同じ物)。空けたら true */
function freeOldBak(): boolean {
  try {
    if (localStorage.getItem(BAK) == null || !parseList(localStorage.getItem(TREE_RECIPES_KEY))) return false;
    localStorage.removeItem(BAK);
    return true;
  } catch { return false; }
}

export const treeRecipes = ref<TreeRecipe[]>(read());
/** (スイッチ saveCap15) 今の鍵の一覧を Z へ移し、今の鍵と控えを消して保存の枠を空ける (移した時刻を残す)。古い版のタブは自分の持つ一覧を今の鍵へ書き直せる */
function moveToZ(): void {
  if (!flag("saveCap15")) return;
  try {
    if (localStorage.getItem(TREE_RECIPES_KEY) == null && localStorage.getItem(Z_KEY) != null) return;
    // (recipeRoom) 入らなければ古い鍵の控えを空けて書き直す。Z に書けて移した時刻を残せてから古い鍵を消す (順は前と同じ)
    try { writeZ(treeRecipes.value); } catch (e) { if (!flag("recipeRoom") || !freeOldBak()) throw e; writeZ(treeRecipes.value); }
    localStorage.setItem(Z_AT, String(Date.now()));
    localStorage.removeItem(TREE_RECIPES_KEY);
    localStorage.removeItem(BAK);
  } catch { failed(); /* 移せなくても今の鍵のまま動く */ }
}
moveToZ();
function reloadTreeRecipes(): void { treeRecipes.value = read(); }
try { window.addEventListener("storage", (e) => { if (e.key === TREE_RECIPES_KEY || e.key === Z_KEY) reloadTreeRecipes(); }); } catch { /* 無くてよい */ }
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
/** 打ち方だけを比べる (組み直した木と保存した形の打ち方が同じなら同じ、S-104) */
export const sameTree = (a: TreeDoc, b: TreeDoc): boolean => JSON.stringify(toRecipeV1(a)) === JSON.stringify(toRecipeV1(b));
/** 保存する形 (打ち方の v1 + 開発版は例のアイテムの v2、S-104・S-200 ⑦)。比べ (sameTree) は打ち方だけ */
const stored = (t: TreeDoc): TreeDoc => recipeOf(craftStage.data.value, t);

export function saveTreeRecipe(name: string, tree: TreeDoc): TreeRecipe {
  const now = Date.now();
  const r: TreeRecipe = { id: newId(), name: name.trim() || tree.base, savedAt: now, updatedAt: now, v: TREE_RECIPE_FORMAT, tree: stored(tree) };
  put([r, ...treeRecipes.value]);
  setCurrentTreeRecipe(r.id);
  return r;
}
export function overwriteTreeRecipe(id: string, tree: TreeDoc): void {
  put(treeRecipes.value.map((r) => (r.id === id ? { ...r, tree: stored(tree), updatedAt: Date.now() } : r)));
}
/**
 * (S-104f、スイッチ builtRefresh) 古いレシピを今の決まりで組み直した木 tree の写しで、保存したレシピ id の写しを書き直す。
 * 打ち方が保存と同じ時だけ。名前・更新の時刻は変えない (一覧の並びは動かない)。書き直したら true
 */
export function refreshBuilt(id: string, tree: TreeDoc): boolean {
  const r = treeRecipes.value.find((x) => x.id === id);
  if (!flag("builtRefresh") || !r || !sameTree(r.tree, tree)) return false;
  const next = stored(tree);
  if (!next.built) return false;
  put(treeRecipes.value.map((x) => (x.id === id ? { ...x, tree: next } : x)));
  return true;
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
/** 同じ中身があればそれ、無ければ足す (URL から開いた時) */
export function addTreeRecipe(name: string, tree: TreeDoc): TreeRecipe {
  const same = treeRecipes.value.find((r) => sameTree(r.tree, tree));
  if (same) return same;
  const now = Date.now();
  const r: TreeRecipe = { id: newId(), name: name.trim() || tree.base, savedAt: now, updatedAt: now, v: TREE_RECIPE_FORMAT, tree: stored(tree) };
  put([r, ...treeRecipes.value]);
  return r;
}

/** ファイルへの書き出し (localStorage の外の控え、10-25 オーナー)。読めずに取っておいた物 (unread) も一緒に入れる */
export function exportTreeRecipes(): string {
  let unread: unknown[] = [];
  try { unread = parseList(localStorage.getItem(UNREAD)) ?? []; } catch { /* 無くてよい */ }
  return JSON.stringify({ kind: "exiledesk-tree-recipes", v: TREE_RECIPE_FORMAT, at: Date.now(), recipes: treeRecipes.value, unread }, null, 1);
}
/**
 * ファイルからの読み込み: 書き出したファイル (recipes の並び) か、レシピ 1 つ・木 1 つの JSON。同じ中身は足さず、同じ id で中身が違えば別のレシピとして足す。
 * 読めなかった物は捨てずに unread へ。added = 足した数、same = 同じ中身があった数、bad = 読めなかった数 (JSON でなければ null)
 */
export function importTreeRecipes(text: string): { added: number; same: number; bad: number } | null {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  const o = raw as { recipes?: unknown; unread?: unknown; tree?: unknown; boxes?: unknown } | null;
  const items: unknown[] = Array.isArray(raw) ? raw : Array.isArray(o?.recipes) ? [...o.recipes, ...(Array.isArray(o.unread) ? o.unread : [])] : o?.tree ? [raw] : o?.boxes ? [{ tree: raw }] : [];
  const ids = new Set(treeRecipes.value.map((r) => r.id));
  const add: TreeRecipe[] = [], bad: unknown[] = [];
  let same = 0;
  for (const x of items) {
    const r = normalizeTreeRecipe(x);
    if (!r) { bad.push(x); continue; }
    if ([...treeRecipes.value, ...add].some((y) => sameTree(y.tree, r.tree))) { same++; continue; }
    if (ids.has(r.id)) r.id = newId();
    ids.add(r.id);
    add.push(r);
  }
  keepUnread(bad);
  if (add.length) put([...add, ...treeRecipes.value]);
  return { added: add.length, same, bad: bad.length };
}

// 前の工程式のレシピ・控え (exiledesk.craftStageSim.*) は木に読み替えられないので、読み込んだ時にこのブラウザから消す
// (前は残して一覧に件数を出していた。10-25 オーナー「古いレシピ全て削除で OK」)
try { for (const k of Object.keys(localStorage)) if (k.startsWith("exiledesk.craftStageSim")) localStorage.removeItem(k); } catch { /* 無くてよい */ }

/** 置き場の今の使い方 = 「合計の割合% 大きい鍵:字数」(記録に添える 1 行。鍵の名前と字数だけで中身は入れない) */
function roomNote(): string {
  try {
    let sum = 0, top = "", topN = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? "", n = k.length + (localStorage.getItem(k)?.length ?? 0);
      sum += n;
      if (n > topN) { top = k; topN = n; }
    }
    return `${Math.round((sum / ROOM_CHARS) * 100)}% ${top}:${topN}`;
  } catch { return "?"; }
}
if (flag("recipeRoom")) {
  // (S-101c ⑥) 使っていない古い鍵を消す (全体図の前の覚え。今は minimap3・minimap4)
  try { localStorage.removeItem("exiledesk.tree.minimap2"); } catch { /* 無くてよい */ }
  // (S-101c ⑦) 開いた時に置き場が枠の 8 割を超えていたら記録に 1 行 (記録しない印の人は送らない = track の中)
  try {
    let sum = 0;
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i) ?? ""; sum += k.length + (localStorage.getItem(k)?.length ?? 0); }
    if (sum > ROOM_CHARS * 0.8) track("storage:near-full", roomNote());
  } catch { /* 数えられなくてよい */ }
}
