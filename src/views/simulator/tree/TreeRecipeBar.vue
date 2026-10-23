<!--
  TreeRecipeBar.vue — ツリーの上の帯のレシピ (2026-10-21 オーナー 10-22「ツリー形式に変えてから無くなった物を足さないと」。工程式の SimRecipeBar と同じ役):
  今のレシピの名前 (押すと名前を変える)・● 未保存・保存 (開いているレシピへ上書き、無ければ新しく)・「レシピ ▾」の窓
  (保存したレシピから開く・共有された URL を貼る・別名で保存・URL をコピー・レシピのページへ)。一覧は state/simulator/tree-recipes.ts
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import Icon from "../../../components/ui/Icon.vue";
import { currentTreeRecipe, overwriteTreeRecipe, renameTreeRecipe, sameTree, saveTreeRecipe, setCurrentTreeRecipe, touchedAtTree, treeRecipes, type TreeRecipe } from "../../../state/simulator/tree-recipes";
import { openRecipesPage } from "../../../web/page";
import { fmtDate, treeShareUrl, useRecipeUrl } from "../recipe-share";
import { useTree } from "./use-tree";
import { recipeSummary } from "./recipe-summary";
import { useArmed, ARMED_CLASS } from "../../../utils/use-armed";
import { track } from "../../../utils/track";
import { jaTypeName } from "../../../services/trade2/localize";
import { tr } from "../../../i18n/lang";

const t = useTree();
/** opened = 別の木を開いた (ツリーの側で全体に合わせる) */
const emit = defineEmits<{ opened: [] }>();
/** menuOnly = 「レシピ ▾」だけ (名前・保存・別名で保存・URL をコピーは出さない)。完成形の設定の段のタブの右端で使う (小窓は右寄せ、10-23 オーナー) */
const props = defineProps<{ menuOnly?: boolean }>();
/** 開いている木に保存の手が要らない時 (ベースが無い空の形・完成形の設定の右端) */
const bare = computed(() => t.needBase.value || !!props.menuOnly);
/** 一覧の 1 行の要約 (ベースの絵・狙い・印) */
const sum = (r: { tree: Parameters<typeof recipeSummary>[0] }) => recipeSummary(r.tree);
const dirty = computed(() => (currentTreeRecipe.value ? !sameTree(t.doc.value, currentTreeRecipe.value.tree) : Object.keys(t.doc.value.boxes).length > 1));
const defaultName = (): string => `${tr(jaTypeName(t.doc.value.base), t.doc.value.base)} ${fmtDate(Date.now())}`;

const note = ref("");
let noteT = 0;
function say(text: string): void { note.value = text; clearTimeout(noteT); noteT = window.setTimeout(() => { note.value = ""; }, 3_000); }

// 名前を変える (その場で。保存していない木は名前を付けて保存)
const renaming = ref(false);
const nameInput = ref<HTMLInputElement | null>(null);
function startRename(): void { renaming.value = true; void nextTick(() => nameInput.value?.select()); }
function endRename(v: string): void {
  if (!renaming.value) return;
  renaming.value = false;
  if (!v.trim()) return;
  if (currentTreeRecipe.value) renameTreeRecipe(currentTreeRecipe.value.id, v);
  else { saveTreeRecipe(v, t.doc.value); track("tree-recipe:save"); say(tr(`「${v.trim()}」で保存しました`, `Saved as "${v.trim()}"`)); }
}
function save(): void {
  const cur = currentTreeRecipe.value;
  if (cur) { overwriteTreeRecipe(cur.id, t.doc.value); track("tree-recipe:overwrite"); say(tr(`「${cur.name}」に保存しました`, `Saved to "${cur.name}"`)); return; }
  const r = saveTreeRecipe(defaultName(), t.doc.value);
  track("tree-recipe:save");
  say(tr(`「${r.name}」で保存しました (名前を押すと変えられる)`, `Saved as "${r.name}" (click the name to rename)`));
}
function saveAs(): void {
  const r = saveTreeRecipe(currentTreeRecipe.value ? `${currentTreeRecipe.value.name}${tr(" のコピー", " (copy)")}` : defaultName(), t.doc.value);
  track("tree-recipe:save-as");
  pop.value = false;
  say(tr(`「${r.name}」で保存しました`, `Saved as "${r.name}"`));
  startRename();
}

