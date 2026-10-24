<!--
  StageRecipesPage.vue — レシピのページ (?page=recipes)。2026-10-21 オーナー 10-22「ツリー形式に変えてから無くなった物を足さないと」で、
  中身をクラフトの道 (ツリー) のレシピに替えた (前は工程ページ式のシミュレーターのレシピ、2026-10-21「しっかり作りこんでくれ」の作り)。

  保存した木を 1 枚ずつ: 開く・今の木で上書き・名前を変える・複製・URL をコピー・消す (2 回押し、消した後「元に戻す」)。
  上に 探す・並べ替え・今の木を新しく保存・URL を貼って開く (共有・管理は URL だけ、ファイルは作らない、オーナー 10-22)。一覧は state/simulator/tree-recipes.ts
  (ツリーの上の帯 TreeRecipeBar と同じ物)。前の工程式のレシピは木に読み替えられないので、数だけ出して残してある。
  広告の決まりどおりページを移る形 ([[ads-page-model]])。両脇の縦長の枠は WebApp.vue
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import Icon from "../../components/ui/Icon.vue";
import { currentTreeRecipe, currentTreeRecipeId, duplicateTreeRecipe, oldRecipeCount, overwriteTreeRecipe, removeTreeRecipe, renameTreeRecipe, restoreTreeRecipe, sameTree, saveTreeRecipe, setCurrentTreeRecipe, touchedAtTree, treeRecipes, type TreeRecipe } from "../../state/simulator/tree-recipes";
import { openTreePage, setLeaveGuard } from "../../web/page";
import { treePage } from "../../state/web-page";
import { fmtDate, treeShareUrl, useRecipeUrl } from "./recipe-share";
import { useTree } from "./tree/use-tree";
import { recipeSummary } from "./tree/recipe-summary";
import { useArmed, ARMED_CLASS } from "../../utils/use-armed";
import { track } from "../../utils/track";
import { jaTypeName } from "../../services/trade2/localize";
import { tr } from "../../i18n/lang";

