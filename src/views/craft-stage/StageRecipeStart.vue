<!--
  StageRecipeStart.vue — シミュレーターを保存したレシピから始める (ベースを選ぶ前、2026-10-09)

  オーナー「初起動でベースを選ぶとかあるけど、ここの時点でレシピとかの選択させるような UI じゃないと、わざわざ適当なベース選んでレシピ開くことになるぞ」。
  前は「保存したレシピから」の小さな文字のリンクだけだった。レシピの札 (ベースの絵・名前・日付) を並べ、ファイルからの読み込みもここで (別の PC・URL から来た時)。
  compact = 右上の「レシピ」の中に出す時 (札を 1 列に)
-->
<script setup lang="ts">
import { ref } from "vue";
import { mergeRecipesFromFile, readSimRecipes, writeSimRecipes, type SimRecipe } from "../../state/craft-stage";
import { baseArt } from "../../services/craft-stage/base-art";

defineProps<{ compact?: boolean }>();
const emit = defineEmits<{ start: [r: SimRecipe] }>();

const recipes = ref<SimRecipe[]>(readSimRecipes());
const note = ref("");
const file = ref<HTMLInputElement | null>(null);
async function importFile(ev: Event): Promise<void> {
  const f = (ev.target as HTMLInputElement).files?.[0];
  (ev.target as HTMLInputElement).value = "";
  if (!f) return;
  const r = mergeRecipesFromFile(await f.text(), recipes.value);
  if (r.added) { recipes.value = r.list; writeSimRecipes(recipes.value); }
  note.value = r.bad && !r.added && !r.skipped ? "レシピのファイルではありません" : `${r.added} 件足しました${r.skipped ? ` (同じ物 ${r.skipped} 件は飛ばした)` : ""}`;
}
const fmtDate = (t: number): string => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };
</script>

<template>
  <div class="w-full">
    <p class="mb-1.5 flex items-center gap-2">
      <b class="text-[13px] text-[var(--exile-color-text-primary)]">保存したレシピから始める</b>
      <button type="button" class="ml-auto rounded border border-white/15 px-2 py-0.5 text-[11px] opacity-80 hover:bg-white/10 hover:opacity-100 max-md:min-h-9" title="書き出したファイルからレシピを足す (別の PC・ブラウザで作った物)" @click="file?.click()">ファイルから読み込む</button>
      <input ref="file" type="file" accept=".json,application/json" class="hidden" @change="importFile" />
    </p>
    <p v-if="note" class="mb-1 text-[11px] opacity-70">{{ note }}</p>
    <p v-if="!recipes.length" class="text-[12px] opacity-50">まだ保存したレシピはありません (下でベースを選んで作り、右上の「レシピ」で保存できます)</p>
    <div v-else class="grid gap-1.5" :class="compact ? 'grid-cols-1' : 'grid-cols-[repeat(auto-fill,minmax(220px,1fr))] max-md:grid-cols-1'">
      <button v-for="r in recipes" :key="r.id" type="button" class="g-plain g-item flex items-center gap-2 bg-black/50 px-1.5 py-1 text-left transition hover:bg-white/[0.06] max-md:min-h-12" :title="`${r.baseJa ?? r.session.base} · パターン ${r.session.patterns.length} つ`" @click="emit('start', r)">
        <img v-if="baseArt(r.session.base)" :src="baseArt(r.session.base)!" alt="" class="size-10 shrink-0 object-contain" draggable="false" />
        <span v-else class="size-10 shrink-0" />
        <span class="min-w-0 flex-1">
          <b class="block truncate text-[13px] text-[var(--exile-color-text-primary)]">{{ r.name }}</b>
          <span class="block truncate text-[11px] opacity-60">{{ r.baseJa ?? r.session.base }} · パターン {{ r.session.patterns.length }} つ · {{ fmtDate(r.savedAt) }}</span>
        </span>
      </button>
    </div>
  </div>
</template>
