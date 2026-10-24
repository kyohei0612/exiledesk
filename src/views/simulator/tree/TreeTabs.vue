<!--
  TreeTabs.vue — 木のタブ (2026-10-22 始め方を並べるタブ → 10-24 オーナー「タブは人が押した時だけ増やし、新しいツリーを最初から任意で作る」)。
  タブごとに別の木 (0 完成形の設定も別、use-tree の switchTab は写さない)。＋ で全くの白紙の木を足してベース選びから。
  名前は「ツリー①」… (ベースに関係なく空いている一番小さい番号)、ダブルクリックでその場で変える (Enter・枠の外で決める、Esc で取り消し、空なら番号の名前へ)。
  「コピー」= 今の木を丸ごと写して新しいタブで開く (名前は「〜 のコピー」、元は変えない)。10-24 夜オーナー
-->
<script setup lang="ts">
import { nextTick, ref } from "vue";
import Icon from "../../../components/ui/Icon.vue";
import { tr } from "../../../i18n/lang";
import { useTree } from "./use-tree";

const emit = defineEmits<{ switched: [] }>();
const t = useTree();
function go(i: number): void { t.switchTab(i); emit("switched"); }
function add(): void { t.addTab(); emit("switched"); }
function copy(): void { t.copyTab(); emit("switched"); }
function close(i: number): void { t.closeTab(i); emit("switched"); }
/** 名前を変えているタブ (null = 変えていない) */
const editing = ref<number | null>(null);
const input = ref<HTMLInputElement[]>([]);
function startRename(i: number): void {
  if (i !== t.active.value) go(i);
  editing.value = i;
  void nextTick(() => { const el = input.value[0]; el?.focus(); el?.select(); });
}
/** 決める (Enter・枠の外)。Esc は取り消し */
function endRename(v: string | null): void {
  if (editing.value === null) return;
  editing.value = null;
  if (v !== null && v.trim() !== t.tabLabel(t.active.value)) t.renameTab(v);
}
</script>

<template>
  <div data-tree-tabs class="flex min-w-0 items-center gap-1.5 overflow-x-auto">
    <!-- 文は中の span で右を … で切る (g-tab は真ん中寄せなので、ボタンで切ると頭と終わりが両側から切れた。タブは縮めて「新しいツリー」を押し出さない、10-23 モンキー 6) -->
    <span v-for="(_, i) in t.tabDocs.value" :key="i" class="flex min-w-[96px] shrink items-center">
      <input v-if="editing === i" ref="input" data-tree-tab-name-input :value="t.tabLabel(i)" class="h-[30px] w-40 rounded border border-amber-400/60 bg-black/50 px-2 text-[13px] outline-none"
        @keydown.enter.prevent="endRename(($event.target as HTMLInputElement).value)" @keydown.esc.stop.prevent="endRename(null)" @blur="endRename(($event.target as HTMLInputElement).value)" />
      <button v-else type="button" data-tree-tab :data-tab-i="i" class="g-tab !min-h-[30px] min-w-0 max-w-[320px] !px-3 !text-[13px]" :class="i === t.active.value ? 'on' : ''" :title="tr(`${t.tabLabel(i)} (ダブルクリックで名前を変える)`, `${t.tabLabel(i)} (double-click to rename)`)" @click="go(i)" @dblclick="startRename(i)"><span class="block min-w-0 truncate">{{ t.tabLabel(i) }}</span></button>
      <button v-if="t.tabDocs.value.length > 1" type="button" data-tree-tab-close class="-ml-1 flex size-6 shrink-0 items-center justify-center rounded opacity-50 hover:bg-white/10 hover:opacity-100" :title="tr('このタブの木を閉じる', 'Close this tab’s tree')" @click="close(i)"><Icon name="x" class="size-3.5" /></button>
    </span>
    <button type="button" data-tree-tab-add class="g-btn sm inline-flex shrink-0 items-center gap-1" :aria-label="tr('新しいツリー', 'New tree')" :title="tr('新しいツリーを白紙から作る (ベース選びから)', 'Start a new tree from scratch (choose a base first)')" @click="add"><Icon name="plus" class="size-3.5" /><span class="max-md:hidden">{{ tr("新しいツリー", "New tree") }}</span></button>
    <button type="button" data-tree-tab-copy class="g-btn sm shrink-0" :title="tr('今のツリーを丸ごと写して新しいタブで開く (元は変わらない)', 'Copy this whole tree into a new tab (the original stays)')" @click="copy">{{ tr("コピー", "Copy") }}</button>
  </div>
</template>
