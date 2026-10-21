<!--
  StageRecipesPage.vue — レシピのページ (?page=recipes)。2026-10-21 オーナー 10-22「ツリー形式に変えてから無くなった物を足さないと」で、
  中身をクラフトの道 (ツリー) のレシピに替えた (前は工程ページ式のシミュレーターのレシピ、2026-10-21「しっかり作りこんでくれ」の作り)。

  保存した木を 1 枚ずつ: 開く・今の木で上書き・名前を変える・複製・共有 (URL)・消す (2 回押し、消した後「元に戻す」)。
  上に 探す・並べ替え・今の木を新しく保存・URL を貼って開く・ファイルの書き出し / 読み込み。一覧は state/simulator/tree-recipes.ts
  (ツリーの上の帯 TreeRecipeBar と同じ物)。前の工程式のレシピは木に読み替えられないので、数だけ出して残してある。
  広告の決まりどおりページを移る形 ([[ads-page-model]])。両脇の縦長の枠は WebApp.vue
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import Icon from "../../components/ui/Icon.vue";
import { currentTreeRecipe, currentTreeRecipeId, duplicateTreeRecipe, mergeTreeRecipesFromFile, oldRecipeCount, overwriteTreeRecipe, removeTreeRecipe, renameTreeRecipe, restoreTreeRecipe, sameTree, saveTreeRecipe, setCurrentTreeRecipe, touchedAtTree, treeRecipes, treeRecipesToFile, type TreeRecipe } from "../../state/simulator/tree-recipes";
import { openTreePage } from "../../web/page";
import { baseArt } from "../../services/craft-stage/base-art";
import { openRecipeCode, recipeCodeOf, treeShareUrl } from "./recipe-share";
import { useTree } from "./tree/use-tree";
import { useArmed, ARMED_CLASS } from "../../utils/use-armed";
import { track } from "../../utils/track";
import { jaTypeName } from "../../services/trade2/localize";
import { tr } from "../../i18n/lang";

const t = useTree();
const fmtDate = (n: number): string => { const d = new Date(n); return `${d.getFullYear() === new Date().getFullYear() ? "" : `${d.getFullYear()}/`}${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const baseName = (r: TreeRecipe): string => tr(jaTypeName(r.tree.base), r.tree.base);
const countOf = (r: TreeRecipe): { boxes: number; aims: number; done: number } => {
  const bs = Object.values(r.tree.boxes);
  return { boxes: bs.length, aims: new Set(bs.filter((b) => b.out === "hit" && b.aim).map((b) => `${b.aim!.modId}#${b.aim!.tier}`)).size, done: bs.filter((b) => b.done).length };
};
/** 今の木に、開いているレシピに無い変更があるか (開いていない時は箱が始まりだけでなければ) */
const dirty = computed(() => (currentTreeRecipe.value ? !sameTree(t.doc.value, currentTreeRecipe.value.tree) : Object.keys(t.doc.value.boxes).length > 1));
const olds = oldRecipeCount();

// 探す・並べ替え (並べ替えは覚える)
const SORT_KEY = "exiledesk.recipes.sort";
type Sort = "new" | "name";
const query = ref("");
const sort = ref<Sort>((() => { try { return localStorage.getItem(SORT_KEY) === "name" ? "name" : "new"; } catch { return "new"; } })());
function setSort(v: Sort): void { sort.value = v; try { localStorage.setItem(SORT_KEY, v); } catch { /* 無くてよい */ } }
const shown = computed(() => {
  const q = query.value.trim().toLowerCase();
  const list = treeRecipes.value.filter((r) => !q || r.name.toLowerCase().includes(q) || baseName(r).toLowerCase().includes(q));
  return [...list].sort(sort.value === "name" ? (a, b) => a.name.localeCompare(b.name, "ja") : (a, b) => touchedAtTree(b) - touchedAtTree(a));
});

const note = ref<{ text: string; undo?: () => void } | null>(null);
let noteT = 0;
function say(text: string, undo?: () => void): void { note.value = { text, undo }; clearTimeout(noteT); noteT = window.setTimeout(() => { note.value = null; }, undo ? 10_000 : 3_000); }
const arm = useArmed();

