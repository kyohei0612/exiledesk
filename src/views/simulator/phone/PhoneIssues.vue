<!--
  PhoneIssues.vue — スマホ版の「足りない所」(PC と同じルート精査 = use-tree-check。木を組み替えると少し待って自動で回る)。
  10-26 オーナーの選んだ失敗時の挙動の案 2「スマホにも精査」(前はスマホに無く、打てない・外れを持ったまま戻る・分かれ目の行が無い などが見えなかった)。
  ページの中は 1 行「足りない所 n ▾」だけ (10-26 夜オーナー OK、一覧が質問より上で 547px を取り、開いても質問が画面の外だった)。押すと下から重ね窓で全部 (文は省略しない、決まり 10)。
  窓の行を押すと、その箱の重ね窓 (案 B、スイッチ phoneMap) か、閉じていればその箱の質問へ
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useTree } from "../tree/use-tree";
import { useTreeCheck } from "../tree/use-tree-check";
import { sheet, usePhoneQuiz } from "./use-phone-quiz";
import { flag } from "../../../web/release-flags";
import { tr } from "../../../i18n/lang";

const t = useTree();
const q = usePhoneQuiz();
const check = useTreeCheck(t.doc, () => !t.needBase.value && !t.goalInline.value);
const { checking, progress } = check;
/**
 * スマホは答えていない道を質問で聞くので、その分 (行き先を決めていない箱・道が残っている間の「完成の箱が無い」) は一覧に出さない
 * (10-26 組みかけの指輪で 4 件中 4 件がこれで、質問と同じ事を赤で繰り返していた)。分かれ目の行の行き先が無いのは質問に無いので出す
 */
const issues = computed(() => (check.issues.value ?? []).filter((x) => !(x.kind === "open" && !t.doc.value.boxes[x.boxId]?.split) && !(x.kind === "noDone" && x.boxId === "start" && q.questions.value.length > 0)));
const MAP = flag("phoneMap");
/** 一覧の重ね窓を開いている */
const listOpen = ref(false);
function open(id: string): void {
  listOpen.value = false;
  if (MAP) { sheet.value = { id, issue: issues.value.filter((x) => x.boxId === id).map((x) => x.text).join(" / ") }; return; }
  const b = t.doc.value.boxes[id];
  q.focus.value = b?.hand ? { kind: "outs", id } : b?.parent ? { kind: "outs", id: b.parent } : { kind: "hand", id };
}
const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") listOpen.value = false; };
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <button v-if="checking || issues.length" type="button" data-phone-issues :disabled="checking && !issues.length" class="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-xl border border-rose-400/40 bg-[#1d0f10] px-3 py-1.5 text-left text-[13px] font-bold text-rose-200" :aria-expanded="listOpen" @click="listOpen = true">
    <span class="min-w-0 flex-1 break-words text-center">{{ checking ? tr(`足りない所を調べている${progress ? ` ${progress.n}/${progress.of}` : ""}`, `Checking${progress ? ` ${progress.n}/${progress.of}` : ""}`) : tr(`足りない所 ${issues.length} 件`, `${issues.length} missing`) }}</span>
    <span v-if="issues.length" class="shrink-0 text-[12px] font-normal text-rose-100/80">{{ tr("見る ▾", "View ▾") }}</span>
  </button>
  <!-- 一覧の重ね窓 (閉じれば元の場所・スクロールのまま) -->
  <div v-if="listOpen && issues.length" data-phone-issues-sheet class="fixed inset-0 z-[60] flex flex-col justify-end bg-black/55" @click.self="listOpen = false">
    <div class="flex max-h-[88vh] flex-col rounded-t-2xl border-t-2 border-rose-400/70 bg-[#15110c] shadow-[0_-10px_30px_rgba(0,0,0,0.8)]">
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-2">
        <div class="mx-auto mb-2 h-1.5 w-11 rounded-full bg-white/25" />
        <p class="text-[14px] font-bold text-rose-200">{{ tr(`足りない所 ${issues.length} 件`, `${issues.length} missing`) }}</p>
        <p class="mb-2 break-words text-[12px] text-[#9a8a70]">{{ tr("直さないと回した人がここで止まる。押すとその箱", "Runs stop here until fixed. Tap to open the box") }}</p>
        <div class="flex flex-col gap-1.5">
          <button v-for="(x, i) in issues" :key="`${x.boxId}-${i}`" type="button" data-phone-issue :data-box-id="x.boxId" class="min-h-11 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-left text-[13px]" @click="open(x.boxId)">
            <b class="block break-words text-rose-100">{{ q.boxTitle(x.boxId) }}</b>
            <span class="block break-words text-[#e8d8c8]">{{ x.text }}</span>
          </button>
        </div>
      </div>
      <div class="flex border-t border-white/10 px-3 py-2">
        <button type="button" data-phone-issues-close class="g-btn !min-h-11 flex-1" @click="listOpen = false">{{ tr("閉じる", "Close") }}</button>
      </div>
    </div>
  </div>
</template>
