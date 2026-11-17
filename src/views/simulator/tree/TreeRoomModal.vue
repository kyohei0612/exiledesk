<!--
  TreeRoomModal.vue — (S-101b ①、スイッチ saveCap15) レシピが 15 個ある時に新しく保存しようとした時の窓。
  上に「レシピは 15 個まで保存できます。どれか 1 つを消してから保存してください」、下に保存したレシピの全部 (新しい順)。行の × で消す (その行の中で確かめる)。
  1 つ消して 15 個未満になると、待たせた保存がそのまま続き、窓は閉じる (state/simulator/tree-room)。やめると保存しない。
  木の画面 (SimTreePage) とレシピのページ (StageRecipesPage) に 1 つずつ置く
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import ModalShell from "../../../components/ui/ModalShell.vue";
import Icon from "../../../components/ui/Icon.vue";
import { removeTreeRecipe, touchedAtTree, treeRecipes, type TreeRecipe } from "../../../state/simulator/tree-recipes";
import { RECIPE_CAP, dropRoomAsk, roomAsk } from "../../../state/simulator/tree-room";
import { recipeSummary } from "./recipe-summary";
import { fmtDate } from "../recipe-share";
import { track } from "../../../utils/track";
import { tr } from "../../../i18n/lang";

const list = computed(() => [...treeRecipes.value].sort((a, b) => touchedAtTree(b) - touchedAtTree(a)));
const sum = (r: TreeRecipe) => recipeSummary(r.tree);
/** × を押した行 (その行の中で「消しますか?」) */
const askDel = ref<string | null>(null);
function del(r: TreeRecipe): void {
  askDel.value = null;
  removeTreeRecipe(r.id); // 15 個未満になれば tree-room が待たせた保存を続けて窓を閉じる
  track("tree-recipe:delete-room");
}
function close(): void { askDel.value = null; dropRoomAsk(); }
</script>

<template>
  <ModalShell :open="!!roomAsk" :title="tr('レシピを 1 つ消す', 'Delete one recipe')" width="w-full max-w-[26rem]" body-class="flex min-h-0 flex-col gap-2 px-3 py-2" @close="close">
    <p data-tree-room-note class="break-words rounded-md border border-amber-400/40 bg-amber-950/40 px-2 py-1.5 text-[13px] text-amber-100">
      {{ tr(`レシピは ${RECIPE_CAP} 個まで保存できます。どれか 1 つを消してから保存してください`, `You can keep up to ${RECIPE_CAP} recipes. Delete one, then save.`) }}
    </p>
    <div data-tree-room-list class="-mx-1 flex max-h-[60vh] min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain px-1 text-[12px]">
      <div v-for="r in list" :key="r.id" data-tree-room-row class="flex min-w-0 flex-wrap items-center gap-1 rounded hover:bg-white/[0.06]">
        <template v-if="askDel === r.id">
          <span class="min-w-0 basis-full break-words px-1.5 pt-2 text-rose-100">{{ tr(`「${r.name}」を消しますか?`, `Delete "${r.name}"?`) }}</span>
          <button type="button" data-tree-room-del-ok class="g-btn-red mb-1.5 ml-auto min-h-8 shrink-0 px-2 text-[12px]" @click="del(r)">{{ tr("消す", "Delete") }}</button>
          <button type="button" data-tree-room-del-cancel class="g-btn sm mb-1.5 mr-1" @click="askDel = null">{{ tr("やめる", "Cancel") }}</button>
        </template>
        <template v-else>
          <span class="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-1.5 py-1">
            <img v-if="sum(r).art" :src="sum(r).art!" alt="" class="size-9 shrink-0 object-contain" draggable="false" />
            <span v-else class="flex size-9 shrink-0 items-center justify-center rounded bg-white/[0.06] text-[10px] opacity-60">{{ sum(r).empty ? tr("空", "Empty") : "" }}</span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="break-words">{{ r.name }}</span>
              <span class="break-words text-[11px] opacity-70">{{ sum(r).empty ? tr("ベースなし", "No base") : [sum(r).base, sum(r).aims ? tr(`狙い ${sum(r).aims}`, `${sum(r).aims} target(s)`) : "", sum(r).first].filter(Boolean).join(" · ") }}</span>
              <span class="tabular-nums text-[11px] opacity-50">{{ fmtDate(touchedAtTree(r)) }}</span>
            </span>
          </span>
          <button type="button" data-tree-room-del class="flex size-8 shrink-0 items-center justify-center rounded text-white/40 hover:bg-rose-900/40 hover:text-rose-200" :title="tr('このレシピを消す', 'Delete this recipe')" @click="askDel = r.id"><Icon name="x" class="size-3.5" /></button>
        </template>
      </div>
    </div>
    <template #footer>
      <button type="button" data-tree-room-cancel class="g-btn sm" @click="close">{{ tr("保存をやめる", "Don't save") }}</button>
    </template>
  </ModalShell>
</template>
