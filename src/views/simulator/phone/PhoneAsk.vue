<!--
  PhoneAsk.vue — スマホ版の今の質問 1 つ (2026-10-25 オーナーの選んだ案 sim28-phone-quiz-mock の ①・②)。
  ① hand = 今の箱のアイテム (PC の箱に乗せた時のカードと同じ見本) と「次に何を打つ?」→ 棚 (PC と同じ TreeHandPage) を開く。
  ② outs = 打った手の結果の箱ごとに答える (PhoneOutRow)。結果の箱は PC と同じ「エンジンが出しうる結果から」(applyPick の only)
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
import { useReason } from "../../../services/craft-stage/engine";
import { needAimOf, planPick, type PickPlan as Plan } from "../tree/tree-hand-plan";
import { tr } from "../../../i18n/lang";

const props = defineProps<{ q: Question }>();
const emit = defineEmits<{ hand: [id: string]; pick: [plan: Plan] }>();
const t = useTree();
const quiz = usePhoneQuiz();
const box = computed(() => t.doc.value.boxes[props.q.id]);
const smp = computed(() => (s.data.value && box.value ? sampleOf(s.data.value, t.doc.value, props.q.id, 1) : null));
const item = computed(() => smp.value?.item ?? null);
const tags = computed(() => (s.data.value && item.value ? treeRowTags(s.data.value, t.doc.value, box.value?.unwanted ?? [], item.value) : null));
/** よく使う手の候補 (オーブの基本の段・フラクチャー。並びは棚と同じ) */
const QUICK = ["transmute", "augment", "regal", "alchemy", "exalt", "chaos", "annul", "fracture"];
/** よく使う手 (打てる物だけ。手の一式は棚・猿の口と同じ planPick、当たりの札は付きうる完成の狙い全部) */
const quick = computed(() => {
  const d = s.data.value, it = item.value, b = box.value;
  if (!d || !it || !b || b.hand || needAimOf(t.doc.value, props.q.id, smp.value?.note)) return [];
  return QUICK.filter((k) => !useReason(d, it, k, [])).map((k) => ({ key: k, plan: planPick(d, t.doc.value, props.q.id, it, k, [], {}, t.goals.value) }))
    .filter((p) => !p.plan.problem)
    .map((p) => ({ ...p, sub: p.plan.aims.length ? tr(`当たり: ${p.plan.aims.map((a) => t.aimShort(a)).join("・")}`, `Hits: ${p.plan.aims.map((a) => t.aimShort(a)).join(", ")}`) : p.plan.hand.free ? tr("狙い無し", "No target") : "" }));
});
/** カードの幅 =画面の幅 - 左右の余白 (360 まで) */
const cardW = ref(340);
const fit = (): void => { cardW.value = Math.min(360, window.innerWidth - 40); };
onMounted(() => { fit(); window.addEventListener("resize", fit); });
// 出した質問は「決めた」・手を決めるまで留める (② の最後の行に答えた瞬間に次の質問へ飛ばない)
onMounted(() => { if (!quiz.focus.value) quiz.focus.value = props.q; });
onBeforeUnmount(() => window.removeEventListener("resize", fit));
/** ② の結果の箱 (品質だけ上げた後の通り抜けはその先の手の結果を出す) */
const outs = computed(() => {
  const b = box.value;
  if (!b) return [];
  const pass = b.outs.length === 1 && t.doc.value.boxes[b.outs[0]!]?.out === "pass" ? t.doc.value.boxes[b.outs[0]!]! : null;
  return pass?.hand ? pass.outs : pass ? [] : b.outs;
});
const openLeft = computed(() => outs.value.filter((id) => quiz.stateOf(id) === "open").length);
/** 決めた = 答えていない結果は「次の手を決める」にして次の質問へ */
function decide(): void {
  for (const id of outs.value) if (quiz.stateOf(id) === "open") quiz.setLater(id);
  quiz.focus.value = null;
}
/** ① で次の手が付いている箱を押した = その手の結果を見る */
function showOuts(id: string): void { quiz.focus.value = { kind: "outs", id }; }
/** ② の行の「→ 次の手」= その箱の ① */
function showHand(id: string): void { quiz.focus.value = { kind: "hand", id }; }
</script>