function open(r: TreeRecipe): void {
  if (dirty.value && currentTreeRecipeId.value !== r.id && !arm.arm(`open:${r.id}`)) return;
  track("tree-recipe:open");
  setCurrentTreeRecipe(r.id);
  t.open(r.tree);
  openTreePage();
}
function overwrite(r: TreeRecipe): void {
  if (!arm.arm(`over:${r.id}`)) return;
  overwriteTreeRecipe(r.id, t.doc.value);
  setCurrentTreeRecipe(r.id);
  track("tree-recipe:overwrite");
  say(tr(`「${r.name}」を今の木で上書きしました`, `Overwrote "${r.name}" with the current tree`));
}
function saveNow(): void {
  const r = saveTreeRecipe(`${tr(jaTypeName(t.doc.value.base), t.doc.value.base)} ${fmtDate(Date.now())}`, t.doc.value);
  track("tree-recipe:save");
  say(tr(`「${r.name}」で保存しました (名前は ✎ で変えられる)`, `Saved as "${r.name}" (rename with ✎)`));
  renaming.value = r.id;
  void nextTick(() => (document.querySelector(`[data-recipe-rename="${r.id}"]`) as HTMLInputElement | null)?.select());
}
function duplicate(r: TreeRecipe): void {
  const x = duplicateTreeRecipe(r.id, tr(" のコピー", " (copy)"));
  if (x) { track("tree-recipe:duplicate"); say(tr(`「${x.name}」を作りました`, `Created "${x.name}"`)); }
}
function remove(r: TreeRecipe): void {
  if (!arm.arm(`del:${r.id}`)) return;
  const wasCurrent = currentTreeRecipeId.value === r.id;
  const x = removeTreeRecipe(r.id);
  if (!x) return;
  track("tree-recipe:delete");
  say(tr(`「${r.name}」を消しました`, `Deleted "${r.name}"`), () => { restoreTreeRecipe(x); if (wasCurrent) setCurrentTreeRecipe(r.id); note.value = null; });
}

const renaming = ref<string | null>(null);
function startRename(r: TreeRecipe): void { renaming.value = r.id; void nextTick(() => (document.querySelector(`[data-recipe-rename="${r.id}"]`) as HTMLInputElement | null)?.select()); }
function endRename(r: TreeRecipe, v: string): void { if (renaming.value !== r.id) return; renaming.value = null; renameTreeRecipe(r.id, v); }

// 共有 (札ごとの吹き出し。X に投稿は計算を繋いだ後、オーナー 10-22)
const sharing = ref<{ id: string; url: string } | null>(null);
async function openShare(r: TreeRecipe): Promise<void> {
  if (sharing.value?.id === r.id) { sharing.value = null; return; }
  sharing.value = { id: r.id, url: "" };
  const url = await treeShareUrl(r);
  if (sharing.value?.id === r.id) sharing.value = { ...sharing.value, url };
}
async function copyUrl(r: TreeRecipe): Promise<void> {
  const url = sharing.value?.id === r.id && sharing.value.url ? sharing.value.url : await treeShareUrl(r);
  const ok = await navigator.clipboard.writeText(url).then(() => true, () => false);
  track("tree-recipe:url");
  sharing.value = null;
  say(ok ? tr(`「${r.name}」の URL をコピーしました (開いた人はこの木で始まる)`, `Copied the URL for "${r.name}" (opening it starts this tree)`) : tr("コピーできませんでした", "Couldn't copy"));
}

// URL を貼って開く
const url = ref("");
const urlNote = ref("");
async function openUrl(): Promise<void> {
  const code = recipeCodeOf(url.value);
  if (!code) { urlNote.value = url.value.trim() ? tr("レシピの URL ではありません (#recipe= の付いた URL を貼る)", "Not a recipe URL (paste one with #recipe=)") : ""; return; }
  const ok = await openRecipeCode(code);
  urlNote.value = ok ? "" : tr("このレシピは読めませんでした", "Couldn't read this recipe");
  if (ok) url.value = "";
}
function onPaste(): void { void nextTick(() => { if (recipeCodeOf(url.value)) void openUrl(); }); }

