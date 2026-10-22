<!--
  TreeHandPage.vue — 次に打つ手の重ね窓 (2026-10-22 オーナー「手を置く所は今の箱の時点のアイテムに付けるイメージ」、前は右の欄)。
  枠は ModalShell、中身は TreeHandShelf (上にその箱の時点のアイテムのカード、下に棚。持ってカードを押すとその手)
-->
<script setup lang="ts">
import ModalShell from "../../../components/ui/ModalShell.vue";
import type { Aim, Hand, HandKind, OutKind } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";
import TreeHandShelf from "./TreeHandShelf.vue";

defineProps<{ boxId: string; current: Hand | null }>();
const emit = defineEmits<{ pick: [hand: Hand, kind: HandKind, aims: Aim[], preCatalyst: string | null, only: { out: OutKind; aim: Aim | null } | null]; clear: []; close: []; split: []; back: [] }>();
</script>

<template>
  <ModalShell :open="true" rec="tree-hand" :title="current ? tr('打つ手を替える', 'Change the craft') : tr('次に打つ手', 'Next craft')" :close-title="tr('ツリーへ戻る (Esc / 枠の外を押す)', 'Back to the tree (Esc / click outside)')" width="w-full max-w-[64rem]" full-on-phone body-class="px-3 pb-3" @close="emit('close')">
    <TreeHandShelf :box-id="boxId" :current="current" @pick="(...a) => emit('pick', ...a)" @clear="emit('clear')" @close="emit('close')" @split="emit('split')" @back="emit('back')" />
  </ModalShell>
</template>
