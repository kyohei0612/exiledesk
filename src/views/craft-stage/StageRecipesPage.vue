<!--
  StageRecipesPage.vue — シミュレーターのレシピのページ (?page=recipes。2026-10-21 オーナー「レシピ消したり上書きしたり色々できるようにしないと
  そもそも作りがお粗末、レシピ周りシェアもないし。しっかり作りこんでくれ」)。

  保存したレシピを 1 枚ずつ: 開く・今の状態で上書き・名前を変える・複製・共有 (URL / X)・消す (消した後「元に戻す」)。
  上に 探す・並べ替え・今の状態を新しく保存・URL を貼って開く・ファイルの書き出し / 読み込み (別の PC・ブラウザへ持っていく)。
  一覧は state/sim-recipe-store.ts (シミュレーターの右上 SimRecipeBar・ベースを選ぶページの「レシピから始める」と同じ物)。
  広告の決まりどおりページを移る形 ([[ads-page-model]])。両脇の縦長の枠は WebApp.vue
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import Icon from "../../components/ui/Icon.vue";
import { craftStage as s, mergeRecipesFromFile, recipesToFile, type SimRecipe } from "../../state/craft-stage";
import { currentRecipe, currentRecipeId, duplicateRecipe, overwriteRecipe, recipeList, removeRecipe, renameRecipe, replaceRecipes, restoreRecipe, sameContent, saveNewRecipe, simNow, touchedAt } from "../../state/sim-recipe-store";
import { recipesPage } from "../../state/web-page";
import { openBasePage } from "../../web/page";
import { baseArt } from "../../services/craft-stage/base-art";
import { openRecipeCode, recipeCodeOf, recipeShareText, recipeShareUrl, recipeXUrl, shareRecipeX } from "./recipe-share";
import { useStageBase } from "./use-stage-base";
import { useArmed, ARMED_CLASS } from "../../utils/use-armed";
import { track } from "../../utils/track";
import { jaTypeName } from "../../services/trade2/localize";
import { tr } from "../../i18n/lang";

