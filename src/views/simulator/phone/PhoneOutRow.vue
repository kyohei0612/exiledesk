<!--
  PhoneOutRow.vue — スマホ版の ② 「結果ごとにどうする?」の 1 行 (結果の箱 1 つ。2026-10-25 オーナーの選んだ案 sim28-phone-quiz-mock の ②)。
  答え = 次の手を決める (後で ① で聞く)・同じ手をもう一度 (↩ 打つ前の箱)・始めから (↩ スタート)・完成 (当たりだけ)・ほかの箱へ。
  戻れるかは PC の戻り先選びと同じ use-tree-link (その箱の手を、この箱のアイテムにエンジンで打てるか)。自動でつないだ箱は PC と同じ印。
  スマホは省略しない (10-26 オーナー「基本スマホは省略したらダメ」): 文は折り返して全文、この結果のアイテムと戻り先の箱のアイテムはいつも開いたまま
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { useTree } from "../tree/use-tree";
import { useTreeLink } from "../tree/use-tree-link";
import { backTargetsOf } from "../tree/tree-merge";
import { handLabel, OUT_LOOK } from "../tree/tree-names";
import { mapPick, phoneRun, usePhoneQuiz } from "./use-phone-quiz";
import { routeText, runText } from "../tree/tree-fail";
import { sideGroup } from "../tree/tree-hand-plan";
import { joinableOf, joinSide, splitAny } from "../../../services/simulator/tree/tree-model";
import StageItemCard from "../../../components/for-share/item/StageItemCard.vue";
import { craftStage as s } from "../../../state/craft-stage";
import { sampleOf } from "../../../services/simulator/tree/tree-sample";
import { treeRowTags } from "../tree/tree-row-tags";
import { pctText, useTreeOdds } from "../tree/tree-odds";
import { flag } from "../../../web/release-flags";
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
/** まとめられる同じ側の横の当たり (tree-model の joinableOf) */
const joinable = computed(() => { const g = sideGroup(); return g && box.value?.out === "hit" ? joinableOf(t.doc.value, props.boxId, g) : []; });
/** 動きをまとめる一覧 (同じ側の横の当たりにチェック、既定は全部) */
const joinOpen = ref(false);
const joinPick = ref<string[]>([]);
function openJoin(): void { joinPick.value = [...joinable.value]; joinOpen.value = !joinOpen.value; }
function mergeSide(): void { const g = sideGroup(), pick = [...joinPick.value]; joinOpen.value = false; if (g && pick.length) t.edit((d) => joinSide(d, props.boxId, g, pick)); }
/** 始めに戻れない理由 (use-tree-link、始めの手がこのアイテムに打てない) */
const startNo = computed(() => link.value.get("start") ?? null);
const canDone = computed(() => box.value?.out === "hit" || box.value?.out === "branch");
/** ほかの戻り先 (打つ前の箱・始まり・自分を除いた、戻れる箱) */
const others = computed(() => [...link.value].filter(([id, why]) => why === null && id !== parent.value && id !== "start" && !!t.doc.value.boxes[id]?.hand).map(([id]) => id));
/** 全体図で戻り先を選ぶ (スイッチ phoneMap、10-26 オーナー「文字だけでどこに戻るか分からない」。戻れる箱 = ほか + 打つ前の箱 + 始まり)。閉じていれば前の道の文の一覧 */
const MAP = flag("phoneMap");
const listOpen = ref(false);
const pickOther = computed(() => (MAP ? mapPick.value?.from === props.boxId : listOpen.value));
function startPick(): void {
  if (!MAP) { listOpen.value = !listOpen.value; return; }
  mapPick.value = pickOther.value ? null : { from: props.boxId, ids: [...others.value, ...(canRetry.value ? [parent.value!] : []), "start"] };
}
const look = computed(() => OUT_LOOK[box.value?.out ?? "junk"]);
const backKind = computed(() => (state.value !== "back" ? null : box.value?.back === "start" ? "start" : backTo.value === parent.value ? "retry" : "other"));
const route = computed(() => routeText(t.doc.value, props.boxId, q.boxTitle));
const run = computed(() => runText(phoneRun.value, props.boxId));
const treeOdds = useTreeOdds();
const odds = computed(() => treeOdds.value.get(props.boxId) ?? null);
/** この結果のアイテムと、戻り先の箱のアイテム (いつも開いたまま、10-26 オーナー「アイテムは基本展開」) */
const itemOf = (id: string | null) => (s.data.value && id && t.doc.value.boxes[id] ? sampleOf(s.data.value, t.doc.value, id, 1).item : null);
const item = computed(() => itemOf(props.boxId));
const backItem = computed(() => (backTo.value && backTo.value !== "start" ? itemOf(backTo.value) : null));
const tagsOf = (id: string, it: ReturnType<typeof itemOf>) => (s.data.value && it ? treeRowTags(s.data.value, t.doc.value, t.doc.value.boxes[id]?.unwanted ?? [], it, t.doc.value.boxes[id]) : null);
const cardW = Math.min(340, (typeof window === "undefined" ? 375 : window.innerWidth) - 60);
const CHIP ="rounded-full border px-3 py-1.5 text-[13px] leading-none";
const chipClass = (on: boolean): string => `${CHIP} ${on ? "border-amber-300 bg-amber-500/20 text-amber-50" : "border-white/15 bg-white/[0.03] text-[#d8ccb4]"}`;
</script>

