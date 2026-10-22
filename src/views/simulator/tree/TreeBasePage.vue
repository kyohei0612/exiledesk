<!--
  TreeBasePage.vue — ツリーのベースを選ぶ 1 画面 (2026-10-22 オーナー「エミュレーターと同じく、ベースを選ぶ 1 画面でドンと選ぶ。始めの時も途中で替える時も同じ画面」)。
  見た目はクラフト台のベースのページ (StageBasePage.vue) と同じ: 題の帯「ベースを選ぶ」+ 戻る + 共通の BaseCatalog。選ぶとツリーに戻る。
  ベースを替えると白紙から (今までと同じ。下の箱か始まりの MOD があれば 1 回確かめる、1 つ戻すで戻せる)。開いている印は use-tree の basePage
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import BaseCatalog from "../../../components/items/BaseCatalog.vue";
import { craftStage as s } from "../../../state/craft-stage";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { tr } from "../../../i18n/lang";
import { startOf } from "../../../services/simulator/tree/tree-model";
import { useTree } from "./use-tree";

const t = useTree();
const startMods = computed(() => startOf(t.doc.value).mods.length);
const asking = ref<string | null>(null);
function back(): void { t.basePage.value = false; }
function pick(en: string): void {
  if (en === t.doc.value.base) { back(); return; }
  if (t.lostOnBase.value > 0 || startMods.value) { asking.value = en; return; }
  apply(en);
}
function apply(en: string): void {
  asking.value = null;
  t.setBase(en, t.doc.value.itemLevel);
  back();
}
// 開いたら一番上から、Esc で戻る (ベースのページと同じ)
function onKey(e: KeyboardEvent): void { if (e.key === "Escape") { if (asking.value) asking.value = null; else back(); } }
onMounted(() => { window.scrollTo(0, 0); window.addEventListener("keydown", onKey); });
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div data-tree-base-page class="min-w-0">
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <h1 class="g-tabbar g-brush flex min-w-0 flex-1 items-center px-8 text-[22px] max-md:!min-h-[40px] max-md:px-6 max-md:text-[17px] tracking-[0.18em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_2px_#000,0_0_16px_rgba(255,200,110,0.3)]">{{ tr("ベースを選ぶ", "Choose a base") }}</h1>
      <span class="flex items-center gap-2">
        <button type="button" data-tree-base-back class="g-btn sm max-md:min-h-10" @click="back">{{ tr("← ツリーへ戻る", "← Back to the tree") }}</button>
        <span class="text-[12px] opacity-60 max-md:hidden">{{ tr("Esc でも戻る", "Esc also goes back") }}</span>
      </span>
    </div>
    <!-- ベースを替えると今の木が消える時だけ、1 回確かめる -->
    <div v-if="asking" data-tree-base-ask class="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-rose-400/60 bg-[#2a1416] px-3 py-2 text-[13px]">
      <p class="min-w-0 flex-1">{{ tr(`${jaTypeName(asking)} の白紙から組み直します。今の木 (箱 ${t.lostOnBase.value} 個${startMods ? "・始まりの MOD" : ""}) が消えます (1 つ戻すで戻せます)。`, `Start over from a blank ${asking}. This tree (${t.lostOnBase.value} box(es)${startMods ? ", starting mods" : ""}) will be removed (Undo brings it back).`) }}</p>
      <button type="button" class="g-btn sm" @click="asking = null">{{ tr("やめる", "Cancel") }}</button>
      <button type="button" data-tree-base-ok class="g-btn sm" @click="apply(asking!)">{{ tr("替える", "Change") }}</button>
    </div>
    <div class="rounded-lg bg-black/30 p-4 max-md:p-2"><BaseCatalog :data="s.data.value" :selected="t.doc.value.base" @pick="pick" /></div>
  </div>
</template>