// ファイル
const file = ref<HTMLInputElement | null>(null);
function exportAll(): void {
  const name = `exiledesk-tree-recipes-${new Date().toISOString().slice(0, 10)}.json`;
  const href = URL.createObjectURL(new Blob([treeRecipesToFile(treeRecipes.value)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 5_000);
  say(tr(`${treeRecipes.value.length} 件を ${name} に書き出しました`, `Exported ${treeRecipes.value.length} recipes to ${name}`));
}
async function importFile(ev: Event): Promise<void> {
  const f = (ev.target as HTMLInputElement).files?.[0];
  (ev.target as HTMLInputElement).value = "";
  if (!f) return;
  const r = mergeTreeRecipesFromFile(await f.text());
  say(r.bad && !r.added && !r.skipped ? tr("ツリーのレシピのファイルではありません (前の工程式のファイルは読めない)", "Not a tree recipe file (old step-style files can't be read)") : tr(`${r.added} 件足しました${r.skipped ? ` (同じ物 ${r.skipped} 件は飛ばした)` : ""}${r.bad ? ` · 読めない物 ${r.bad} 件` : ""}`, `Added ${r.added}${r.skipped ? ` (skipped ${r.skipped} duplicates)` : ""}${r.bad ? ` · ${r.bad} unreadable` : ""}`));
}

function back(): void { openTreePage(); }
function onKey(e: KeyboardEvent): void { if (e.key === "Escape" && !renaming.value) { if (sharing.value) sharing.value = null; else back(); } }
let before = 0;
onMounted(() => { before = window.scrollY; window.scrollTo(0, 0); window.addEventListener("keydown", onKey); });
onBeforeUnmount(() => { window.removeEventListener("keydown", onKey); clearTimeout(noteT); const y = before; requestAnimationFrame(() => window.scrollTo(0, y)); });
</script>

<template>
  <section data-recipes-page class="min-w-0 flex-1 p-4 max-md:px-2">
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <h1 class="g-tabbar g-brush flex min-w-0 flex-1 items-center px-8 text-[22px] max-md:!min-h-[40px] max-md:px-6 max-md:text-[15px] tracking-[0.18em] max-md:tracking-[0.04em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_2px_#000,0_0_16px_rgba(255,200,110,0.3)]">{{ tr("レシピ", "Recipes") }}</h1>
      <span class="flex items-center gap-2">
        <button type="button" data-recipes-back class="g-btn sm max-md:min-h-10" @click="back">{{ tr("← クラフトの道へ戻る", "← Back to the crafting path") }}</button>
        <span class="text-[12px] opacity-60 max-md:hidden">{{ tr("Esc でも戻る", "Esc also goes back") }}</span>
      </span>
    </div>

    <div class="g-panel px-4 py-3 text-[13px] max-md:px-3">
      <!-- 今の木 -->
      <div data-recipes-now class="mb-3 flex flex-wrap items-center gap-2 rounded-md bg-white/[0.04] px-3 py-2">
        <span class="text-[var(--exile-color-text-secondary)]">{{ tr("今の木", "Current tree") }}:</span>
        <b class="min-w-0 truncate">{{ currentTreeRecipe ? currentTreeRecipe.name : tr("名前なし", "Untitled") }}</b>
        <span v-if="dirty" class="inline-flex items-center gap-1 text-[12px] text-amber-300"><span class="size-1.5 rounded-full bg-amber-400" />{{ tr("未保存の変更あり", "Unsaved changes") }}</span>
        <span v-else-if="currentTreeRecipe" class="text-[12px] text-emerald-300/80">{{ tr("保存済み", "Saved") }}</span>
        <button type="button" data-recipes-save-now class="g-btn sm ml-auto inline-flex items-center gap-1 max-md:min-h-10" @click="saveNow"><Icon name="plus" class="size-4" />{{ tr("今の木を新しく保存", "Save current as new") }}</button>
      </div>

      <!-- 探す・並べ替え・URL・ファイル -->
      <div class="flex flex-wrap items-center gap-2">
        <span class="relative min-w-0 flex-1 basis-56">
          <Icon name="search" class="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 opacity-50" />
          <input v-model="query" data-recipes-search type="search" class="h-8 w-full rounded-lg border border-white/15 bg-black/40 pl-8 pr-2 outline-none focus:border-amber-400/60 max-md:h-11" :placeholder="tr('名前・ベースで探す', 'Search by name or base')" />
        </span>
        <span class="flex items-center gap-1 text-[12px]" role="group" :aria-label="tr('並べ替え', 'Sort')">
          <button v-for="o in ([['new', '更新順', 'Recent'], ['name', '名前順', 'Name']] as const)" :key="o[0]" type="button" class="h-8 rounded-md border px-2 max-md:h-10" :class="sort === o[0] ? 'border-amber-400/70 bg-amber-500/15 text-amber-100' : 'border-white/10 opacity-70 hover:opacity-100'" :aria-pressed="sort === o[0]" @click="setSort(o[0])">{{ tr(o[1], o[2]) }}</button>
        </span>
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
        <span class="flex min-w-0 flex-1 basis-72 items-center gap-1.5">
          <input v-model="url" data-recipes-url type="text" inputmode="url" spellcheck="false" autocomplete="off" class="h-8 min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-2 outline-none placeholder:opacity-45 focus:border-amber-400/60 max-md:h-11" :placeholder="tr('共有されたレシピの URL を貼る (貼ると開く)', 'Paste a shared recipe URL (opens on paste)')" @paste="onPaste" @keydown.enter.prevent="openUrl" />
          <button type="button" class="g-btn sm max-md:min-h-10" :disabled="!url.trim()" @click="openUrl">{{ tr("開く", "Open") }}</button>
        </span>
        <button type="button" data-recipes-export class="g-btn sm max-md:min-h-10" :disabled="!treeRecipes.length" :title="tr('全部のレシピを 1 つのファイルに (別の PC・ブラウザで読み込むと戻せる)', 'Export all recipes to one file (import it on another PC or browser)')" @click="exportAll">{{ tr("ファイルに書き出す", "Export file") }}</button>
        <button type="button" data-recipes-import class="g-btn sm max-md:min-h-10" :title="tr('書き出したファイルからレシピを足す (今のレシピは消えない)', 'Add recipes from an exported file (existing ones stay)')" @click="file?.click()">{{ tr("ファイルから読み込む", "Import file") }}</button>
        <input ref="file" type="file" accept=".json,application/json" class="hidden" @change="importFile" />
      </div>
      <p v-if="urlNote" class="mt-1 text-[12px] text-amber-200">{{ urlNote }}</p>
      <p v-if="olds" class="mt-1 text-[11px] opacity-55">{{ tr(`前の工程式のレシピ ${olds} 件はツリーに読み替えられないので、このブラウザに残してあります (消していない)`, `${olds} old step-style recipe(s) can't be read as trees; they are kept in this browser (not deleted)`) }}</p>

      <p v-if="note" data-recipes-note class="mt-3 flex items-center gap-2 rounded-md bg-emerald-900/30 px-3 py-1.5 text-[12px] text-emerald-100">
        {{ note.text }}
        <button v-if="note.undo" type="button" data-recipes-undo class="g-btn sm ml-auto inline-flex items-center gap-1 max-md:min-h-10" @click="note.undo()"><Icon name="undo" class="size-4" />{{ tr("元に戻す", "Undo") }}</button>
      </p>

      <!-- 一覧 -->
      <p v-if="!treeRecipes.length" class="py-10 text-center text-[var(--exile-color-text-secondary)]">{{ tr("まだ保存したレシピはありません。クラフトの道で組んで、上の「保存」で残せます", "No saved recipes yet. Build a tree and use Save at the top") }}</p>
      <p v-else-if="!shown.length" class="py-6 text-center opacity-60">{{ tr("見つかりません", "No matches") }}</p>
      <ul v-else class="mt-3 grid gap-2 lg:grid-cols-2">
        <li v-for="r in shown" :key="r.id" data-recipe-card :data-recipe-id="r.id" class="relative flex min-w-0 items-start gap-3 rounded-md border bg-black/30 px-3 py-2.5 max-md:flex-wrap" :class="r.id === currentTreeRecipeId ? 'border-[var(--exile-color-border-brass)]' : 'border-white/10'">
          <img v-if="baseArt(r.tree.base)" :src="baseArt(r.tree.base)!" alt="" class="size-12 shrink-0 object-contain" draggable="false" />
          <span v-else class="size-12 shrink-0" />
          <div class="min-w-0 flex-1">
            <input v-if="renaming === r.id" :data-recipe-rename="r.id" :value="r.name" class="h-8 w-full rounded border border-amber-400/60 bg-black/50 px-1.5 text-[14px] font-bold outline-none max-md:h-10" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" @keydown.esc.stop="renaming = null" @blur="endRename(r, ($event.target as HTMLInputElement).value)" />
            <p v-else class="flex min-w-0 items-center gap-1.5">
              <b class="min-w-0 break-words text-[14px] text-[var(--exile-color-text-primary)]">{{ r.name }}</b>
              <button type="button" data-recipe-rename-btn class="grid size-7 shrink-0 place-items-center rounded opacity-50 hover:bg-white/10 hover:opacity-100 max-md:size-9" :title="tr('名前を変える', 'Rename')" @click="startRename(r)"><Icon name="pencil" class="size-3.5" /></button>
              <span v-if="r.id === currentTreeRecipeId" class="shrink-0 rounded-sm bg-amber-500/20 px-1.5 text-[11px] font-bold text-amber-200">{{ tr("開いている", "Open") }}</span>
            </p>
            <p class="mt-0.5 text-[12px] text-[var(--exile-color-text-secondary)]">{{ baseName(r) }} · {{ tr(`箱 ${countOf(r).boxes}`, `${countOf(r).boxes} boxes`) }} · {{ tr(`狙い ${countOf(r).aims} つ`, `${countOf(r).aims} targets`) }} · {{ tr(`完成 ${countOf(r).done}`, `${countOf(r).done} done`) }}</p>
            <p class="text-[11px] opacity-50">{{ tr(`更新 ${fmtDate(touchedAtTree(r))}`, `Updated ${fmtDate(touchedAtTree(r))}`) }}<template v-if="r.updatedAt !== r.savedAt"> · {{ tr(`作成 ${fmtDate(r.savedAt)}`, `Created ${fmtDate(r.savedAt)}`) }}</template></p>
            <div class="mt-2 flex flex-wrap items-center gap-1.5">
              <button type="button" data-recipe-open class="max-md:min-h-10" :class="arm.is(`open:${r.id}`) ? ARMED_CLASS : 'g-btn sm'" :title="tr('この木をクラフトの道で開く', 'Open this tree in the crafting path')" @click="open(r)">{{ arm.is(`open:${r.id}`) ? tr("保存していない変更が消えます。もう一度押すと開く", "Unsaved changes will be lost. Click again to open") : tr("開く", "Open") }}</button>
              <button v-if="dirty && r.id === currentTreeRecipeId" type="button" data-recipe-overwrite class="max-md:min-h-10" :class="arm.is(`over:${r.id}`) ? ARMED_CLASS : 'g-btn sm'" :title="tr('今の木でこのレシピを書き換える', 'Replace this recipe with the current tree')" @click="overwrite(r)">{{ arm.is(`over:${r.id}`) ? tr("もう一度押すと上書き", "Click again to overwrite") : tr("今の木で上書き", "Overwrite with current") }}</button>
              <button type="button" data-recipe-duplicate class="g-btn sm inline-flex items-center gap-1 max-md:min-h-10" @click="duplicate(r)"><Icon name="copy" class="size-3.5" />{{ tr("複製", "Duplicate") }}</button>
              <button type="button" data-recipe-share-btn class="g-btn sm inline-flex items-center gap-1 max-md:min-h-10" :aria-expanded="sharing?.id === r.id" @click="openShare(r)"><Icon name="share" class="size-3.5" />{{ tr("共有", "Share") }}</button>
              <button type="button" data-recipe-delete class="ml-auto inline-flex items-center gap-1 max-md:min-h-10" :class="arm.is(`del:${r.id}`) ? ARMED_CLASS : 'g-btn sm hover:!text-rose-300'" :title="tr('このレシピを消す (2 回押す。消した後も「元に戻す」で戻せる)', 'Delete this recipe (click twice; Undo appears right after)')" @click="remove(r)"><Icon name="trash" class="size-3.5" />{{ arm.is(`del:${r.id}`) ? tr("もう一度押すと消す", "Click again to delete") : tr("消す", "Delete") }}</button>
            </div>
            <div v-if="sharing?.id === r.id" data-recipe-share-panel class="mt-2 rounded-md border border-[var(--exile-color-border-brass)]/60 bg-[#14110d] p-2.5">
              <div class="flex flex-wrap gap-2">
                <button type="button" data-recipe-copy-url class="g-btn sm inline-flex flex-1 items-center justify-center gap-1.5 max-md:min-h-11" @click="copyUrl(r)"><Icon name="link" class="size-4" />{{ tr("URL をコピー", "Copy URL") }}</button>
              </div>
              <p class="mt-1.5 text-[11px] opacity-50">{{ tr("URL に木が全部入っています。開いた人はこの木で始まり、その人のレシピにも残ります", "The whole tree is in the URL. Opening it starts with this tree and saves it to their recipes") }}</p>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>