<template>
  <div v-if="box" data-phone-out :data-box-id="boxId" class="rounded-xl border bg-[#1a140d] px-3 py-2" :style="{ borderColor: `rgba(${look.c},${state === 'open' ? 0.75 : 0.35})` }">
    <p class="flex min-w-0 items-start gap-2 text-[14px] font-bold" :style="{ color: `rgb(${look.c})` }">
      <span class="min-w-0 flex-1 break-words">{{ q.boxTitle(boxId) }}</span>
      <!-- この結果になる割合 (PC の箱と同じ、エンジンの outcomeOdds) -->
      <span v-if="odds != null" data-phone-odds class="shrink-0 text-[12px] font-normal tabular-nums text-[#d8ccb4]">{{ pctText(odds) }}</span>
      <span v-if="state === 'open'" class="shrink-0 text-[11px] font-normal text-amber-200/80">{{ tr("どうする?", "Then?") }}</span>
    </p>
    <StageItemCard v-if="item" data-phone-out-item class="mt-2" :item="item" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="cardW" compact :row-tags="tagsOf(boxId, item)" />
    <!-- 回した結果 (来た人・形の合う別の箱へ移った人・止まった人と理由) -->
    <p v-if="run" data-phone-out-run class="mt-1 break-words text-[12px]" :class="phoneRun?.stuckAt[boxId] ? 'text-rose-200' : 'text-amber-100/80'">{{ run }}</p>
    <!-- 次の手が付いている箱 (① で答えた) は手の名前。押すとその手を見直す -->
    <button v-if="state === 'hand'" type="button" data-phone-out-hand class="mt-1 block w-full break-words text-left text-[12px] text-[#c8bca4] underline decoration-white/20" @click="emit('hand', boxId)">→ {{ box.hand ? handLabel(box.hand) : tr("分かれ目", "Split") }}</button>
    <template v-else>
      <!-- 行き先の文 (PC の箱と同じ tree-fail の routeText。狙いが消えた → 始め も文で、10-26 失敗時の挙動の案 2) -->
      <p v-if="route" data-phone-out-route :data-phone-out-auto="box.autoBack ? 1 : undefined" class="mt-1 break-words text-[12px] text-cyan-200/90">{{ route }}</p>
      <p v-else-if="state === 'done' && !box.hand" data-phone-out-done class="mt-1 text-[12px] text-emerald-300">{{ tr("✓ 完成 (狙いが全部そろう)", "✓ Done (all targets)") }}</p>
      <!-- 戻り先の箱のアイテム (その箱に着いた時の形。始めに戻るはベースなので出さない) -->
      <div v-if="backItem && backTo" data-phone-out-back-item class="mt-1 rounded-lg border border-cyan-300/30 bg-black/20 p-1.5">
        <p class="mb-1 break-words text-[11px] text-cyan-200/80">{{ tr(`戻り先: ${q.pathText(backTo)}`, `Returns to: ${q.pathText(backTo)}`) }}</p>
        <StageItemCard :item="backItem" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="cardW - 12" compact :row-tags="tagsOf(backTo, backItem)" />
      </div>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <button type="button" data-phone-ans="later" :class="chipClass(state === 'later')" @click="q.setLater(boxId)">{{ tr("次の手を決める", "Next craft") }}</button>
        <button v-if="canRetry" type="button" data-phone-ans="retry" :class="chipClass(backKind === 'retry')" @click="q.setReturn(boxId, parent!)">{{ tr("同じ手をもう一度", "Same craft again") }}</button>
        <button type="button" data-phone-ans="start" :class="[chipClass(backKind === 'start'), startNo ? 'opacity-40' : '']" :disabled="!!startNo" @click="q.setReturn(boxId, 'start')">{{ tr("↩ 始めに戻る", "↩ Back to start") }}</button>
        <!-- 同じ側の「どれか」の当たりを MOD ごとに分ける / 分けた箱をまとめる (10-26 オーナー) -->
        <button v-if="box.anyOf && box.anyOf.length > 1" type="button" data-phone-split-any :class="chipClass(false)" @click="t.edit((d) => splitAny(d, boxId))">{{ tr("MOD ごとに分ける", "Split by mod") }}</button>
        <button v-else-if="joinable.length" type="button" data-phone-join-side :class="chipClass(joinOpen)" @click="openJoin">{{ tr("動きをまとめる", "Merge the path") }}</button>
        <button v-if="canDone" type="button" data-phone-ans="done" :class="chipClass(state === 'done')" @click="q.setFinished(boxId)">{{ tr("完成", "Done") }}</button>
        <button v-if="others.length" type="button" data-phone-ans="other" :class="chipClass(backKind === 'other' || pickOther)" @click="startPick">{{ MAP ? (pickOther ? tr("全体図で選ぶ ↓", "Pick on the map ↓") : tr("ほかの箱へ", "Other box")) : tr("ほかの箱へ ▾", "Other box ▾") }}</button>
      </div>
      <!-- 動きをまとめる: 同じ側の横の当たりを選んでこの箱にまとめる (10-26 オーナー「選択した枠にまとめる」) -->
      <div v-if="joinOpen" data-phone-join-pick class="mt-2 flex flex-col gap-1 rounded-lg border border-amber-300/40 bg-black/20 p-2 text-[13px]">
        <p class="break-words text-[12px] text-amber-100">{{ tr("どれが付いても後の作り方が同じ物を選ぶ (以後の手は 1 本、「MOD ごとに分ける」で戻せる)", "Pick the ones that need the same next steps whichever lands (one path after this; Split by mod undoes it)") }}</p>
        <label v-for="o in joinable" :key="o" class="flex min-h-9 items-center gap-2 break-words"><input v-model="joinPick" type="checkbox" :value="o" class="size-5" />{{ q.boxTitle(o) }}</label>
        <div class="flex gap-2"><button type="button" data-phone-join-go class="g-btn-red min-h-10 flex-1" :disabled="!joinPick.length" @click="mergeSide">{{ tr("まとめる", "Merge") }}</button><button type="button" class="g-btn min-h-10 flex-1" @click="joinOpen = false">{{ tr("やめる", "Cancel") }}</button></div>
      </div>
      <!-- 始めに戻れない理由 (始めの手がこのアイテムに打てない。10-26 モンキー 7 の 1) -->
      <p v-if="startNo" data-phone-start-no class="mt-1 break-words text-[11px] text-rose-200/90">{{ startNo }}</p>
      <div v-if="!MAP && listOpen" data-phone-other class="mt-2 flex flex-col gap-1">
        <button v-for="id in others" :key="id" type="button" class="break-words rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-left text-[12px]" :class="backTo === id ? 'border-cyan-300/70 text-cyan-100' : 'text-[#d8ccb4]'" @click="listOpen = false; q.setReturn(boxId, id)">↩ {{ q.pathText(id) }}</button>
      </div>
    </template>
  </div>
</template>