// 「レシピ ▾」の窓
const pop = ref(false);
const root = ref<HTMLElement | null>(null);
const arm = useArmed();
const recent = computed(() => [...treeRecipes.value].sort((a, b) => touchedAtTree(b) - touchedAtTree(a)).slice(0, 8));
function open(r: TreeRecipe): void {
  if (dirty.value && currentTreeRecipe.value?.id !== r.id && !arm.arm(`open:${r.id}`)) return;
  setCurrentTreeRecipe(r.id);
  t.open(r.tree);
  pop.value = false;
  emit("opened");
  track("tree-recipe:open");
}
const { url, urlNote, openUrl, onPaste } = useRecipeUrl({
  notUrl: ["レシピの URL ではありません", "Not a recipe URL"],
  unreadable: ["このレシピは読めませんでした (前の工程式のレシピかもしれない)", "Couldn't read this recipe (it may be an old step-style one)"],
  onOpened: () => { pop.value = false; emit("opened"); },
});
async function copyUrl(): Promise<void> {
  const name = currentTreeRecipe.value?.name ?? defaultName();
  const ok = await navigator.clipboard.writeText(await treeShareUrl({ name, tree: t.doc.value })).then(() => true, () => false);
  track("tree-recipe:url");
  pop.value = false;
  say(ok ? tr("今の木の URL をコピーしました (開いた人はこの木で始まる)", "Copied a URL for this tree (opening it starts with this tree)") : tr("コピーできませんでした", "Couldn't copy"));
}
function onDown(e: PointerEvent): void { if (pop.value && root.value && !root.value.contains(e.target as Node)) pop.value = false; }
function onKey(e: KeyboardEvent): void { if (e.key === "Escape" && pop.value) { pop.value = false; e.stopImmediatePropagation(); } }
onMounted(() => { window.addEventListener("pointerdown", onDown, true); window.addEventListener("keydown", onKey, true); });
onBeforeUnmount(() => { window.removeEventListener("pointerdown", onDown, true); window.removeEventListener("keydown", onKey, true); clearTimeout(noteT); });
</script>

