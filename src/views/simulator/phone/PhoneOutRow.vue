<!--
  PhoneOutRow.vue — スマホ版の ② 「結果ごとにどうする?」の 1 行 (結果の箱 1 つ。2026-10-25 オーナーの選んだ案 sim28-phone-quiz-mock の ②)。
  答え = 次の手を決める (後で ① で聞く)・同じ手をもう一度 (↩ 打つ前の箱)・始めから (↩ スタート)・完成 (当たりだけ)・ほかの箱へ。
  戻れるかは PC の戻り先選びと同じ use-tree-link (その箱の手を、この箱のアイテムにエンジンで打てるか)。自動でつないだ箱は PC と同じ印。
  スマホは省略しない (10-26 オーナー「基本スマホは省略したらダメ」): 文は折り返して全文、この結果のアイテムと戻り先の箱のアイテムはいつも開いたまま
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { useTree } from "../tree/use-tree";
import { fixedValues } from "../tree/tree-fixed-values";
import type { StageItem } from "../../../services/craft-stage/types";
import { useTreeLink } from "../tree/use-tree-link";
import { backTargetsOf } from "../tree/tree-merge";
import { handLabel, OUT_LOOK } from "../tree/tree-names";
import { isMiss, mapPick, phoneRun, usePhoneQuiz } from "./use-phone-quiz";
import { routeText, runText, stepBackText } from "../tree/tree-fail";
import { sideGroup } from "../tree/tree-hand-plan";
import { absorbOuts, joinableOf, joinSide, splitAny, splitOuts } from "../../../services/simulator/tree/tree-model-ops";
import { joinableShapeOf } from "../../../services/simulator/tree/tree-shape";
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
/** まとめられる横の箱: 当たりは同じ側の当たり、外れ・狙いが消えたなどは同じ形の箱 (10-26) */
const joinable = computed(() => { if (box.value && box.value.out !== "hit") return joinableShapeOf(t.doc.value, props.boxId); const g = sideGroup(); return g ? joinableOf(t.doc.value, props.boxId, g) : []; });
/** 動きをまとめる一覧 (同じ側の横の当たりにチェック、既定は全部) */
const joinOpen = ref(false);
const joinPick = ref<string[]>([]);
function openJoin(): void { joinPick.value = [...joinable.value]; joinOpen.value = !joinOpen.value; }
function mergeSide(): void {
  const pick = [...joinPick.value];
  joinOpen.value = false;
  if (!pick.length) return;
  if (box.value?.out !== "hit") { const ok = joinable.value.filter((x) => pick.includes(x)); t.edit((d) => absorbOuts(d, props.boxId, ok)); return; }
  const g = sideGroup();
  if (g) t.edit((d) => joinSide(d, props.boxId, g, pick));
}
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
  mapPick.value = pickOther.value ? null : { from: props.boxId, ids: pickIds.value };
}
/** 決めていない外れの既定 (「次へ」で ↩ 再度挑戦 = 打つ前の箱へ。use-phone-quiz の decide と同じ判定)。"retry" / "start" / null */
const defRetry = computed(() => (state.value !== "open" || !isMiss(box.value) || !parent.value || link.value.get(parent.value) !== null ? null : parent.value === "start" ? "start" : "retry"));
/** 既定の答えの見た目 = 薄い塗り (点線・1px の線は並べない決まり、メモ feedback-no-flicker-lines) + 札「既定」 */
const DEF = "!bg-amber-500/15";
/** 再度挑戦の言い方 (決まり済み「↩ 再度挑戦 · n 段目へ戻る」、メモ sim-decisions。始まりの手の結果も同じ言い方) */
const retryText = computed(() => (parent.value ? `↩ ${tr("再度挑戦", "Retry")} · ${stepBackText(t.doc.value, parent.value)}` : ""));
const look = computed(() => OUT_LOOK[box.value?.out ?? "junk"]);
/** 全体図で選べる戻り先 (ほかの戻れる箱・打つ前の箱・始まり。戻れない物は入れない) */
const pickIds = computed(() => [...others.value, ...(canRetry.value ? [parent.value!] : []), ...(startNo.value ? [] : ["start"])]);
/** 答えの選びの重ね窓を開いている */
const pickOpen = ref(false);
/** 選びの窓で答えを押したら閉じる (まとめる・分けるの一覧を開く押しは閉じない。「ほかの箱へ」は全体図で選ぶので閉じる) */
function onPickClick(e: MouseEvent): void {
  const b = (e.target as HTMLElement).closest("[data-phone-ans], [data-phone-join-go], [data-phone-split-any], [data-phone-other] button");
  if (b) setTimeout(() => { pickOpen.value = false; }, 0);
}
/** 今の答えの 1 行 (決めていなければ「次へ」で入る既定、10-26 夜オーナー「『次へ』で基本進行」) */
const answerText = computed((): string => {
  if (state.value === "open") return defRetry.value ? tr(`→ ${retryText.value} (既定)`, `→ ${retryText.value} (default)`) : tr("→ 次の手を決める (既定)", "→ Next craft (default)");
  if (state.value === "later") return tr("→ 次の手を決める", "→ Next craft");
  if (state.value === "done") return tr("✓ 完成", "✓ Done");
  return route.value ?? "";
});
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
/** 出すカードの MOD の値は木の中で揃える (PC の箱・完成形・手の窓と同じ tree-fixed-values、5f1a5f66。表示だけ、打つ・判定は見本の値のまま) */
const cardOf = (it: StageItem): StageItem => (s.data.value ? fixedValues(s.data.value, t.doc.value, it) : it);
/** カードの幅 = 行の中いっぱい (ページの余白 16 + 行の枠 2 + 行の左右の余白 12)。上限は付けない (10-26 夜オーナー「枠は最大限」) */
const cardW = (typeof window === "undefined" ? 375 : window.innerWidth) - 30;
const CHIP = "inline-flex min-h-10 items-center rounded-full border px-3 py-1.5 text-[13px] leading-tight";
const chipClass = (on: boolean): string => `${CHIP} ${on ? "border-amber-300 bg-amber-500/20 text-amber-50" : "border-white/15 bg-white/[0.03] text-[#d8ccb4]"}`;
</script>

