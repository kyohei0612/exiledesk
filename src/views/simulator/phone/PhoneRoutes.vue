<!--
  PhoneRoutes.vue — スマホ版の「全体を見る」= 残りの道 (答えていない質問) と決めた道の一覧 (2026-10-25 オーナーの選んだ案 sim28-phone-quiz-mock の ③)。
  押すとその質問へ (答え直せる)。決めた道は手の箱 (→ 手) と戻り・完成の箱 (↩ / ✓)
-->
<script setup lang="ts">
import { computed } from "vue";
import { backTargetsOf } from "../tree/tree-merge";
import { handLabel, OUT_LOOK } from "../tree/tree-names";
import { usePhoneQuiz, walkOrder, type Question } from "./use-phone-quiz";
import { tr } from "../../../i18n/lang";

const emit = defineEmits<{ pick: [] }>();
const q = usePhoneQuiz();
/** 決めた道 (手・戻り・完成のある箱、始まりから辿った順) */
const decided = computed(() => walkOrder(q.doc.value).map((id) => q.doc.value.boxes[id]!).filter((b) => b.out !== "pass" && (!!b.hand || !!b.back || !!b.done)));
function go(x: Question): void { q.focus.value = x; emit("pick"); }
const what = (id: string): string => {
  const b = q.doc.value.boxes[id]!;
  if (b.hand) return `→ ${handLabel(b.hand)}`;
  if (b.done) return tr("✓ 完成", "✓ Done");
  const to = backTargetsOf(q.doc.value, id)[0];
  return to ? `↩ ${q.boxTitle(to)}${b.autoBack ? tr(" (自動)", " (auto)") : ""}` : "";
};
</script>

<template>
  <div data-phone-route-list class="flex min-w-0 flex-col gap-1.5">
    <p class="text-[12px] font-bold text-amber-200">{{ tr("残りの道", "Open paths") }}</p>
    <p v-if="!q.questions.value.length" class="text-[12px] text-[#9a8a70]">{{ tr("無し", "None") }}</p>
    <button v-for="x in q.questions.value" :key="`${x.kind}-${x.id}`" type="button" data-phone-route-open :data-box-id="x.id" class="rounded-xl border border-amber-300/50 bg-[#1a140d] px-3 py-2 text-left" @click="go(x)">
      <span class="flex items-center gap-2 text-[13px] font-bold" :style="{ color: `rgb(${OUT_LOOK[q.doc.value.boxes[x.id]!.out].c})` }"><span class="min-w-0 flex-1 truncate">{{ q.boxTitle(x.id) }}</span><span class="shrink-0 text-[11px] font-normal text-amber-200/80">{{ x.kind === "hand" ? tr("次の手は?", "Next craft?") : tr("結果は?", "Results?") }}</span></span>
      <span class="block truncate text-[11px] text-[#9a8a70]">{{ q.pathText(x.id) }}</span>
    </button>
    <p class="mt-2 text-[12px] font-bold text-emerald-300">{{ tr("決めた道", "Decided") }}</p>
    <button v-for="b in decided" :key="b.id" type="button" data-phone-route-done :data-box-id="b.id" class="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-left text-[12px]" @click="go(b.hand ? { kind: 'outs', id: b.id } : { kind: 'outs', id: b.parent ?? 'start' })">
      <span class="block truncate text-[#d8ccb4]"><b :style="{ color: `rgb(${OUT_LOOK[b.out].c})` }">{{ q.boxTitle(b.id) }}</b> {{ what(b.id) }}</span>
    </button>
  </div>
</template>
