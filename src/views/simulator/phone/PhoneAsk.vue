<!--
  PhoneAsk.vue — スマホ版の今の質問 1 つ (2026-10-25 オーナーの選んだ案 sim28-phone-quiz-mock の ①・②)。
  ① hand = 今の箱のアイテム (PC の箱に乗せた時のカードと同じ見本) と完成の狙いの残り。打つ手は下の帯の「打つ手を選ぶ」→ PC と同じ棚 (TreeHandPage)。
  ② outs = 打った手の結果の箱ごとに答える (PhoneOutRow)。結果の箱は PC と同じ「エンジンが出しうる結果から」(applyPick の only)。「決めた」は下の帯
  (主な操作は親指の届く下、10-25 オーナー「体感的に操作」の点検)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import StageItemCard from "../../../components/for-share/item/StageItemCard.vue";
import { craftStage as s } from "../../../state/craft-stage";
import { sampleOf } from "../../../services/simulator/tree/tree-sample";
import { treeRowTags } from "../tree/tree-row-tags";
import { handLabel } from "../tree/tree-names";
import { useTree } from "../tree/use-tree";
import { usePhoneQuiz, type Question } from "./use-phone-quiz";
import PhoneOutRow from "./PhoneOutRow.vue";
import { tr } from "../../../i18n/lang";

const props = defineProps<{ q: Question }>();
const emit = defineEmits<{ hand: [id: string] }>();
const t = useTree();
const quiz = usePhoneQuiz();
const box = computed(() => t.doc.value.boxes[props.q.id]);
const item = computed(() => (s.data.value && box.value ? sampleOf(s.data.value, t.doc.value, props.q.id, 1).item : null));
const tags = computed(() => (s.data.value && item.value ? treeRowTags(s.data.value, t.doc.value, box.value?.unwanted ?? [], item.value, box.value) : null));
/** カードの幅 = 画面の幅 - 左右の余白 (360 まで) */
const cardW = ref(340);
const fit = (): void => { cardW.value = Math.min(360, window.innerWidth - 40); };
onMounted(() => { fit(); window.addEventListener("resize", fit); });
// 出した質問は「次へ」・手を決めるまで留める (② の最後の行に答えた瞬間に次の質問へ飛ばない)
onMounted(() => { if (!quiz.focus.value) quiz.focus.value = props.q; });
onBeforeUnmount(() => window.removeEventListener("resize", fit));
const outs = computed(() => quiz.outsOf(props.q.id));
/** ① で次の手が付いている箱を押した = その手の結果を見る */
function showOuts(id: string): void { quiz.focus.value = { kind: "outs", id }; }
/** ② の行の「→ 次の手」= その箱の ① */
function showHand(id: string): void { quiz.focus.value = { kind: "hand", id }; }
</script>

<template>
  <!-- スマホなので中央揃え (見出し・カード・ボタン。10-26 夜オーナー) -->
  <div v-if="box" data-phone-ask :data-ask="q.kind" :data-box-id="q.id" class="flex min-w-0 flex-col items-center gap-2 text-center">
    <p v-if="!(q.kind === 'hand' && box.out === 'start' && !box.hand)" class="break-words text-[11px] text-[#9a8a70]">{{ quiz.pathText(q.id) }}</p>
    <template v-if="q.kind === 'hand'">
      <h2 class="text-[17px] font-bold text-[#f0e4c8]">{{ box.hand ? tr("この箱で打つ手", "Craft from this box") : box.out === "start" ? tr("スタート", "Start") : tr("次に何を打つ?", "What do you craft next?") }}</h2>
      <!-- 今のアイテム (この箱に着いた時の形)。完成の狙いの丸い札の並びは 10-26 夜にやめた (オーナー「要らない、頭が痛くなる」。完成形は上のアイテムの枠で見る) -->
      <p class="text-[11px] font-bold text-[#c9b48a]">{{ tr("今のアイテム", "Current item") }}</p>
      <StageItemCard v-if="item" :item="item" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="cardW" compact :row-tags="tags" />
      <template v-if="box.hand">
        <button type="button" data-phone-hand-now class="w-full rounded-xl border border-amber-300/60 bg-[#2a2014] px-3 py-3 text-center text-[14px] text-amber-50" @click="showOuts(q.id)">{{ handLabel(box.hand) }} <span class="ml-2 text-[12px] text-amber-200/80">{{ tr("結果 ›", "Results ›") }}</span></button>
        <button type="button" data-phone-hand-change class="g-btn !min-h-10" @click="emit('hand', q.id)">{{ tr("打つ手を替える", "Change the craft") }}</button>
      </template>
    </template>
    <template v-else>
      <h2 class="text-[16px] font-bold text-[#f0e4c8]">{{ box.hand ? tr(`${handLabel(box.hand)} を打つと…`, `After ${handLabel(box.hand)}…`) : "" }}</h2>
      <p class="text-[12px] text-[#9a8a70]">{{ tr("外れから先に並べています。決めなかった外れは「次へ」で「↩ 再度挑戦」、当たりは次の手を 1 つずつ聞きます", "Misses are listed first. Open misses get \"↩ Retry\" on Next; for hits you pick the next craft one by one") }}</p>
      <PhoneOutRow v-for="id in outs" :key="id" class="w-full" :box-id="id" @hand="showHand" />
      <button type="button" data-phone-hand-change class="g-btn !min-h-10" @click="emit('hand', q.id)">{{ tr("打つ手を替える", "Change the craft") }}</button>
    </template>
  </div>
</template>
