<!--
  PhoneOutRow.vue — スマホ版の ② 「結果ごとにどうする?」の 1 行 (結果の箱 1 つ。2026-10-25 オーナーの選んだ案 sim28-phone-quiz-mock の ②)。
  答え = 次の手を決める (後で ① で聞く)・同じ手をもう一度 (↩ 打つ前の箱)・始めから (↩ スタート)・完成 (当たりだけ)・ほかの箱へ。
  戻れるかは PC の戻り先選びと同じ use-tree-link (その箱の手を、この箱のアイテムにエンジンで打てるか)。自動でつないだ箱は PC と同じ印
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { useTree } from "../tree/use-tree";
import { useTreeLink } from "../tree/use-tree-link";
import { backTargetsOf } from "../tree/tree-merge";
import { handLabel, OUT_LOOK } from "../tree/tree-names";
import { usePhoneQuiz } from "./use-phone-quiz";
import StageItemCard from "../../../components/for-share/item/StageItemCard.vue";
import { craftStage as s } from "../../../state/craft-stage";
import { sampleOf } from "../../../services/simulator/tree/tree-sample";
import { treeRowTags } from "../tree/tree-row-tags";
import { tr } from "../../../i18n/lang";

const props = defineProps<{ boxId: string }>();
const emit = defineEmits<{ hand: [id: string] }>();
const t = useTree();
const q = usePhoneQuiz();
const box = computed(() => t.doc.value.boxes[props.boxId]);
const parent = computed(() => box.value?.parent ?? null);
const from = computed(() => props.boxId);
/** 箱ごとの戻れる / 戻れない (null = 戻れる) */
const link = useTreeLink(t.doc, from);
const state = computed(() => q.stateOf(props.boxId));
/** 戻り先の箱 (自動でつないだ・選んだ) */
const backTo = computed(() => (box.value?.back ? backTargetsOf(t.doc.value, props.boxId)[0] ?? null : null));
/** 同じ手をもう一度 = 打つ前の箱へ戻る (始まりの手の結果は「始めから」と同じなので出さない) */
const canRetry = computed(() => !!parent.value && parent.value !== "start" && link.value.get(parent.value) === null);
const canDone = computed(() => box.value?.out === "hit" || box.value?.out === "branch");
/** ほかの戻り先 (打つ前の箱・始まり・自分を除いた、戻れる箱) */
const others = computed(() => [...link.value].filter(([id, why]) => why === null && id !== parent.value && id !== "start" && !!t.doc.value.boxes[id]?.hand).map(([id]) => id));
const pickOther = ref(false);
const look = computed(() => OUT_LOOK[box.value?.out ?? "junk"]);
const backKind = computed(() => (state.value !== "back" ? null : box.value?.back === "start" ? "start" : backTo.value === parent.value ? "retry" : "other"));
const cardOpen = ref(false);
const item = computed(() => (cardOpen.value && s.data.value && box.value ? sampleOf(s.data.value, t.doc.value, props.boxId, 1).item : null));
const tags = computed(() => (s.data.value && item.value ? treeRowTags(s.data.value, t.doc.value, box.value?.unwanted ?? [], item.value) : null));
const cardW = Math.min(340, (typeof window === "undefined" ? 375 : window.innerWidth) - 60);
const CHIP ="rounded-full border px-3 py-1.5 text-[13px] leading-none";
const chipClass = (on: boolean): string => `${CHIP} ${on ? "border-amber-300 bg-amber-500/20 text-amber-50" : "border-white/15 bg-white/[0.03] text-[#d8ccb4]"}`;
</script>

<template>
  <div v-if="box" data-phone-out :data-box-id="boxId" class="rounded-xl border bg-[#1a140d] px-3 py-2" :style="{ borderColor: `rgba(${look.c},${state === 'open' ? 0.75 : 0.35})` }">
    <p class="flex min-w-0 items-center gap-2 text-[14px] font-bold" :style="{ color: `rgb(${look.c})` }">
      <span class="min-w-0 flex-1 truncate">{{ q.boxTitle(boxId) }}</span>
      <span v-if="state === 'open'" class="shrink-0 text-[11px] font-normal text-amber-200/80">{{ tr("どうする?", "Then?") }}</span>
      <!-- この結果のアイテム (既定は閉じる。PC の箱に乗せた時のカードと同じ見本) -->
      <button type="button" data-phone-out-card class="shrink-0 rounded-md border border-white/15 px-1.5 text-[11px] font-normal leading-6 text-[#d8ccb4]" :aria-expanded="cardOpen" @click="cardOpen = !cardOpen">{{ tr("アイテム", "Item") }} {{ cardOpen ? "▾" : "▸" }}</button>
    </p>
    <StageItemCard v-if="cardOpen && item" class="mt-2" :item="item" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="cardW" compact :row-tags="tags" />
    <!-- 次の手が付いている箱 (① で答えた) は手の名前だけ。押すとその手を見直す -->
    <button v-if="state === 'hand'" type="button" data-phone-out-hand class="mt-1 block w-full truncate text-left text-[12px] text-[#c8bca4] underline decoration-white/20" @click="emit('hand', boxId)">→ {{ box.hand ? handLabel(box.hand) : tr("分かれ目", "Split") }}</button>
    <template v-else>
      <p v-if="box.autoBack && backTo" data-phone-out-auto class="mt-1 text-[12px] text-cyan-200/90">{{ tr(`↩ 同じ状態の箱へ自動でつないだ (${q.boxTitle(backTo)})`, `↩ Auto-linked to the same state (${q.boxTitle(backTo)})`) }}</p>
      <p v-else-if="backKind === 'other' && backTo" class="mt-1 text-[12px] text-cyan-200/90">↩ {{ q.boxTitle(backTo) }}</p>
      <p v-else-if="state === 'done' && !box.hand" data-phone-out-done class="mt-1 text-[12px] text-emerald-300">{{ tr("✓ 完成 (狙いが全部そろう)", "✓ Done (all targets)") }}</p>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <button type="button" data-phone-ans="later" :class="chipClass(state === 'later')" @click="q.setLater(boxId)">{{ tr("次の手を決める", "Next craft") }}</button>
        <button v-if="canRetry" type="button" data-phone-ans="retry" :class="chipClass(backKind === 'retry')" @click="q.setReturn(boxId, parent!)">{{ tr("同じ手をもう一度", "Same craft again") }}</button>
        <button type="button" data-phone-ans="start" :class="chipClass(backKind === 'start')" @click="q.setReturn(boxId, 'start')">{{ tr("↩ 始めに戻る", "↩ Back to start") }}</button>
        <button v-if="canDone" type="button" data-phone-ans="done" :class="chipClass(state === 'done')" @click="q.setFinished(boxId)">{{ tr("完成", "Done") }}</button>
        <button v-if="others.length" type="button" data-phone-ans="other" :class="chipClass(backKind === 'other' || pickOther)" @click="pickOther = !pickOther">{{ tr("ほかの箱へ ▾", "Other box ▾") }}</button>
      </div>
      <div v-if="pickOther" data-phone-other class="mt-2 flex flex-col gap-1">
        <button v-for="id in others" :key="id" type="button" class="truncate rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-left text-[12px]" :class="backTo === id ? 'border-cyan-300/70 text-cyan-100' : 'text-[#d8ccb4]'" @click="pickOther = false; q.setReturn(boxId, id)">↩ {{ q.pathText(id) }}</button>
      </div>
    </template>
  </div>
</template>
