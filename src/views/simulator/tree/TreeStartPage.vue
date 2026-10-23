<!--
  TreeStartPage.vue — スタートの箱の重ね窓 (2026-10-22 オーナー「ツリー特化」、前は右の欄の「始まりの形」)。
  0 完成形の設定のベースから始める: 印から決まる形・＋の MOD・ルーンは TreeStartPick (10-23)、右にその始まりのアイテムのカード。開いている印は use-tree の startPage
-->
<script setup lang="ts">
import { computed } from "vue";
import ModalShell from "../../../components/ui/ModalShell.vue";
import StageItemCard from "../../../components/for-share/item/StageItemCard.vue";
import { craftStage as s } from "../../../state/craft-stage";
import { mulberry32 } from "../../../services/craft-stage/engine";
import { startItemOf } from "../../../services/simulator/tree/tree-sample";
import { tr } from "../../../i18n/lang";
import TreeStartPick from "./TreeStartPick.vue";
import { useTree } from "./use-tree";

const t = useTree();
const item = computed(() => (s.data.value ? startItemOf(s.data.value, t.doc.value, mulberry32(1)).item : null));
const CARD_W = 320;
/** スマホ (768px 未満) は窓の中身の幅 (画面 − 枠と余白 90) に合わせる (10-23) */
const cardW = innerWidth < 768 ? Math.min(CARD_W, innerWidth - 90) : CARD_W;
</script>

<template>
  <ModalShell :open="true" rec="tree-start" :title="tr('スタート', 'Start')" :close-title="tr('ツリーへ戻る (Esc / 枠の外を押す)', 'Back to the tree (Esc / click outside)')" width="w-full max-w-[52rem]" full-on-phone body-class="px-3 pb-3" @close="t.startPage.value = false">
    <div data-tree-start-page class="flex min-w-0 items-start gap-4 max-md:flex-col max-md:items-stretch">
      <div class="min-w-0 flex-1"><TreeStartPick /></div>
      <div class="flex shrink-0 flex-col gap-1 max-md:!w-full max-md:items-center" :style="{ width: `${CARD_W}px` }">
        <p class="text-[12px] opacity-70">{{ tr("始まりのアイテム (外れの MOD・✦ の候補は 1 例)", "Starting item (miss mods and the ✦ pick are one example)") }}</p>
        <StageItemCard v-if="item" :item="item" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="cardW" />
      </div>
    </div>
    <template #footer>
      <div class="flex justify-end"><button type="button" data-tree-start-done class="g-btn sm" @click="t.startPage.value = false">{{ tr("決めた (ツリーへ)", "Done (back to the tree)") }}</button></div>
    </template>
  </ModalShell>
</template>