<template>
  <div v-if="box" data-phone-ask :data-ask="q.kind" :data-box-id="q.id" class="flex min-w-0 flex-col gap-2">
    <p class="truncate text-[11px] text-[#9a8a70]">{{ quiz.pathText(q.id) }}</p>
    <template v-if="q.kind === 'hand'">
      <StageItemCard v-if="item" :item="item" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="cardW" compact :row-tags="tags" />
      <h2 class="mt-1 text-[17px] font-bold text-[#f0e4c8]">{{ box.hand ? tr("この箱で打つ手", "Craft from this box") : tr("次に何を打つ?", "What do you craft next?") }}</h2>
      <template v-if="box.hand">
        <button type="button" data-phone-hand-now class="rounded-xl border border-amber-300/60 bg-[#2a2014] px-3 py-3 text-left text-[14px] text-amber-50" @click="showOuts(q.id)">{{ handLabel(box.hand) }} <span class="float-right text-[12px] text-amber-200/80">{{ tr("結果 ›", "Results ›") }}</span></button>
        <button type="button" data-phone-hand-change class="g-btn" @click="emit('hand', q.id)">{{ tr("打つ手を替える", "Change the craft") }}</button>
      </template>
      <template v-else>
        <!-- よく使う手 (この箱で打てるオーブの基本の段だけ。お告げ無し・当たりは付きうる完成の狙い全部 = 棚で持ってそのまま押した時と同じ) -->
        <p v-if="quick.length" class="text-[11px] text-[#9a8a70]">{{ tr("よく使う手 (この箱で打てる物だけ)", "Common crafts (usable here)") }}</p>
        <button v-for="p in quick" :key="p.key" type="button" data-phone-quick :data-key="p.key" class="flex min-w-0 items-center gap-2 rounded-xl border border-[#4a3a24] bg-[#1a140d] px-3 py-2.5 text-left text-[14px] text-[#f0e4c8] active:border-amber-300" @click="emit('pick', p.plan)">
          <span class="min-w-0 flex-1 truncate">{{ handLabel(p.plan.hand) }}</span>
          <span class="max-w-[55%] shrink-0 truncate text-right text-[11px] text-[#9a8a70]">{{ p.sub }}</span>
        </button>
        <button type="button" data-phone-hand-open class="g-btn py-3 text-[15px]" @click="emit('hand', q.id)">{{ quick.length ? tr("ほかの手・お告げ (棚を開く)", "Other crafts & omens (open the shelf)") : tr("打つ手を選ぶ (棚を開く)", "Choose a craft (open the shelf)") }}</button>
      </template>
    </template>
    <template v-else>
      <h2 class="text-[16px] font-bold text-[#f0e4c8]">{{ box.hand ? tr(`${handLabel(box.hand)} を打つと…`, `After ${handLabel(box.hand)}…`) : "" }}</h2>
      <p class="text-[12px] text-[#9a8a70]">{{ tr("結果ごとにどうするか (結果はエンジンが出しうる物から)", "What to do with each result (results come from the engine)") }}</p>
      <PhoneOutRow v-for="id in outs" :key="id" :box-id="id" @hand="showHand" />
      <div class="mt-1 flex gap-2">
        <button type="button" data-phone-hand-change class="g-btn flex-1" @click="emit('hand', q.id)">{{ tr("打つ手を替える", "Change the craft") }}</button>
        <button type="button" data-phone-decide class="g-btn flex-1 !border-amber-300/80 text-amber-50" @click="decide">{{ openLeft ? tr(`決めた (残り ${openLeft} は次の手)`, `Done (${openLeft} left → next craft)`) : tr("決めた", "Done") }}</button>
      </div>
    </template>
  </div>
</template>
