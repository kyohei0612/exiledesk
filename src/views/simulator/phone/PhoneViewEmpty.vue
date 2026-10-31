<!--
  PhoneViewEmpty.vue — シミュのスマホで木を開いていない時の案内 (S-94f、スイッチ phoneView): ベース選びへ進まず、作るのは PC でと言ってレシピの一覧を出す。
  ?page=sim-base・?page=sim-mods へ直に来ても同じ (SimTreePage が分ける)
-->
<script setup lang="ts">
import { computed, onMounted } from "vue";
import { setCurrentTreeRecipe, touchedAtTree, treeRecipes, type TreeRecipe } from "../../../state/simulator/tree-recipes";
import { fmtDate, seedDevRecipes, useRecipeUrl } from "../recipe-share";
import { recipeSummary } from "../tree/recipe-summary";
import { useTree } from "../tree/use-tree";
import { openRecipesPage, openTreePage } from "../../../web/page";
import { track } from "../../../utils/track";
import { simOp } from "../../../web/track";
import { tr } from "../../../i18n/lang";

const t = useTree();
const list = computed(() => [...treeRecipes.value].sort((a, b) => touchedAtTree(b) - touchedAtTree(a)).slice(0, 8));
function open(r: TreeRecipe): void { simOp("view-open"); setCurrentTreeRecipe(r.id); t.open(r.tree); openTreePage(); track("tree-recipe:open"); }
const { url, urlNote, openUrl, onPaste } = useRecipeUrl({ notUrl: ["レシピの URL ではありません", "Not a recipe URL"], unreadable: ["このレシピは読めませんでした", "Couldn't read this recipe"] });
onMounted(() => void seedDevRecipes());
</script>

<template>
  <section data-phone-view-empty class="g-panel flex min-w-0 flex-col gap-3 px-3 py-4 text-[13px]">
    <div class="text-center">
      <p class="text-[16px] font-bold text-amber-200">{{ tr("ツリーを作るのは PC で", "Build trees on a PC") }}</p>
      <p class="mt-1 text-[12px] text-sim-dim">{{ tr("チュートリアルは PC で", "The tutorial is on PC") }}</p>
    </div>
    <p class="text-[12px] opacity-70">{{ tr("保存したレシピから開く", "Open a saved recipe") }}</p>
    <p v-if="!list.length" class="py-1 opacity-50">{{ tr("まだありません", "None yet") }}</p>
    <button v-for="r in list" :key="r.id" type="button" data-phone-view-recipe class="flex min-h-11 min-w-0 items-center gap-2 rounded border border-white/10 px-2 py-1 text-left" @click="open(r)">
      <img v-if="recipeSummary(r.tree).art" :src="recipeSummary(r.tree).art!" alt="" class="size-9 shrink-0 object-contain" draggable="false" />
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="break-words">{{ r.name }}</span>
        <span class="text-[11px] tabular-nums opacity-50">{{ fmtDate(touchedAtTree(r)) }}</span>
      </span>
    </button>
    <span class="flex items-center gap-1.5">
      <input v-model="url" data-phone-view-url type="text" inputmode="url" spellcheck="false" autocomplete="off" class="h-11 min-w-0 flex-1 rounded border border-white/15 bg-black/40 px-2 outline-none placeholder:opacity-45 focus:border-amber-400/60" :placeholder="tr('共有されたレシピの URL を貼る', 'Paste a shared recipe URL')" @paste="onPaste" @keydown.enter.prevent="openUrl" />
      <button type="button" class="g-btn sm !min-h-11" :disabled="!url.trim()" @click="openUrl">{{ tr("開く", "Open") }}</button>
    </span>
    <p v-if="urlNote" class="text-amber-200">{{ urlNote }}</p>
    <button type="button" data-phone-view-all class="g-btn sm !min-h-11 self-end" @click="openRecipesPage()">{{ tr("レシピの一覧へ", "All recipes") }}</button>
  </section>
</template>
