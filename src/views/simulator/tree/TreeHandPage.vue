<!--
  TreeHandPage.vue — 次に打つ手の重ね窓 (2026-10-22 オーナー「手を置く所は今の箱の時点のアイテムに付けるイメージ」、前は右の欄)。
  枠は ModalShell、中身は TreeHandShelf (上にその箱の時点のアイテムのカード、下に棚。持ってカードを押すとその手)
-->
<script setup lang="ts">
import ModalShell from "../../../components/ui/ModalShell.vue";
import type { Aim, Hand, HandKind } from "../../../services/simulator/tree/tree-model";
import type { OnlyOut } from "./tree-hand-plan";
import { tr } from "../../../i18n/lang";
import TreeHandShelf from "./TreeHandShelf.vue";
import TreeHeldUse from "./TreeHeldUse.vue";
import { computed } from "vue";
import { useTree } from "./use-tree";
import { holdsAt } from "../../../services/simulator/tree/tree-foresee";

const props = defineProps<{ boxId: string; current: Hand | null }>();
const t = useTree();
/** 予見の枠の箱では手は「持つ」(S-39、11-05 オーナー「ヒネコラ後は打つじゃなくて持つになる」) */
const hold = computed(() => holdsAt(t.doc.value, props.boxId));
const title = computed(() => (hold.value ? (props.current ? tr("持つ手を替える (予見)", "Change the held craft (foresight)") : tr("次に持つ手 (予見で結果が見える)", "Next craft to hold (result is foreseen)")) : props.current ? tr("打つ手を替える", "Change the craft") : tr("次に打つ手", "Next craft")));
const emit = defineEmits<{ pick: [hand: Hand, kind: HandKind, aims: Aim[], preCatalyst: string | null, only: OnlyOut]; clear: []; close: []; aim: [] }>();
</script>

<template>
  <ModalShell :open="true" rec="tree-hand" :title="title" :close-title="tr('ツリーへ戻る (Esc / 枠の外を押す)', 'Back to the tree (Esc / click outside)')" width="w-[94%] max-w-[1500px] max-[48rem]:w-full min-[48rem]:h-[88%]" full-on-phone body-class="px-3 pb-3" @close="emit('close')">
    <TreeHeldUse :box-id="boxId" />
    <TreeHandShelf :box-id="boxId" :current="current" @pick="(...a) => emit('pick', ...a)" @clear="emit('clear')" @close="emit('close')" @aim="emit('aim')" />
  </ModalShell>
</template>