const fmtDate = (t: number): string => { const d = new Date(t); return `${d.getFullYear() === new Date().getFullYear() ? "" : `${d.getFullYear()}/`}${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
/** ベースの名前 (古いレシピは baseJa が英語のまま残っている事がある) */
const baseName = (r: SimRecipe): string => tr(r.baseJa && r.baseJa !== r.session.base ? r.baseJa : jaTypeName(r.session.base), r.session.base);
const answersOf = (r: SimRecipe): number => r.session.patterns.reduce((a, p) => a + Object.values(p.quiz?.rules ?? {}).reduce((b, x) => b + (Array.isArray(x) ? x.length : 0), 0), 0);

/** シミュレーターの今の状態 (ベースを選んで組んでいる時だけ) */
const live = computed(() => (s.simPicked.value ? simNow.value : null));
/** 保存していない変更 (開いているレシピと違う / 開いていないのに狙いがある) */
const dirty = computed(() => {
  const n = live.value;
  if (!n) return false;
  const ses = n.session();
  return currentRecipe.value ? !sameContent(ses, currentRecipe.value.session) : ses.targets.length > 0;
});

// 探す・並べ替え (並べ替えは覚える)
const SORT_KEY = "exiledesk.recipes.sort";
type Sort = "new" | "name" | "base";
const query = ref("");
const sort = ref<Sort>((() => { try { const v = localStorage.getItem(SORT_KEY); return v === "name" || v === "base" ? v : "new"; } catch { return "new"; } })());
function setSort(v: Sort): void { sort.value = v; try { localStorage.setItem(SORT_KEY, v); } catch { /* 無くてよい */ } }
const shown = computed(() => {
  const q = query.value.trim().toLowerCase();
  const list = recipeList.value.filter((r) => !q || r.name.toLowerCase().includes(q) || baseName(r).toLowerCase().includes(q) || r.session.base.toLowerCase().includes(q));
  const by = sort.value === "name" ? (a: SimRecipe, b: SimRecipe) => a.name.localeCompare(b.name, "ja")
    : sort.value === "base" ? (a: SimRecipe, b: SimRecipe) => baseName(a).localeCompare(baseName(b), "ja") || touchedAt(b) - touchedAt(a)
    : (a: SimRecipe, b: SimRecipe) => touchedAt(b) - touchedAt(a);
  return [...list].sort(by);
});

/** 終わった時の一言 (消した時は「元に戻す」付き) */
const note = ref<{ text: string; undo?: () => void } | null>(null);
let noteT = 0;
function say(text: string, undo?: () => void): void { note.value = { text, undo }; clearTimeout(noteT); noteT = window.setTimeout(() => { note.value = null; }, undo ? 10_000 : 3_000); }

/** 2 回押し (開く = 保存していない変更が消える時だけ / 上書き) */
const arm = useArmed();

function open(r: SimRecipe): void {
  if (dirty.value && currentRecipeId.value !== r.id && !arm.arm(`open:${r.id}`)) return;
  track("recipe:open");
  s.mode.value = "sim";
  useStageBase().startFromRecipe(r);
}
function overwrite(r: SimRecipe): void {
  const n = live.value;
  if (!n || !arm.arm(`over:${r.id}`)) return;
  overwriteRecipe(r.id, n.session(), n.baseJa());
  currentRecipeId.value = r.id;
  track("recipe:overwrite");
  say(tr(`「${r.name}」を今の状態で上書きしました`, `Overwrote "${r.name}" with the current state`));
}
function saveNow(): void {
  const n = live.value;
  if (!n) return;
  const r = saveNewRecipe(`${n.baseJa()} ${fmtDate(Date.now())}`, n.baseJa(), n.session());
  track("recipe:save");
  say(tr(`「${r.name}」で保存しました (名前は ✎ で変えられる)`, `Saved as "${r.name}" (rename with ✎)`));
  renaming.value = r.id;
}
function duplicate(r: SimRecipe): void {
  const x = duplicateRecipe(r.id, tr(" のコピー", " (copy)"));
  if (x) { track("recipe:duplicate"); say(tr(`「${x.name}」を作りました`, `Created "${x.name}"`)); }
}
function remove(r: SimRecipe): void {
  const wasCurrent = currentRecipeId.value === r.id;
  const x = removeRecipe(r.id);
  if (!x) return;
  track("recipe:delete");
  say(tr(`「${r.name}」を消しました`, `Deleted "${r.name}"`), () => { restoreRecipe(x); if (wasCurrent) currentRecipeId.value = r.id; note.value = null; });
}

// 名前を変える (その場で)
const renaming = ref<string | null>(null);
function startRename(r: SimRecipe): void { renaming.value = r.id; void nextTick(() => (document.querySelector(`[data-recipe-rename="${r.id}"]`) as HTMLInputElement | null)?.select()); }
function endRename(r: SimRecipe, v: string): void { if (renaming.value !== r.id) return; renaming.value = null; renameRecipe(r.id, v); }

// 共有 (札ごとの吹き出し)
const sharing = ref<{ id: string; url: string; text: string } | null>(null);
async function openShare(r: SimRecipe): Promise<void> {
  if (sharing.value?.id === r.id) { sharing.value = null; return; }
  sharing.value = { id: r.id, url: "", text: recipeShareText(r) };
  const url = await recipeShareUrl(r);
  if (sharing.value?.id === r.id) sharing.value = { ...sharing.value, url };
}
async function copyUrl(r: SimRecipe): Promise<void> {
  const url = sharing.value?.id === r.id && sharing.value.url ? sharing.value.url : await recipeShareUrl(r);
  const ok = await navigator.clipboard.writeText(url).then(() => true, () => false);
  track("recipe:url");
  sharing.value = null;
  say(ok ? tr(`「${r.name}」の URL をコピーしました (開いた人はこのレシピで始まる)`, `Copied the URL for "${r.name}" (opening it starts this recipe)`) : tr("コピーできませんでした", "Couldn't copy"));
}
function toX(e: MouseEvent, r: SimRecipe): void {
  if (!sharing.value?.url) { e.preventDefault(); return; }
  shareRecipeX(e, sharing.value.text, sharing.value.url, r.session.base);
  track("recipe:x");
  sharing.value = null;
}

// URL を貼って開く
const url = ref("");
const urlNote = ref("");
async function openUrl(): Promise<void> {
  const code = recipeCodeOf(url.value);
  if (!code) { urlNote.value = url.value.trim() ? tr("レシピの URL ではありません (#recipe= の付いた URL を貼る)", "Not a recipe URL (paste one with #recipe=)") : ""; return; }
  const ok = await openRecipeCode(code);
  urlNote.value = ok ? "" : tr("このレシピは読めませんでした", "Couldn't read this recipe");
  if (ok) { url.value = ""; recipesPage.value = false; }
}
function onPaste(): void { void nextTick(() => { if (recipeCodeOf(url.value)) void openUrl(); }); }

// ファイル (全部を 1 つのファイルに。別の PC・ブラウザへ持っていく)
const file = ref<HTMLInputElement | null>(null);
function exportAll(): void {
  const name = `exiledesk-recipes-${new Date().toISOString().slice(0, 10)}.json`;
  const href = URL.createObjectURL(new Blob([recipesToFile(recipeList.value)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 5_000);
  say(tr(`${recipeList.value.length} 件を ${name} に書き出しました`, `Exported ${recipeList.value.length} recipes to ${name}`));
}
async function importFile(ev: Event): Promise<void> {
  const f = (ev.target as HTMLInputElement).files?.[0];
  (ev.target as HTMLInputElement).value = "";
  if (!f) return;
  const r = mergeRecipesFromFile(await f.text(), recipeList.value);
  if (r.added) replaceRecipes(r.list);
  say(r.bad && !r.added && !r.skipped ? tr("レシピのファイルではありません", "Not a recipe file") : tr(`${r.added} 件足しました${r.skipped ? ` (同じ物 ${r.skipped} 件は飛ばした)` : ""}${r.bad ? ` · 読めない物 ${r.bad} 件` : ""}`, `Added ${r.added}${r.skipped ? ` (skipped ${r.skipped} duplicates)` : ""}${r.bad ? ` · ${r.bad} unreadable` : ""}`));
}

function back(): void { recipesPage.value = false; }
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
        <button type="button" data-recipes-back class="g-btn sm max-md:min-h-10" @click="back">{{ s.simPicked.value ? tr("← シミュレーターへ戻る", "← Back to simulator") : tr("← 戻る", "← Back") }}</button>
        <span class="text-[12px] opacity-60 max-md:hidden">{{ tr("Esc でも戻る", "Esc also goes back") }}</span>
      </span>
    </div>

    <div class="g-panel px-4 py-3 text-[13px] max-md:px-3">
      <!-- 今の状態 (シミュレーターで組んでいる時) -->
      <div v-if="live" data-recipes-now class="mb-3 flex flex-wrap items-center gap-2 rounded-md bg-white/[0.04] px-3 py-2">
        <span class="text-[var(--exile-color-text-secondary)]">{{ tr("今の状態", "Current state") }}:</span>
        <b class="min-w-0 truncate">{{ currentRecipe ? currentRecipe.name : live.baseJa() }}</b>
        <span v-if="dirty" class="inline-flex items-center gap-1 text-[12px] text-amber-300"><span class="size-1.5 rounded-full bg-amber-400" />{{ tr("未保存の変更あり", "Unsaved changes") }}</span>
        <span v-else-if="currentRecipe" class="text-[12px] text-emerald-300/80">{{ tr("保存済み", "Saved") }}</span>
        <button type="button" data-recipes-save-now class="g-btn sm ml-auto inline-flex items-center gap-1 max-md:min-h-10" @click="saveNow"><Icon name="plus" class="size-4" />{{ tr("今の状態を新しく保存", "Save current as new") }}</button>
      </div>

      <!-- 探す・並べ替え・URL・ファイル -->
      <div class="flex flex-wrap items-center gap-2">
        <span class="relative min-w-0 flex-1 basis-56">
          <Icon name="search" class="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 opacity-50" />
          <input v-model="query" data-recipes-search type="search" class="h-8 w-full rounded-lg border border-white/15 bg-black/40 pl-8 pr-2 outline-none focus:border-amber-400/60 max-md:h-11" :placeholder="tr('名前・ベースで探す', 'Search by name or base')" />
        </span>
        <span class="flex items-center gap-1 text-[12px]" role="group" :aria-label="tr('並べ替え', 'Sort')">
          <button v-for="o in ([['new', '更新順', 'Recent'], ['name', '名前順', 'Name'], ['base', 'ベース順', 'Base']] as const)" :key="o[0]" type="button" class="h-8 rounded-md border px-2 max-md:h-10" :class="sort === o[0] ? 'border-amber-400/70 bg-amber-500/15 text-amber-100' : 'border-white/10 opacity-70 hover:opacity-100'" :aria-pressed="sort === o[0]" @click="setSort(o[0])">{{ tr(o[1], o[2]) }}</button>
        </span>
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
        <span class="flex min-w-0 flex-1 basis-72 items-center gap-1.5">
          <input v-model="url" data-recipes-url type="text" inputmode="url" spellcheck="false" autocomplete="off" class="h-8 min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-2 outline-none placeholder:opacity-45 focus:border-amber-400/60 max-md:h-11" :placeholder="tr('共有されたレシピの URL を貼る (貼ると開く)', 'Paste a shared recipe URL (opens on paste)')" @paste="onPaste" @keydown.enter.prevent="openUrl" />
          <button type="button" class="g-btn sm max-md:min-h-10" :disabled="!url.trim()" @click="openUrl">{{ tr("開く", "Open") }}</button>
        </span>
        <button type="button" data-recipes-new class="g-btn sm max-md:min-h-10" @click="openBasePage">{{ tr("新しく作る (ベースを選ぶ)", "New (choose a base)") }}</button>
        <button type="button" data-recipes-export class="g-btn sm max-md:min-h-10" :disabled="!recipeList.length" :title="tr('全部のレシピを 1 つのファイルに (別の PC・ブラウザで読み込むと戻せる)', 'Export all recipes to one file (import it on another PC or browser)')" @click="exportAll">{{ tr("ファイルに書き出す", "Export file") }}</button>
        <button type="button" data-recipes-import class="g-btn sm max-md:min-h-10" :title="tr('書き出したファイルからレシピを足す (今のレシピは消えない)', 'Add recipes from an exported file (existing ones stay)')" @click="file?.click()">{{ tr("ファイルから読み込む", "Import file") }}</button>
        <input ref="file" type="file" accept=".json,application/json" class="hidden" @change="importFile" />
      </div>
      <p v-if="urlNote" class="mt-1 text-[12px] text-amber-200">{{ urlNote }}</p>

      <!-- 一言 (消した時は元に戻す) -->
      <p v-if="note" data-recipes-note class="mt-3 flex items-center gap-2 rounded-md bg-emerald-900/30 px-3 py-1.5 text-[12px] text-emerald-100">
        {{ note.text }}
        <button v-if="note.undo" type="button" data-recipes-undo class="g-btn sm ml-auto inline-flex items-center gap-1 max-md:min-h-10" @click="note.undo()"><Icon name="undo" class="size-4" />{{ tr("元に戻す", "Undo") }}</button>
      </p>

      <!-- 一覧 -->
      <p v-if="!recipeList.length" class="py-10 text-center text-[var(--exile-color-text-secondary)]">{{ tr("まだ保存したレシピはありません。シミュレーターで組んで、右上の「保存」で残せます", "No saved recipes yet. Build one in the simulator and use Save at the top right") }}</p>
      <p v-else-if="!shown.length" class="py-6 text-center opacity-60">{{ tr("見つかりません", "No matches") }}</p>
      <ul v-else class="mt-3 grid gap-2 lg:grid-cols-2">
        <li v-for="r in shown" :key="r.id" data-recipe-card :data-recipe-id="r.id" class="relative flex min-w-0 items-start gap-3 rounded-md border bg-black/30 px-3 py-2.5 max-md:flex-wrap" :class="r.id === currentRecipeId ? 'border-[var(--exile-color-border-brass)]' : 'border-white/10'">
          <img v-if="baseArt(r.session.base)" :src="baseArt(r.session.base)!" alt="" class="size-12 shrink-0 object-contain" draggable="false" />
          <span v-else class="size-12 shrink-0" />
          <div class="min-w-0 flex-1">
            <input v-if="renaming === r.id" :data-recipe-rename="r.id" :value="r.name" class="h-8 w-full rounded border border-amber-400/60 bg-black/50 px-1.5 text-[14px] font-bold outline-none max-md:h-10" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" @keydown.esc.stop="renaming = null" @blur="endRename(r, ($event.target as HTMLInputElement).value)" />
            <p v-else class="flex min-w-0 items-center gap-1.5">
              <b class="min-w-0 break-words text-[14px] text-[var(--exile-color-text-primary)]">{{ r.name }}</b>
              <button type="button" data-recipe-rename-btn class="grid size-7 shrink-0 place-items-center rounded opacity-50 hover:bg-white/10 hover:opacity-100 max-md:size-9" :title="tr('名前を変える', 'Rename')" @click="startRename(r)"><Icon name="pencil" class="size-3.5" /></button>
              <span v-if="r.id === currentRecipeId" class="shrink-0 rounded-sm bg-amber-500/20 px-1.5 text-[11px] font-bold text-amber-200">{{ tr("開いている", "Open") }}</span>
            </p>
            <p class="mt-0.5 text-[12px] text-[var(--exile-color-text-secondary)]">{{ baseName(r) }} · {{ tr(`狙い ${r.session.targets.length} つ`, `${r.session.targets.length} targets`) }} · {{ tr(`パターン ${r.session.patterns.length} つ`, `${r.session.patterns.length} patterns`) }}<template v-if="answersOf(r)"> · {{ tr(`答え ${answersOf(r)}`, `${answersOf(r)} answers`) }}</template></p>
            <p class="text-[11px] opacity-50">{{ tr(`更新 ${fmtDate(touchedAt(r))}`, `Updated ${fmtDate(touchedAt(r))}`) }}<template v-if="r.updatedAt && r.updatedAt !== r.savedAt"> · {{ tr(`作成 ${fmtDate(r.savedAt)}`, `Created ${fmtDate(r.savedAt)}`) }}</template></p>
            <!-- 操作 -->
            <div class="mt-2 flex flex-wrap items-center gap-1.5">
              <button type="button" data-recipe-open class="max-md:min-h-10" :class="arm.is(`open:${r.id}`) ? ARMED_CLASS : 'g-btn sm'" :title="tr('このレシピでシミュレーターを始める', 'Start the simulator with this recipe')" @click="open(r)">{{ arm.is(`open:${r.id}`) ? tr("保存していない変更が消えます。もう一度押すと開く", "Unsaved changes will be lost. Click again to open") : tr("開く", "Open") }}</button>
              <button v-if="live && dirty && r.id === currentRecipeId" type="button" data-recipe-overwrite class="max-md:min-h-10" :class="arm.is(`over:${r.id}`) ? ARMED_CLASS : 'g-btn sm'" :title="tr('シミュレーターの今の状態でこのレシピを書き換える', 'Replace this recipe with the current simulator state')" @click="overwrite(r)">{{ arm.is(`over:${r.id}`) ? tr("もう一度押すと上書き", "Click again to overwrite") : tr("今の状態で上書き", "Overwrite with current") }}</button>
              <button type="button" data-recipe-duplicate class="g-btn sm inline-flex items-center gap-1 max-md:min-h-10" @click="duplicate(r)"><Icon name="copy" class="size-3.5" />{{ tr("複製", "Duplicate") }}</button>
              <button type="button" data-recipe-share-btn class="g-btn sm inline-flex items-center gap-1 max-md:min-h-10" :aria-expanded="sharing?.id === r.id" @click="openShare(r)"><Icon name="share" class="size-3.5" />{{ tr("共有", "Share") }}</button>
              <button type="button" data-recipe-delete class="g-btn sm ml-auto inline-flex items-center gap-1 hover:!text-rose-300 max-md:min-h-10" :title="tr('このレシピを消す (すぐ下の「元に戻す」で戻せる)', 'Delete this recipe (Undo appears right after)')" @click="remove(r)"><Icon name="trash" class="size-3.5" />{{ tr("消す", "Delete") }}</button>
            </div>
            <!-- 共有の吹き出し -->
            <div v-if="sharing?.id === r.id" data-recipe-share-panel class="mt-2 rounded-md border border-[var(--exile-color-border-brass)]/60 bg-[#14110d] p-2.5">
              <div class="flex flex-wrap gap-2">
                <button type="button" data-recipe-copy-url class="g-btn sm inline-flex flex-1 items-center justify-center gap-1.5 max-md:min-h-11" @click="copyUrl(r)"><Icon name="link" class="size-4" />{{ tr("URL をコピー", "Copy URL") }}</button>
                <a data-recipe-x class="g-btn sm inline-flex flex-1 items-center justify-center gap-1.5 max-md:min-h-11" :class="sharing.url ? '' : 'pointer-events-none opacity-40'" :href="sharing.url ? recipeXUrl(sharing.text, sharing.url) : undefined" target="_blank" rel="noopener" @click="toX($event, r)">{{ tr("X に投稿", "Post on X") }}</a>
              </div>
              <p class="mt-1.5 text-[11px] opacity-50">{{ tr("URL にレシピが全部入っています。開いた人はこのレシピでシミュレーターが始まり、その人のレシピにも残ります", "The whole recipe is in the URL. Opening it starts the simulator with it and saves it to their recipes") }}</p>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>