<template>
  <span ref="root" data-tree-recipe-bar class="relative flex min-w-0 items-center gap-1.5">
    <input v-if="renaming && !bare" ref="nameInput" data-tree-recipe-name-input :value="currentTreeRecipe?.name ?? defaultName()" class="h-8 w-56 rounded border border-amber-400/60 bg-black/50 px-1.5 text-[13px] font-bold outline-none" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" @keydown.esc.stop="renaming = false" @blur="endRename(($event.target as HTMLInputElement).value)" />
    <button v-else-if="!bare" type="button" data-tree-recipe-name class="flex h-8 min-w-0 max-w-[240px] items-center gap-1.5 rounded px-1.5 text-[13px] hover:bg-white/[0.06]" :title="tr('名前を変える', 'Rename')" @click="startRename">
      <b class="min-w-0 truncate">{{ currentTreeRecipe?.name ?? tr("名前なし", "Untitled") }}</b>
      <span v-if="dirty" data-tree-recipe-dirty class="size-2 shrink-0 rounded-full bg-amber-400" :title="tr('保存していない変更がある', 'Unsaved changes')" />
    </button>
    <button v-if="!bare" type="button" data-tree-recipe-save class="g-btn sm" :title="currentTreeRecipe ? tr('開いているレシピに上書き保存', 'Save to the open recipe') : tr('名前を付けて新しく保存', 'Save as a new recipe')" @click="save">{{ tr("保存", "Save") }}</button>
    <button type="button" data-tree-recipe-menu class="g-btn sm inline-flex items-center gap-1" :aria-expanded="pop" @click="pop = !pop">{{ tr("レシピ", "Recipes") }} ▾</button>
    <span v-if="note" class="pointer-events-none absolute left-0 top-full z-30 mt-1 whitespace-nowrap rounded bg-emerald-900/90 px-2 py-1 text-[12px] text-emerald-100">{{ note }}</span>

    <div v-if="pop" data-tree-recipe-pop :class="menuOnly ? 'right-0' : 'left-0'" class="absolute top-full z-40 mt-1 flex w-[340px] max-w-[calc(100vw-2.5rem)] flex-col gap-1.5 rounded-lg border border-[var(--exile-color-border-brass)]/60 bg-[#14110d] p-2 text-[12px] shadow-[0_8px_24px_rgba(0,0,0,0.7)]">
      <p class="opacity-60">{{ tr("保存したレシピから開く", "Open a saved recipe") }}</p>
      <p v-if="!recent.length" class="py-1 opacity-50">{{ tr("まだありません", "None yet") }}</p>
      <!-- 1 行 = ベースの絵 (空の木は空の印)・名前・ベース · 狙いの数と主な狙い · ✦ の数・日時 (10-23 オーナー「視覚的に管理しやすく」、要約は recipe-summary.ts) -->
      <button v-for="r in recent" :key="r.id" type="button" data-tree-recipe-open class="flex min-h-11 min-w-0 items-center gap-2 rounded px-1.5 py-1 text-left" :class="arm.is(`open:${r.id}`) ? ARMED_CLASS : 'hover:bg-white/[0.06]'" @click="open(r)">
        <img v-if="sum(r).art" :src="sum(r).art!" alt="" class="size-9 shrink-0 object-contain" draggable="false" />
        <span v-else data-tree-recipe-empty class="flex size-9 shrink-0 items-center justify-center rounded bg-white/[0.06] text-[10px] opacity-60">{{ sum(r).empty ? tr("空", "Empty") : "" }}</span>
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="truncate" :class="r.id === currentTreeRecipe?.id ? 'font-bold text-amber-200' : ''">{{ arm.is(`open:${r.id}`) ? tr("保存していない変更が消えます。もう一度押すと開く", "Unsaved changes will be lost. Click again") : r.name }}</span>
          <span data-tree-recipe-sum class="truncate text-[11px] opacity-70" :title="sum(r).first">{{ sum(r).empty ? tr("ベースなし", "No base") : [sum(r).base, sum(r).aims ? tr(`狙い ${sum(r).aims}`, `${sum(r).aims} target(s)`) : "", sum(r).first].filter(Boolean).join(" · ") }}</span>
        </span>
        <span class="flex shrink-0 flex-col items-end text-[11px]">
          <span v-if="sum(r).marks" class="text-mod-fractured">✦ {{ sum(r).marks }}</span>
          <span class="tabular-nums opacity-50">{{ fmtDate(touchedAtTree(r)) }}</span>
        </span>
      </button>
      <span class="flex items-center gap-1.5">
        <input v-model="url" data-tree-recipe-url type="text" inputmode="url" spellcheck="false" autocomplete="off" class="h-8 min-w-0 flex-1 rounded border border-white/15 bg-black/40 px-2 outline-none placeholder:opacity-45 focus:border-amber-400/60" :placeholder="tr('共有されたレシピの URL を貼る', 'Paste a shared recipe URL')" @paste="onPaste" @keydown.enter.prevent="openUrl" />
        <button type="button" class="g-btn sm" :disabled="!url.trim()" @click="openUrl">{{ tr("開く", "Open") }}</button>
      </span>
      <p v-if="urlNote" class="text-amber-200">{{ urlNote }}</p>
      <div class="flex flex-wrap gap-1.5 border-t border-white/10 pt-1.5">
        <button v-if="!bare" type="button" data-tree-recipe-save-as class="g-btn sm" @click="saveAs">{{ tr("別名で保存", "Save as") }}</button>
        <button v-if="!bare" type="button" data-tree-recipe-copy-url class="g-btn sm inline-flex items-center gap-1" @click="copyUrl"><Icon name="link" class="size-3.5" />{{ tr("URL をコピー", "Copy URL") }}</button>
        <button type="button" data-tree-recipe-list class="g-btn sm ml-auto" @click="pop = false; openRecipesPage()">{{ tr("レシピの一覧へ", "All recipes") }}</button>
      </div>
    </div>
  </span>
</template>
