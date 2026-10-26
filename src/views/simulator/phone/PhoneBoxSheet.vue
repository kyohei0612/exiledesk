<!--
  PhoneBoxSheet.vue — スマホ版の箱の重ね窓 (2026-10-26 オーナーの選んだ案 B「タップでその回にワープじゃなくて展開して手を見せる」「やりづらかったらオーバーレイで見させてもおk」)。
  全体図 (PhoneMap)・戻り先選び (mapPick) で箱を押すと、移らずに下から出す。閉じれば元の場所・スクロールのまま。
  中身は省略しない (決まり 10): 箱の名前と道・今のアイテム (開いたまま)・行き先の文 (tree-fail)・回した結果・この回の手と結果ごとの行き先・木の中の位置 (小さな図、線はつながりだけ)。
  動くのは下のボタンだけ: 「この回の質問へ」(答え直す) / 戻り先を選んでいる時は「ここへ戻す」
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import TreeNote from "../tree/TreeNote.vue";
import StageItemCard from "../../../components/for-share/item/StageItemCard.vue";
import { craftStage as s } from "../../../state/craft-stage";
import { sampleOf } from "../../../services/simulator/tree/tree-sample";
import { treeRowTags } from "../tree/tree-row-tags";
import { handLabel, OUT_LOOK } from "../tree/tree-names";
import { routeText, runText } from "../tree/tree-fail";
import { useTree } from "../tree/use-tree";
import { fixedValues } from "../tree/tree-fixed-values";
import type { StageItem } from "../../../services/craft-stage/types";
import { mapPick, phoneRun, sheet, usePhoneQuiz } from "./use-phone-quiz";
import PhoneMap from "./PhoneMap.vue";
import { tr } from "../../../i18n/lang";

