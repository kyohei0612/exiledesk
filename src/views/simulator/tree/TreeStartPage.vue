<!--
  TreeStartPage.vue — スタートの箱の重ね窓 (2026-10-22 オーナー「ツリー特化」、前は右の欄の「始まりの形」)。
  0 完成形の設定のベースから始める: 印から決まる形・＋の MOD・ルーンは TreeStartPick (10-23)、右にその始まりのアイテムのカード。開いている印は use-tree の startPage
-->
<script setup lang="ts">
import { boxesEn } from "./tree-names";
import { computed, onBeforeUnmount } from "vue";
import ModalShell from "../../../components/ui/ModalShell.vue";
import StageItemCard from "../../../components/for-share/item/StageItemCard.vue";
import { craftStage as s } from "../../../state/craft-stage";
import { mulberry32 } from "../../../services/craft-stage/engine";
import { startItemOf } from "../../../services/simulator/tree/tree-sample";
import { tr } from "../../../i18n/lang";
import TreeStartPick from "./TreeStartPick.vue";
import { useTree } from "./use-tree";
import { useEditReset } from "./use-edit-reset";

const t = useTree();
/** 始め方・始まりの MOD を変えたら木はスタートだけに (出る時に保存を聞く。S-67、スイッチ resetOnEdit) */
const edits = useEditReset(t);
edits.remember();
onBeforeUnmount(edits.forgetIfClosed);
const close = (): void => edits.leave(() => { t.startPage.value = false; });
const item = computed(() => (s.data.value ? startItemOf(s.data.value, t.doc.value, mulberry32(1)).item : null));
</script>

<template>
  <ModalShell :open="true" rec="tree-start" :title="tr('スタート', 'Start')" :close-title="tr('ツリーへ戻る (Esc / 枠の外を押す)', 'Back to the tree (Esc / click outside)')" width="w-full max-w-[72rem]" full-on-phone body-class="px-3 pb-3" @close="close">
    <div v-if="edits.ask.value" data-tree-edit-reset-ask class="sticky top-0 z-10 mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-rose-400/60 bg-[#2a1416] px-3 py-2 text-[13px]">
      <p class="min-w-0 flex-1 break-words">{{ tr(`この変更で今の木 (スタートの下の箱 ${edits.ask.value.boxes} 個) は消え、スタートからやり直します。保存しますか?`, `This change clears the current tree (${boxesEn(edits.ask.value.boxes)} below the start) and starts over from the start. Save it first?`) }}</p>
      <button type="button" data-tree-edit-reset-save class="g-btn sm" @click="edits.answer('save')">{{ tr("保存して変える", "Save and change") }}</button>
      <button type="button" data-tree-edit-reset-ok class="g-btn sm" @click="edits.answer('drop')">{{ tr("保存せず変える", "Change without saving") }}</button>
      <button type="button" data-tree-edit-reset-cancel class="g-btn sm" @click="edits.answer('cancel')">{{ tr("やめる (変更を戻す)", "Cancel (undo the change)") }}</button>
    </div>
    <div data-tree-start-page class="flex min-w-0 items-start gap-4 max-md:flex-col max-md:items-stretch">
      <div class="min-w-0 flex-1"><TreeStartPick /></div>
      <!-- カードはエミュと同じ既定の幅 (480、スマホは全幅。10-24 オーナー「アイテム絵はシミュと同じ」) -->
      <div class="flex shrink-0 flex-col gap-1 md:w-[480px]">
        <p class="text-[12px] opacity-70">{{ tr("始まりのアイテム (外れの MOD・✦ の候補は 1 例)", "Starting item (miss mods and the ✦ pick are one example)") }}</p>
        <StageItemCard v-if="item" :item="item" :added="[]" :removed="[]" :holding="false" :flash-key="0" />
      </div>
    </div>
    <template #footer>
      <div class="flex justify-end"><button type="button" data-tree-start-done class="g-btn sm" @click="close">{{ tr("決めた (ツリーへ)", "Done (back to the tree)") }}</button></div>
    </template>
  </ModalShell>
</template>
