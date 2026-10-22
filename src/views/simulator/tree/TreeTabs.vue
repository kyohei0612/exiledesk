<!--
  TreeTabs.vue — 木のタブ (2026-10-22 オーナー「✦ の候補を 2 つ試したい人のために <MOD 名> スタートのタブで木を 2 本並べる」)。
  タブごとに別の木、0 完成形の設定は共通 (use-tree の switchTab が写す)。名前はスタートの始め方 (✦ の MOD・レアリティ) から。＋ で白紙のタブを足してスタートの重ね窓を開く
-->
<script setup lang="ts">
import Icon from "../../../components/ui/Icon.vue";
import { tr } from "../../../i18n/lang";
import { startName as nameOf } from "./tree-names";
import { useTree } from "./use-tree";

const emit = defineEmits<{ switched: [] }>();
const t = useTree();
function go(i: number): void { t.switchTab(i); emit("switched"); }
function add(): void { t.addTab(); t.startPage.value = true; emit("switched"); }
function close(i: number): void { t.closeTab(i); emit("switched"); }
</script>

<template>
  <div data-tree-tabs class="flex min-w-0 items-center gap-1.5 overflow-x-auto">
    <span v-for="(d, i) in t.tabDocs.value" :key="i" class="flex min-w-0 shrink-0 items-center">
      <button type="button" data-tree-tab :data-tab-i="i" class="g-tab !min-h-[30px] max-w-[280px] truncate !px-4 !text-[13px]" :class="i === t.active.value ? 'on' : ''" :title="nameOf(i === t.active.value ? t.doc.value : d)" @click="go(i)">{{ nameOf(i === t.active.value ? t.doc.value : d) }}</button>
      <button v-if="t.tabDocs.value.length > 1" type="button" data-tree-tab-close class="-ml-1 flex size-6 items-center justify-center rounded opacity-50 hover:bg-white/10 hover:opacity-100" :title="tr('このタブの木を閉じる', 'Close this tab’s tree')" @click="close(i)"><Icon name="x" class="size-3.5" /></button>
    </span>
    <button type="button" data-tree-tab-add class="g-btn sm inline-flex shrink-0 items-center gap-1" :title="tr('別の始め方の木を足す (0 完成形の設定は同じ)', 'Add a tree with another start (same final item)')" @click="add"><Icon name="plus" class="size-3.5" />{{ tr("始め方を足す", "Add a start") }}</button>
  </div>
</template>
