<!--
  SimAutoPlay.vue — ⑤ 打ち方の自動の時の要約 (2026-10-20 S3、設計 auto-flow-design の 1 の表)。
  答えは最善手で自動で埋まる (use-sim-auto-order の autoRun)。出す物: 1 行「自動で答えた N 場面 · 目安 約 X · 完成 Y%」+ ? (決まりの文) +
  「答えた一覧 ▼」(閉じて、開くと読むだけ。手動と同じ文 quiz-text) + 「手で直す」(= 手動にする、確かめの窓)。
  決まりは画面に文で (feedback-show-sim-rules)、文字は最低限で ? の中 (feedback-minimal-text-ui)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { craftStage as s } from "../../state/craft-stage";
import { tr } from "../../i18n/lang";
import HelpTip from "../../components/ui/HelpTip.vue";
import { quizFromSim, ROUTE_NAME, type QuizSimIn } from "../../services/simulator/quiz-build";
import { fillModText, tierDisplayRanges } from "../../services/craft-stage/engine";
import { actionText, whenText } from "./quiz-text";
import type { AutoFilled } from "../../services/simulator/auto/auto-order";

const props = defineProps<{
  filled: (AutoFilled & { order: string[]; answers: number }) | null;
  busy: boolean;
  quizBase: QuizSimIn | null;
  money: (x: number) => string;
  pct: (x: number) => string;
}>();
const emit = defineEmits<{ manual: [] }>();
const open = ref(false);
/** 札の名前 (狙いの文 + 段) */
function nameOfMod(modId: string): string {
  const m = s.data.value?.mods.get(modId);
  const t = s.simTargets.value.find((x) => x.modId === modId) ?? s.simTargets.value.flatMap((x) => x.alts ?? []).find((a) => a.modId === modId);
  if (!m) return modId;
  const tier = t ? m.tiers[t.minTierIndex] : undefined;
  return fillModText(m, tier ? tierDisplayRanges(tier) : []).replace(/\n/g, " / ") + (t ? ` T${m.tiers.length - t.minTierIndex}+` : "");
}
const routeName = (id: string): string => { const n = ROUTE_NAME[id]; return n?.[0] ? tr(n[0], n[1]) : ""; };
/** 両側の「どれか」の時は route (付いた側) ごとの目安 (K6。並びは quizFromSim のまま、プレが先) */
const perRoute = computed(() => (props.filled && props.filled.routes.length > 1 ? props.filled.routes.map((r) => `${routeName(r.id)} ${tr("約", "≈")} ${props.money(r.result.perFinish)}`).join(" · ") : ""));
/** 答えの一覧 (開いた時だけ組む)。route ごとに見出し */
const lines = computed(() => {
  if (!open.value || !props.filled || !props.quizBase) return [];
  const routes = quizFromSim(props.quizBase, props.filled.rules).recipe.routes;
  return routes.flatMap((rt) => (props.filled!.rules.rules[rt.id] ?? []).map((r, i) => ({ head: i === 0 && routes.length > 1 ? routeName(rt.id) : "", when: whenText(rt.goal, r.when, nameOfMod), act: actionText(r.do) })));
});
</script>

<template>
  <div data-sim-auto-play class="mb-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[13px]">
    <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <b class="text-[var(--exile-color-text-title)]">{{ tr("自動", "Auto") }}</b>
      <span v-if="busy || !filled" class="text-[var(--exile-color-text-secondary)]">{{ tr("最善手で埋めている…", "Filling with the best moves…") }}</span>
      <template v-else>
        <span data-sim-auto-summary class="tabular-nums">{{ tr(`自動で答えた ${filled.answers} 場面 · 目安 約 ${money(filled.result.perFinish)} · 完成 ${pct(filled.result.finish)}`, `${filled.answers} situations answered · est. ≈ ${money(filled.result.perFinish)} · ${pct(filled.result.finish)} finish`) }}</span>
        <span v-if="perRoute" class="text-[12px] tabular-nums text-[var(--exile-color-text-secondary)]">{{ perRoute }}</span>
        <span v-if="filled.bad" class="text-[12px] text-amber-200" :title="tr('計算の方策がその形で打てなかった数 (0 が正しい)', 'Shapes where the planned move could not be played (should be 0)')">{{ tr(`打てない形 ${filled.bad}`, `${filled.bad} unplayable`) }}</span>
      </template>
      <HelpTip :width="320">
        <ul class="list-disc space-y-1 pl-4">
          <li>{{ tr("④ の 1 位の順番で、各場面の一番安い手 (最善手) を答えにした。付け方 (高貴 / カオス) もその手の多い方", "Each situation is answered with the cheapest move (best move) for the top order in step 4. Methods (Exalted / Chaos) follow the move used most") }}</li>
          <li>{{ tr("目安は計算の値。⑥ で回すと少しずれる (計算は外れの系統を数だけで見る近似)", "The estimate is calculated; running in step 6 differs a little (misses are approximated by count)") }}</li>
          <li>{{ tr("⑥ で答えの無い場面が出たら、同じ最善手で足す。当たらない人はイレギュラー (どの計算にも入れない)", "Situations without an answer in step 6 are filled with the same best moves; people still unmatched are irregular (left out of every number)") }}</li>
        </ul>
      </HelpTip>
      <button type="button" data-sim-auto-manual class="g-btn sm ml-auto max-md:min-h-10" @click="emit('manual')">{{ tr("手で直す", "Edit by hand") }}</button>
    </div>
    <button v-if="filled" type="button" class="g-plain mt-1 text-[12px] text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-text-primary)] max-md:min-h-10" :aria-expanded="open" @click="open = !open">{{ tr("答えた一覧", "Answers") }} {{ open ? "▴" : "▾" }}</button>
    <ol v-if="open" data-sim-auto-list class="mt-1 grid max-h-[50vh] min-w-0 gap-0.5 overflow-auto text-[12px]">
      <li v-for="(l, i) in lines" :key="i" class="min-w-0 break-words"><b v-if="l.head" class="mt-1 block text-[var(--exile-color-text-secondary)]">{{ l.head }}</b><span class="text-[var(--exile-color-text-tertiary)]">{{ l.when }}</span> → <b>{{ l.act }}</b></li>
    </ol>
  </div>
</template>
