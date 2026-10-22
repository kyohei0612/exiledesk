<!--
  TreeBasePage.vue — ツリーのベースを選ぶ重ね窓 (2026-10-22 オーナー「エミュと同じくベースを選ぶ 1 画面」→「ベースもツリーの上に重ねるオーバーレイで」)。
  枠はクラフト台の MOD 一覧の窓と同じ ModalShell (後ろのツリーを暗く、75%、× / Esc / 後ろを押すと閉じる)、中身はベースのページと同じ共通の BaseCatalog。
  始めの時も途中で替える時も同じ窓、選ぶと閉じてツリーに戻る。
  ベースを替えると白紙から (今までと同じ。下の箱か始まりの MOD があれば 1 回確かめる、1 つ戻すで戻せる)。開いている印は use-tree の basePage
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import BaseCatalog from "../../../components/items/BaseCatalog.vue";
import ModalShell from "../../../components/ui/ModalShell.vue";
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
</script>

<template>
  <ModalShell :open="true" rec="tree-base" :title="tr('ベースを選ぶ', 'Choose a base')" :close-title="tr('ツリーへ戻る (Esc / 枠の外を押す)', 'Back to the tree (Esc / click outside)')" width="w-[75%] h-[75%]" full-on-phone body-class="px-3 pb-3" @close="back">
    <div data-tree-base-page class="min-w-0">
      <!-- ベースを替えると今の木が消える時だけ、1 回確かめる -->
      <div v-if="asking" data-tree-base-ask class="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-rose-400/60 bg-[#2a1416] px-3 py-2 text-[13px]">
        <p class="min-w-0 flex-1">{{ tr(`${jaTypeName(asking)} の白紙から組み直します。今の木 (箱 ${t.lostOnBase.value} 個${startMods ? "・始まりの MOD" : ""}) が消えます (1 つ戻すで戻せます)。`, `Start over from a blank ${asking}. This tree (${t.lostOnBase.value} box(es)${startMods ? ", starting mods" : ""}) will be removed (Undo brings it back).`) }}</p>
        <button type="button" class="g-btn sm" @click="asking = null">{{ tr("やめる", "Cancel") }}</button>
        <button type="button" data-tree-base-ok class="g-btn sm" @click="apply(asking!)">{{ tr("替える", "Change") }}</button>
      </div>
      <BaseCatalog :data="s.data.value" :selected="t.doc.value.base" @pick="pick" />
    </div>
  </ModalShell>
</template>
