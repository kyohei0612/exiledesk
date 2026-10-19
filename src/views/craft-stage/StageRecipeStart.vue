<!--
  StageRecipeStart.vue — シミュレーターを保存したレシピか、レシピの URL から始める (ベースを選ぶ前、2026-10-09)

  オーナー「初起動でベースを選ぶとかあるけど、ここの時点でレシピとかの選択させるような UI じゃないと、わざわざ適当なベース選んでレシピ開くことになるぞ」。
  2026-10-21 オーナー「ここはレシピ URL 入力もしくは保存されてるレシピをプルダウンで表示」: 1 行に「保存したレシピ ▾」(押すと札 = ベースの絵・名前・日付が下に開く)と
  「レシピの URL を貼る欄」。ファイルからの読み込みは右上の「レシピ」の中だけ (ここからは外した)。
  compact = ベースを選ぶページ・右上の「レシピ」の中 (どちらも同じ形。プルダウンの札は 1 列)
-->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from "vue";
import { readSimRecipes, type SimRecipe } from "../../state/craft-stage";
import { baseArt } from "../../services/craft-stage/base-art";
import { openRecipeCode, recipeCodeOf } from "./recipe-share";
import { tr } from "../../i18n/lang";

defineProps<{ compact?: boolean }>();
const emit = defineEmits<{ start: [r: SimRecipe] }>();

const recipes = ref<SimRecipe[]>(readSimRecipes());
const open = ref(false);
const box = ref<HTMLElement | null>(null);
function outside(e: PointerEvent): void { if (!box.value?.contains(e.target as Node)) close(); }
function onKey(e: KeyboardEvent): void { if (e.key === "Escape") close(); }
function close(): void {
  open.value = false;
  document.removeEventListener("pointerdown", outside, true);
  document.removeEventListener("keydown", onKey);
}
function toggle(): void {
  if (open.value) { close(); return; }
  recipes.value = readSimRecipes();
  open.value = true;
  void nextTick(() => { document.addEventListener("pointerdown", outside, true); document.addEventListener("keydown", onKey); });
}
onBeforeUnmount(close);
function pick(r: SimRecipe): void { close(); emit("start", r); }

/** レシピの URL を貼る欄: 貼ったら (か Enter・開く) 読み込んで、保存したレシピに足して始める */
const url = ref("");
const note = ref("");
async function openUrl(): Promise<void> {
  const code = recipeCodeOf(url.value);
  if (!code) { note.value = url.value.trim() ? tr("レシピの URL ではありません (#recipe= の付いた URL を貼る)", "Not a recipe URL (paste one with #recipe=)") : ""; return; }
  const ok = await openRecipeCode(code);
  note.value = ok ? "" : tr("このレシピは読めませんでした", "Couldn't read this recipe");
  if (ok) { url.value = ""; recipes.value = readSimRecipes(); }
}
function onPaste(): void { void nextTick(() => { if (recipeCodeOf(url.value)) void openUrl(); }); }
const fmtDate = (t: number): string => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };
</script>

<template>
  <div class="w-full">
    <div class="flex items-center gap-2 max-md:flex-wrap">
      <b class="shrink-0 text-[13px] text-[var(--exile-color-text-primary)]">{{ tr("レシピから始める", "Start from a recipe") }}</b>
      <!-- 保存したレシピのプルダウン (札は下に開く) -->
      <div ref="box" class="relative shrink-0 max-md:basis-full">
        <button type="button" data-recipe-pick class="g-plain flex h-8 min-w-[13rem] items-center gap-2 rounded border border-white/15 bg-black/50 px-2.5 text-left text-[12px] transition hover:bg-white/[0.06] disabled:opacity-45 max-md:h-11 max-md:w-full" :disabled="!recipes.length" :aria-expanded="open" :title="recipes.length ? tr('保存したレシピから選ぶ', 'Pick a saved recipe') : tr('まだありません (ベースを選んで作り、右上の「レシピ」で保存。URL を貼っても足せる)', 'None yet (build one and save it from Recipes at the top right, or paste a URL)')" @click="toggle">
          <span class="min-w-0 flex-1 truncate">{{ recipes.length ? tr(`保存したレシピ (${recipes.length})`, `Saved recipes (${recipes.length})`) : tr("保存したレシピはまだありません", "No saved recipes yet") }}</span>
          <span class="shrink-0 opacity-60">▾</span>
        </button>
        <div v-if="open" data-recipe-list class="absolute left-0 top-full z-[60] mt-1 max-h-[60vh] w-[22rem] overflow-auto rounded-lg border border-[var(--exile-color-border-brass)] bg-[#14110d] p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.75)] max-md:w-full">
          <button v-for="r in recipes" :key="r.id" type="button" class="g-plain g-item flex w-full items-center gap-2 bg-black/50 px-1.5 py-1 text-left transition hover:bg-white/[0.06] max-md:min-h-12 [&+&]:mt-1" :title="`${r.baseJa ?? r.session.base} · パターン ${r.session.patterns.length} つ`" @click="pick(r)">
            <img v-if="baseArt(r.session.base)" :src="baseArt(r.session.base)!" alt="" class="size-10 shrink-0 object-contain" draggable="false" />
            <span v-else class="size-10 shrink-0" />
            <span class="min-w-0 flex-1">
              <b class="block truncate text-[13px] text-[var(--exile-color-text-primary)]">{{ r.name }}</b>
              <span class="block truncate text-[11px] opacity-60">{{ r.baseJa ?? r.session.base }} · {{ tr(`パターン ${r.session.patterns.length} つ`, `${r.session.patterns.length} patterns`) }} · {{ fmtDate(r.savedAt) }}</span>
            </span>
          </button>
        </div>
      </div>
      <!-- レシピの URL を貼る欄 (貼ると開く。Enter・開くでも) -->
      <span class="flex min-w-0 flex-1 items-center gap-1.5 max-md:basis-full">
        <input v-model="url" data-recipe-url type="text" inputmode="url" spellcheck="false" autocomplete="off" class="h-8 min-w-0 flex-1 rounded border border-white/15 bg-black/50 px-2 text-[12px] placeholder:opacity-45 focus:border-[var(--exile-color-border-brass)] focus:outline-none max-md:h-11" :placeholder="tr('レシピの URL を貼る', 'Paste a recipe URL')" @paste="onPaste" @keydown.enter.prevent="openUrl" />
        <button type="button" class="h-8 shrink-0 rounded border border-white/15 px-2.5 text-[12px] hover:bg-white/10 disabled:opacity-40 max-md:h-11" :disabled="!url.trim()" @click="openUrl">{{ tr("開く", "Open") }}</button>
      </span>
    </div>
    <p v-if="note" class="mt-1 text-[11px] text-amber-200">{{ note }}</p>
  </div>
</template>
