<!--
  PhoneIssues.vue — スマホ版の「足りない所」(PC と同じルート精査 = use-tree-check。木を組み替えると少し待って自動で回る)。
  10-26 オーナーの選んだ失敗時の挙動の案 2「スマホにも精査」(前はスマホに無く、打てない・外れを持ったまま戻る・分かれ目の行が無い などが見えなかった)。
  文は省略しない (決まり 10)。行を押すと、その箱の重ね窓 (案 B、スイッチ phoneMap) か、閉じていればその箱の質問へ
-->
<script setup lang="ts">
import { computed } from "vue";
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
function open(id: string): void {
  if (MAP) { sheet.value = { id, issue: issues.value.filter((x) => x.boxId === id).map((x) => x.text).join(" / ") }; return; }
  const b = t.doc.value.boxes[id];
  q.focus.value = b?.hand ? { kind: "outs", id } : b?.parent ? { kind: "outs", id: b.parent } : { kind: "hand", id };
}
</script>

<template>
  <div v-if="checking || issues.length" data-phone-issues class="flex min-w-0 flex-col gap-1 rounded-xl border border-rose-400/40 bg-[#1d0f10] px-3 py-2">
    <p class="text-[12px] font-bold text-rose-200">
      {{ checking ? tr(`足りない所を調べている${progress ? ` ${progress.n}/${progress.of}` : ""}`, `Checking${progress ? ` ${progress.n}/${progress.of}` : ""}`) : tr(`足りない所 ${issues.length} 件 (直さないと回した人がここで止まる)`, `${issues.length} missing (runs stop here until fixed)`) }}
    </p>
    <button v-for="(x, i) in issues" :key="`${x.boxId}-${i}`" type="button" data-phone-issue :data-box-id="x.boxId" class="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-left text-[12px]" @click="open(x.boxId)">
      <b class="block break-words text-rose-100">{{ q.boxTitle(x.boxId) }}</b>
      <span class="block break-words text-[#e8d8c8]">{{ x.text }}</span>
    </button>
  </div>
</template>
