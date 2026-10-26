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
import { fixedValues } from "../tree/tree-fixed-values";
import type { StageItem } from "../../../services/craft-stage/types";
import { usePhoneQuiz, type Question } from "./use-phone-quiz";
import { stepOf } from "../tree/tree-fail";
import PhoneOutRow from "./PhoneOutRow.vue";
import { tr } from "../../../i18n/lang";

/** step = 今出している結果の番号 (PhoneTreePage の outStep。下の帯の「次へ」と同じ値を見る) */
const props = defineProps<{ q: Question; step: number }>();
const emit = defineEmits<{ hand: [id: string]; step: [n: number] }>();
const t = useTree();
const quiz = usePhoneQuiz();
const box = computed(() => t.doc.value.boxes[props.q.id]);
const item = computed(() => (s.data.value && box.value ? sampleOf(s.data.value, t.doc.value, props.q.id, 1).item : null));
const tags = computed(() => (s.data.value && item.value ? treeRowTags(s.data.value, t.doc.value, box.value?.unwanted ?? [], item.value, box.value) : null));
/** カードの幅 = 画面の幅 - 左右の余白 (360 まで) */
/** 出すカードの MOD の値は木の中で揃える (PC の箱・完成形・手の窓と同じ tree-fixed-values、5f1a5f66。表示だけ、打つ・判定は見本の値のまま) */
const cardOf = (it: StageItem): StageItem => (s.data.value ? fixedValues(s.data.value, t.doc.value, it) : it);
const cardW = ref(340);
/** カードの幅 = 画面の幅 - ページの左右の余白 (8px ずつ)。上限は付けない (10-26 夜オーナー「枠は最大限にしてもいいね、空ける必要ない」) */
const fit = (): void => { cardW.value = window.innerWidth - 16; };
onMounted(() => { fit(); window.addEventListener("resize", fit); });
// 出した質問は「次へ」・手を決めるまで留める (② の最後の行に答えた瞬間に次の質問へ飛ばない)
onMounted(() => { if (!quiz.focus.value) quiz.focus.value = props.q; });
onBeforeUnmount(() => window.removeEventListener("resize", fit));
const outs = computed(() => quiz.outsOf(props.q.id));
/** 結果は 1 つずつ 1 画面 (外れの側から、10-26 夜オーナー「スマホだとレベルが高すぎる」)。今出している結果 (下の帯の「次へ」で次) */
const k = computed(() => Math.min(props.step, Math.max(0, outs.value.length - 1)));
/** 段 (PC の画面の段と同じ stepOf)。見出しは質問でなくツリーの段として出す (10-26 夜オーナー「質問と思わせない」) */
const step = computed(() => stepOf(t.doc.value, props.q.kind === "outs" ? outs.value[0] ?? props.q.id : props.q.id));
/** ② の行の「→ 次の手」= その箱の ① */
function showHand(id: string): void { quiz.focus.value = { kind: "hand", id }; }
</script>

<template>
  <!-- スマホなので中央揃え (見出し・カード・ボタン。10-26 夜オーナー)。見出しは「n 段目 · 〜」(ツリーとして見せる、質問の言い方はしない) -->
  <div v-if="box" data-phone-ask :data-ask="q.kind" :data-box-id="q.id" class="flex min-w-0 flex-col items-center gap-2 text-center">
    <p v-if="!(q.kind === 'hand' && box.out === 'start' && !box.hand)" class="break-words text-[11px] text-[#9a8a70]">{{ quiz.pathText(q.id) }}</p>
    <template v-if="q.kind === 'hand'">
      <h2 class="break-words text-[17px] font-bold text-[#f0e4c8]">{{ tr(`${step} 段目`, `Step ${step}`) }} · {{ box.out === "start" ? tr("スタート", "Start") : quiz.boxTitle(q.id) }}</h2>
      <!-- 今のアイテム (この箱に着いた時の形)。完成の狙いの丸い札の並びは 10-26 夜にやめた (オーナー「要らない、頭が痛くなる」。完成形は上のアイテムの枠で見る) -->
      <StageItemCard v-if="item" :item="cardOf(item)" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="cardW" compact :row-tags="tags" />
      <template v-if="box.hand">
        <!-- ここで打った手 (10-27 オーナー「カオスオーブを選択とだけ出し、押したらカレンシーの選択画面へ」)。結果へは下の帯の「次へ」 -->
        <button type="button" data-phone-hand-now class="w-full rounded-xl border border-amber-300/60 bg-[#2a2014] px-3 py-3 text-center text-[14px] text-amber-50" @click="emit('hand', q.id)">{{ tr(`${handLabel(box.hand)}を選択`, `Selected: ${handLabel(box.hand)}`) }}</button>
        <button type="button" data-phone-hand-change class="g-btn !min-h-11 px-4" @click="emit('hand', q.id)">{{ tr("打つ手を替える", "Change the craft") }}</button>
      </template>
    </template>
    <template v-else>
      <h2 class="break-words text-[16px] font-bold text-[#f0e4c8]">{{ tr(`${step} 段目`, `Step ${step}`) }} · {{ box.hand ? tr(`${handLabel(box.hand)} を打った後`, `After ${handLabel(box.hand)}`) : "" }}</h2>
      <!-- 結果は 1 つずつ (k / n)。前の結果へは小さな 1 行で戻れる -->
      <p v-if="outs.length > 1" data-phone-out-count class="flex items-center gap-3 text-[12px] text-[#9a8a70]">
        <button v-if="k > 0" type="button" data-phone-out-prev class="min-h-10 underline decoration-white/20" @click="emit('step', k - 1)">‹ {{ tr("前の結果", "Previous result") }}</button>
        <span>{{ tr(`結果 ${k + 1} / ${outs.length}`, `Result ${k + 1} / ${outs.length}`) }}</span>
      </p>
      <PhoneOutRow v-if="outs[k]" :key="outs[k]" :box-id="outs[k]!" @hand="showHand" />
      <button type="button" data-phone-hand-change class="g-btn !min-h-11 px-4" @click="emit('hand', q.id)">{{ tr("打つ手を替える", "Change the craft") }}</button>
    </template>
  </div>
</template>
