<!--
  TreePanelPage.vue — 箱の分かれ目・メモ・当たりの MOD の重ね窓 (2026-10-22 オーナー「箱を押す → 重ね窓で選ぶ → 閉じる で完結」、前は右の欄)。
  枠は ModalShell (題・× は枠の物、中身の部品は embedded で題の行を出さない)
-->
<script setup lang="ts">
import { computed } from "vue";
import ModalShell from "../../../components/ui/ModalShell.vue";
import type { Aim } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";
import TreeModPick from "./TreeModPick.vue";
import TreeNote from "./TreeNote.vue";
import TreeSplitPick from "./TreeSplitPick.vue";

const props = defineProps<{ kind: "split" | "note" | "aim"; boxId: string; current: Aim | null }>();
const emit = defineEmits<{ pick: [aim: Aim]; close: [] }>();
const title = computed(() => (props.kind === "split" ? `◇ ${tr("分かれ目 (打たずに分ける)", "Split (no craft)")}` : props.kind === "note" ? tr("この箱のメモ", "Note for this box") : tr("付く MOD (当たり) を選ぶ", "Pick the mod to hit")));
</script>

<template>
  <ModalShell :open="true" :rec="`tree-${kind}`" :title="title" :close-title="tr('ツリーへ戻る (Esc / 枠の外を押す)', 'Back to the tree (Esc / click outside)')" :width="kind === 'split' ? 'w-full max-w-[28rem]' : 'w-full max-w-[24rem]'" full-on-phone body-class="px-3 pb-3" @close="emit('close')">
    <TreeSplitPick v-if="kind === 'split'" :box-id="boxId" embedded @close="emit('close')" />
    <TreeNote v-else-if="kind === 'note'" :box-id="boxId" embedded @close="emit('close')" />
    <TreeModPick v-else mode="hit" :box-id="boxId" :current="current" embedded @pick="(a) => emit('pick', a)" @close="emit('close')" />
  </ModalShell>
</template>