const t = useTree();
const q = usePhoneQuiz();
const id = computed(() => sheet.value?.id ?? "");
const box = computed(() => t.doc.value.boxes[id.value]);
const look = computed(() => OUT_LOOK[box.value?.out ?? "junk"]);
const item = computed(() => (s.data.value && box.value ? sampleOf(s.data.value, t.doc.value, id.value, 1).item : null));
const tags = computed(() => (s.data.value && item.value ? treeRowTags(s.data.value, t.doc.value, box.value?.unwanted ?? [], item.value, box.value) : null));
/** 箱のメモを書いている (PC の TreeNote をそのまま、文だけ) */
const noteEdit = ref(false);
watch(id, () => { noteEdit.value = false; });
/** 出すカードの MOD の値は木の中で揃える (PC の箱・完成形・手の窓と同じ tree-fixed-values、5f1a5f66。表示だけ、打つ・判定は見本の値のまま) */
const cardOf = (it: StageItem): StageItem => (s.data.value ? fixedValues(s.data.value, t.doc.value, it) : it);
/** カードの幅 = 窓の中いっぱい (左右の余白 12 ずつ)。上限は付けない (10-26 夜オーナー「枠は最大限」) */
const cardW = (typeof window === "undefined" ? 375 : window.innerWidth) - 24;
const name = (x: string): string => q.boxTitle(x);
const route = computed(() => (box.value ? routeText(t.doc.value, id.value, name) : null));
const run = computed(() => runText(phoneRun.value, id.value));
/** この回の手の結果ごとの行き先 (次の手 / 戻り / 完成 / まだ) */
const outs = computed(() => (box.value?.hand ? box.value.outs : []).map((o) => {
  const b = t.doc.value.boxes[o]!;
  const next = b.hand ? `→ ${handLabel(b.hand)}` : b.done ? tr("✓ 完成", "✓ Done") : routeText(t.doc.value, o, name) ?? tr("まだ決めていない", "Not decided yet");
  return { id: o, title: name(o), c: OUT_LOOK[b.out].c, next };
}));
/** この回の質問へ (手のある箱は ②、無ければ親の ②、始まりは ①。PhoneTreePage の goBox と同じ) */
function ask(): void {
  const b = box.value;
  if (!b) return;
  q.focus.value = b.hand ? { kind: "outs", id: b.id } : b.parent ? { kind: "outs", id: b.parent } : { kind: "hand", id: b.id };
  sheet.value = null;
}
/** 戻り先を選んでいる時: この箱へ戻す */
function returnHere(): void {
  const from = sheet.value?.pickFrom;
  if (!from) return;
  q.setReturn(from, id.value);
  mapPick.value = null;
  sheet.value = null;
}
const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") sheet.value = null; };
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div v-if="box" data-phone-sheet :data-box-id="id" class="fixed inset-0 z-[60] flex flex-col justify-end bg-black/55" @click.self="sheet = null">
    <div class="flex max-h-[88vh] flex-col rounded-t-2xl border-t-2 border-[#b08a3c] bg-[#15110c] shadow-[0_-10px_30px_rgba(0,0,0,0.8)]">
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-2">
        <div class="mx-auto mb-2 h-1.5 w-11 rounded-full bg-white/25" />
        <!-- 足りない所から開いた時: 何が足りないかと直しに行くボタン (10-26 モンキー 7 の 22「押した先で何も直せず行き止まり」) -->
        <div v-if="sheet?.issue" data-phone-sheet-issue class="mb-2 rounded-lg border border-rose-400/50 bg-[#2a1416] px-2 py-1.5 text-[12px] text-rose-100">
          <p class="break-words">{{ sheet.issue }}</p>
          <button type="button" data-phone-sheet-fix class="g-btn-red mt-1.5 min-h-10 w-full text-[14px]" @click="ask">{{ tr("直しに行く (この箱の質問へ)", "Go fix it (this box's question)") }}</button>
        </div>
        <p class="flex items-start gap-2 text-[15px] font-bold" :style="{ color: `rgb(${look.c})` }">
          <span class="min-w-0 flex-1 break-words">{{ q.boxTitle(id) }}</span>
        </p>
        <p class="break-words text-[11px] text-[#9a8a70]">{{ q.pathText(id) }}</p>
        <StageItemCard v-if="item" class="mt-2" :item="cardOf(item)" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="cardW" compact :row-tags="tags" />
        <p v-if="route" data-phone-sheet-route class="mt-2 break-words text-[13px] text-cyan-200">{{ route }}</p>
        <p v-else-if="box.done" class="mt-2 text-[13px] text-emerald-300">{{ tr("✓ 完成", "✓ Done") }}</p>
        <p v-if="run" data-phone-sheet-run class="mt-1 break-words text-[12px]" :class="phoneRun?.stuckAt[id] ? 'text-rose-200' : 'text-amber-100/90'">{{ run }}</p>
        <!-- 箱のメモ (書いてあれば全文、✎ で書く。PC の箱のメモと同じ Box.note) -->
        <div data-phone-sheet-note class="mt-2">
          <TreeNote v-if="noteEdit" :key="`n-${id}`" :box-id="id" @close="noteEdit = false" />
          <button v-else type="button" data-phone-sheet-note-open class="min-h-10 w-full rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-left text-[13px]" @click="noteEdit = true">
            <span class="block text-[11px] font-bold text-[#c9b48a]">{{ box.note ? tr("この箱のメモ ✎", "Note for this box ✎") : tr("✎ この箱にメモを書く", "✎ Write a note for this box") }}</span>
            <span v-if="box.note" class="block whitespace-pre-wrap break-words text-[#e8d8c8]">{{ box.note }}</span>
          </button>
        </div>
        <template v-if="box.hand">
          <p class="mt-2 rounded-lg border border-amber-300/50 bg-[#2a2014] px-2 py-1.5 text-[13px] text-amber-50">{{ tr("この箱から次に打つ", "Next craft from here") }}: {{ handLabel(box.hand) }}</p>
          <ul class="mt-1 flex flex-col">
            <li v-for="o in outs" :key="o.id" data-phone-sheet-out class="border-b border-white/5 py-1.5 text-[12px]">
              <span class="flex items-start gap-2"><b class="min-w-0 flex-1 break-words" :style="{ color: `rgb(${o.c})` }">{{ o.title }}</b></span>
              <span class="block break-words text-cyan-100/90">{{ o.next }}</span>
            </li>
          </ul>
        </template>
        <p class="mt-2 text-[11px] text-[#9a8a70]">{{ tr("木の中の位置", "Where it is in the tree") }}</p>
        <PhoneMap :mini="id" />
      </div>
      <div class="flex gap-2 border-t border-white/10 px-3 py-2">
        <!-- 戻り先を選んでいる時は「ここへ戻る」。普段は閉じるだけ (箱の中身とこの箱からの手を見る窓、10-26 夜オーナー) -->
        <button v-if="sheet?.pickFrom" type="button" data-phone-sheet-return class="g-btn-red !min-h-11 flex-1 text-[15px]" @click="returnHere">{{ tr("ここへ戻る", "Return here") }}</button>
        <button type="button" data-phone-sheet-close class="g-btn !min-h-11 flex-1" @click="sheet = null">{{ tr("閉じる", "Close") }}</button>
      </div>
    </div>
  </div>
</template>