<template>
  <!-- 結果の行 = 題 (と割合) とアイテムの中身だけ (10-26 夜オーナー「枠の中には出さない、ここはあくまでアイテムの中身だけ」「『次へ』で基本進行」)。
       今の答えはカードの下の小さな 1 行、変えたい時は「答えを変える ▾」で下から選びの窓 -->
  <div v-if="box" data-phone-out :data-box-id="boxId" class="w-full rounded-xl border bg-[#1a140d] px-1.5 py-2 text-center" :style="{ borderColor: `rgba(${look.c},${state === 'open' ? 0.75 : 0.35})` }">
    <p class="break-words text-center text-[14px] font-bold" :style="{ color: `rgb(${look.c})` }">
      {{ q.boxTitle(boxId) }}<!-- この結果になる割合 (PC の箱と同じ、エンジンの outcomeOdds) --><span v-if="odds != null" data-phone-odds class="ml-1.5 text-[12px] font-normal tabular-nums text-[#d8ccb4]">{{ pctText(odds) }}</span>
    </p>
    <StageItemCard v-if="item" data-phone-out-item class="mx-auto mt-2" :item="cardOf(item)" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="cardW" compact :row-tags="tagsOf(boxId, item)" />
    <!-- 回した結果 (来た人・形の合う別の箱へ移った人・止まった人と理由) -->
    <p v-if="run" data-phone-out-run class="mt-1 break-words text-[12px]" :class="phoneRun?.stuckAt[boxId] ? 'text-rose-200' : 'text-amber-100/80'">{{ run }}</p>
  </div>
  <!-- 今の答え (カードの外の小さな 1 行) と、答えを変える入口 -->
  <div v-if="box" data-phone-out-answer :data-box-id="boxId" class="-mt-1 flex w-full min-w-0 flex-wrap items-center justify-center gap-x-2 text-[12px]">
    <button v-if="state === 'hand'" type="button" data-phone-out-hand class="min-h-10 min-w-0 break-words text-[#c8bca4] underline decoration-white/20" @click="emit('hand', boxId)">→ {{ box.hand ? handLabel(box.hand) : tr("分かれ目", "Split") }}</button>
    <span v-else data-phone-out-now class="min-w-0 break-words" :class="state === 'open' ? 'text-amber-200/90' : state === 'done' ? 'text-emerald-300' : 'text-cyan-200/90'">{{ answerText }}</span>
    <button v-if="state !== 'hand'" type="button" data-phone-out-change class="min-h-10 shrink-0 px-1 text-[#9a8a70] underline decoration-white/20" @click="pickOpen = true">{{ tr("答えを変える ▾", "Change ▾") }}</button>
  </div>
  <!-- 答えの選び (下から出る重ね窓。閉じれば元の場所のまま) -->
  <Teleport to="body">
    <div v-if="box && pickOpen" data-phone-out-pick :data-box-id="boxId" class="fixed inset-0 z-[55] flex flex-col justify-end bg-black/55" @click.self="pickOpen = false">
      <div class="flex max-h-[88vh] flex-col rounded-t-2xl border-t-2 border-[#b08a3c] bg-[#15110c] shadow-[0_-10px_30px_rgba(0,0,0,0.8)]">
        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-2 text-center" @click.capture="onPickClick">
          <div class="mx-auto mb-2 h-1.5 w-11 rounded-full bg-white/25" />
          <p class="break-words text-[15px] font-bold" :style="{ color: `rgb(${look.c})` }">{{ q.boxTitle(boxId) }}</p>
          <p class="mb-1 break-words text-[12px] text-[#9a8a70]">{{ tr("この結果の次", "After this result") }}</p>
      <!-- 戻り先の箱のアイテム (その箱に着いた時の形。始めに戻るはベースなので出さない) -->
      <div v-if="backItem && backTo" data-phone-out-back-item class="mt-1 rounded-lg border border-cyan-300/30 bg-black/20 p-1.5">
        <p class="mb-1 break-words text-[11px] text-cyan-200/80">{{ tr(`戻り先: ${q.pathText(backTo)}`, `Returns to: ${q.pathText(backTo)}`) }}</p>
        <StageItemCard class="mx-auto" :item="cardOf(backItem)" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="cardW - 14" compact :row-tags="tagsOf(backTo, backItem)" />
      </div>
      <div class="mt-2 flex flex-wrap justify-center gap-1.5">
        <button type="button" data-phone-ans="later" :class="chipClass(state === 'later')" @click="q.setLater(boxId)">{{ tr("次の手を決める", "Next craft") }}</button>
        <button v-if="canRetry" type="button" data-phone-ans="retry" :class="[chipClass(backKind === 'retry'), defRetry === 'retry' ? DEF : '']" @click="q.setReturn(boxId, parent!)">{{ retryText }}<span v-if="defRetry === 'retry'" class="ml-1.5 rounded bg-amber-300/25 px-1 text-[11px] text-amber-100">{{ tr("既定", "Default") }}</span></button>
        <button v-if="parent === 'start'" type="button" data-phone-ans="start" :class="[chipClass(backKind === 'start'), startNo ? 'opacity-40' : '', defRetry === 'start' ? DEF : '']" :disabled="!!startNo" @click="q.setReturn(boxId, 'start')">{{ parent === "start" ? retryText : `↩ ${stepBackText(t.doc.value, "start")}` }}<span v-if="defRetry === 'start'" class="ml-1.5 rounded bg-amber-300/25 px-1 text-[11px] text-amber-100">{{ tr("既定", "Default") }}</span></button>
        <!-- 同じ側の「どれか」の当たりを MOD ごとに分ける / 分けた箱をまとめる (10-26 オーナー) -->
        <button v-if="(box.anyOf?.length ?? 0) > 1 || (box.mergedOuts?.length ?? 0) > 0" type="button" data-phone-split-any :class="chipClass(false)" @click="t.edit((d) => (box!.anyOf?.length ? splitAny(d, boxId) : splitOuts(d, boxId)))">{{ box.anyOf?.length ? tr("MOD ごとに分ける", "Split by mod") : tr("分ける", "Split") }}</button>
        <button v-else-if="joinable.length" type="button" data-phone-join-side :class="chipClass(joinOpen)" @click="openJoin">{{ tr("動きをまとめる", "Merge the path") }}</button>
        <button v-if="canDone" type="button" data-phone-ans="done" :class="chipClass(state === 'done')" @click="q.setFinished(boxId)">{{ tr("完成", "Done") }}</button>
        <!-- 戻り先は全体図で選ぶ (戻れる箱だけ光る。打つ前の箱・始まりも含む。10-26 夜オーナー「n 段目へ戻るの選び方は全体図で」) -->
        <button v-if="pickIds.length" type="button" data-phone-ans="other" :class="chipClass(backKind === 'other' || pickOther)" @click="startPick">{{ MAP ? tr("戻り先を全体図で選ぶ", "Pick where to return on the map") : tr("ほかの箱へ ▾", "Other box ▾") }}</button>
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
        <button v-for="id in others" :key="id" type="button" class="min-h-10 break-words rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-left text-[13px]" :class="backTo === id ? 'border-cyan-300/70 text-cyan-100' : 'text-[#d8ccb4]'" @click="listOpen = false; q.setReturn(boxId, id)">↩ {{ q.pathText(id) }}</button>
      </div>
        </div>
        <div class="flex border-t border-white/10 px-3 py-2">
          <button type="button" data-phone-out-pick-close class="g-btn !min-h-11 flex-1" @click="pickOpen = false">{{ tr("閉じる", "Close") }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
