<!--
  PhoneBoxPeek.vue — スマホ版の箱の重ね窓の「木の中の位置」で小さい箱を押した時の窓 (2026-10-27 昼オーナー、スイッチ phone1027)。
  その箱のアイテムの枠と、その状態で打つカレンシー (次の手) だけを、重ね窓の上にさらに重ねて出す。
  閉じ方はほかの窓と同じ: 閉じるボタン・枠の外・Esc (Esc は親の PhoneBoxSheet が先にこの窓だけ閉じる)
-->
<script setup lang="ts">
import { computed } from "vue";
import StageItemCard from "../../../components/for-share/item/StageItemCard.vue";
import { craftStage as s } from "../../../state/craft-stage";
import { sampleOf } from "../../../services/simulator/tree/tree-sample";
import { treeRowTags } from "../tree/tree-row-tags";
import { handLabel, OUT_LOOK } from "../tree/tree-names";
import { useTree } from "../tree/use-tree";
import { fixedValues } from "../tree/tree-fixed-values";
import { stepOf } from "../tree/tree-fail";
import { usePhoneQuiz } from "./use-phone-quiz";
import { tr } from "../../../i18n/lang";

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ close: [] }>();
const t = useTree();
const q = usePhoneQuiz();
const box = computed(() => t.doc.value.boxes[props.id]);
const look = computed(() => OUT_LOOK[box.value?.out ?? "junk"]);
const item = computed(() => (s.data.value && box.value ? sampleOf(s.data.value, t.doc.value, props.id, 1).item : null));
const card = computed(() => (s.data.value && item.value ? fixedValues(s.data.value, t.doc.value, item.value) : item.value));
const tags = computed(() => (s.data.value && card.value ? treeRowTags(s.data.value, t.doc.value, box.value?.unwanted ?? [], card.value, box.value) : null));
/** カードの幅 = 窓の中いっぱい (窓の左右 12 + 中の余白 12) */
const cardW = (typeof window === "undefined" ? 375 : window.innerWidth) - 48;
</script>

<template>
  <div v-if="box" data-phone-peek :data-box-id="id" class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-3" @click.self="emit('close')">
    <div role="dialog" aria-modal="true" class="flex max-h-[86vh] w-full flex-col rounded-xl border-2 border-[#b08a3c] bg-sim-panel shadow-[0_10px_30px_rgba(0,0,0,0.8)]">
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-2 pt-2 text-center">
        <p class="break-words text-[15px] font-bold" :style="{ color: `rgb(${look.c})` }">{{ tr(`${stepOf(t.doc.value, id)} 段目`, `Step ${stepOf(t.doc.value, id)}`) }} · {{ q.boxTitle(id) }}</p>
        <StageItemCard v-if="card" class="mx-auto mt-2" :item="card" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="cardW" compact :row-tags="tags" />
        <p data-phone-peek-hand class="mx-1.5 mt-2 break-words rounded-lg border border-amber-300/50 bg-[#2a2014] px-2 py-2 text-[13px] text-amber-50">
          {{ box.hand ? tr(`ここで打つ: ${handLabel(box.hand)}`, `Used here: ${handLabel(box.hand)}`) : tr("ここで打つ手はまだ無い", "No craft here yet") }}
        </p>
      </div>
      <div class="flex border-t border-white/10 px-3 py-2">
        <button type="button" data-phone-peek-close class="g-btn !min-h-11 flex-1" @click="emit('close')">{{ tr("閉じる", "Close") }}</button>
      </div>
    </div>
  </div>
</template>