const t = useTree();
const baseName = (r: TreeRecipe): string => tr(jaTypeName(r.tree.base), r.tree.base);
/** 1 枚の要約 (ベースの絵・完成の狙い・印・空の木か。帯の小窓と同じ) */
const sumOf = (r: TreeRecipe) => recipeSummary(r.tree);
const countOf = (r: TreeRecipe): { boxes: number; done: number } => {
  const bs = Object.values(r.tree.boxes);
  return { boxes: bs.length, done: bs.filter((b) => b.done).length };
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

// 共有 = URL をコピー (共有・管理は URL が主、オーナー 10-22「URL で基本、共有・管理だね」。X に投稿は計算を繋いだ後)
async function copyUrl(r: TreeRecipe): Promise<void> {
  const ok = await navigator.clipboard.writeText(await treeShareUrl(r)).then(() => true, () => false);
  track("tree-recipe:url");
  say(ok ? tr(`「${r.name}」の URL をコピーしました (URL に木が全部入っている。開いた人はこの木で始まり、その人のレシピにも残る)`, `Copied the URL for "${r.name}" (the whole tree is in it; opening it starts this tree and saves it)`) : tr("コピーできませんでした", "Couldn't copy"));
}

// URL を貼って開く
const { url, urlNote, openUrl, onPaste } = useRecipeUrl();

function back(): void { openTreePage(); }
function onKey(e: KeyboardEvent): void { if (e.key === "Escape" && !renaming.value) { back(); } }
let before = 0;
onMounted(() => { before = window.scrollY; window.scrollTo(0, 0); window.addEventListener("keydown", onKey); });
// ツリーから来た作りかけの木を、ここからシミュの外へ出る時も聞く (ツリーのページと同じ。ツリーへ戻る時は聞かない。page.ts の mustAsk がツリーのページの間だけなので、今は効かない)。
// 外へ出たら木を白紙に戻す (10-24 夜、作業中の木は持ち越さない)。ただし聞けていない間は、未保存の変更がある木は黙って消さない
onMounted(() => setLeaveGuard((to) => !to.startsWith("page=sim-") && dirty.value));
onBeforeUnmount(() => { setLeaveGuard(null); if (!treePage.value && !dirty.value) t.resetAll(); });
onBeforeUnmount(() => { window.removeEventListener("keydown", onKey); clearTimeout(noteT); const y = before; requestAnimationFrame(() => window.scrollTo(0, y)); });
</script>

<template>
  <section data-recipes-page class="min-w-0 flex-1 p-4 max-md:px-2">
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <h1 class="g-tabbar g-brush flex min-w-0 flex-1 items-center px-8 text-[22px] max-md:!min-h-[40px] max-md:px-6 max-md:text-[15px] tracking-[0.18em] max-md:tracking-[0.04em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_2px_#000,0_0_16px_rgba(255,200,110,0.3)]">{{ tr("レシピ", "Recipes") }}</h1>
      <!-- ツリーへ戻る道は題の横 (ここから戻る道がほかに無い。右上でなく題の横、10-24 オーナー)。Esc でも戻る -->
      <button type="button" data-recipes-back class="g-btn sm order-first" :title="tr('ツリーへ戻る (Esc)', 'Back to the tree (Esc)')" @click="back">{{ tr("← ツリーへ", "← Tree") }}</button>
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
          <!-- ベースの絵 (空の木は空の印)。要約は帯の「レシピ ▾」の小窓と同じ recipe-summary.ts (10-23 オーナー「視覚的に管理しやすく」) -->
          <img v-if="sumOf(r).art" :src="sumOf(r).art!" alt="" class="size-12 shrink-0 object-contain" draggable="false" />
          <span v-else data-recipe-empty class="flex size-12 shrink-0 items-center justify-center rounded bg-white/[0.06] text-[11px] opacity-60">{{ sumOf(r).empty ? tr("空", "Empty") : "" }}</span>
          <div class="min-w-0 flex-1">
            <input v-if="renaming === r.id" :data-recipe-rename="r.id" :value="r.name" class="h-8 w-full rounded border border-amber-400/60 bg-black/50 px-1.5 text-[14px] font-bold outline-none max-md:h-10" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" @keydown.esc.stop="renaming = null" @blur="endRename(r, ($event.target as HTMLInputElement).value)" />
            <p v-else class="flex min-w-0 items-center gap-1.5">
              <b class="min-w-0 break-words text-[14px] text-[var(--exile-color-text-primary)]">{{ r.name }}</b>
              <button type="button" data-recipe-rename-btn class="grid size-7 shrink-0 place-items-center rounded opacity-50 hover:bg-white/10 hover:opacity-100 max-md:size-9" :title="tr('名前を変える', 'Rename')" @click="startRename(r)"><Icon name="pencil" class="size-3.5" /></button>
              <span v-if="r.id === currentTreeRecipeId" class="shrink-0 rounded-sm bg-amber-500/20 px-1.5 text-[11px] font-bold text-amber-200">{{ tr("開いている", "Open") }}</span>
            </p>
            <p data-recipe-sum class="mt-0.5 min-w-0 break-words text-[12px] text-[var(--exile-color-text-secondary)]">
              <template v-if="sumOf(r).empty">{{ tr("ベースなし", "No base") }}</template>
              <template v-else>{{ baseName(r) }} · {{ tr(`完成の狙い ${sumOf(r).aims} つ`, `${sumOf(r).aims} final target(s)`) }}<span v-if="sumOf(r).marks" class="text-mod-fractured"> · ✦ {{ sumOf(r).marks }}</span> · {{ tr(`箱 ${countOf(r).boxes}`, `${countOf(r).boxes} boxes`) }} · {{ tr(`完成 ${countOf(r).done}`, `${countOf(r).done} done`) }}</template>
            </p>
            <p v-if="sumOf(r).first" class="min-w-0 truncate text-[12px] text-[#c8c8ff]" :title="sumOf(r).first">{{ sumOf(r).first }}</p>
            <p class="text-[11px] opacity-50">{{ tr(`更新 ${fmtDate(touchedAtTree(r))}`, `Updated ${fmtDate(touchedAtTree(r))}`) }}<template v-if="r.updatedAt !== r.savedAt"> · {{ tr(`作成 ${fmtDate(r.savedAt)}`, `Created ${fmtDate(r.savedAt)}`) }}</template></p>
            <div class="mt-2 flex flex-wrap items-center gap-1.5">
              <button type="button" data-recipe-open class="max-md:min-h-10" :class="arm.is(`open:${r.id}`) ? ARMED_CLASS : 'g-btn sm'" :title="tr('この木をクラフトの道で開く', 'Open this tree in the crafting path')" @click="open(r)">{{ arm.is(`open:${r.id}`) ? tr("保存していない変更が消えます。もう一度押すと開く", "Unsaved changes will be lost. Click again to open") : tr("開く", "Open") }}</button>
              <button v-if="dirty && r.id === currentTreeRecipeId" type="button" data-recipe-overwrite class="max-md:min-h-10" :class="arm.is(`over:${r.id}`) ? ARMED_CLASS : 'g-btn sm'" :title="tr('今の木でこのレシピを書き換える', 'Replace this recipe with the current tree')" @click="overwrite(r)">{{ arm.is(`over:${r.id}`) ? tr("もう一度押すと上書き", "Click again to overwrite") : tr("今の木で上書き", "Overwrite with current") }}</button>
              <button type="button" data-recipe-duplicate class="g-btn sm inline-flex items-center gap-1 max-md:min-h-10" @click="duplicate(r)"><Icon name="copy" class="size-3.5" />{{ tr("複製", "Duplicate") }}</button>
              <button type="button" data-recipe-copy-url class="g-btn sm inline-flex items-center gap-1 max-md:min-h-10" :title="tr('この木の URL をコピー (URL に木が全部入っている)', 'Copy the URL of this tree (the whole tree is in it)')" @click="copyUrl(r)"><Icon name="link" class="size-3.5" />{{ tr("URL をコピー", "Copy URL") }}</button>
              <button type="button" data-recipe-delete class="ml-auto inline-flex items-center gap-1 max-md:min-h-10" :class="arm.is(`del:${r.id}`) ? ARMED_CLASS : 'g-btn sm hover:!text-rose-300'" :title="tr('このレシピを消す (2 回押す。消した後も「元に戻す」で戻せる)', 'Delete this recipe (click twice; Undo appears right after)')" @click="remove(r)"><Icon name="trash" class="size-3.5" />{{ arm.is(`del:${r.id}`) ? tr("もう一度押すと消す", "Click again to delete") : tr("消す", "Delete") }}</button>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>
