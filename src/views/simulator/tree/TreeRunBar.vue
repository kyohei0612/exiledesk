<!--
  TreeRunBar.vue — 帯の「100 人回す」と、回した結果のまとめ (完成率・1 個あたり・止まり) と、結果の層を出す / 隠す (2026-10-22 オーナー「回すボタンもやろ？」)。
  回す状態は use-tree-run.ts、木の上の層は TreeRunLayer.vue
-->
<script setup lang="ts">
import type { TreeRunResult } from "../../../services/simulator/tree/tree-run";
import { tr } from "../../../i18n/lang";
import { RUN_N } from "./use-tree-run";

defineProps<{ result: TreeRunResult | null; running: boolean; ready: boolean; stuck: [string, number][] }>();
const shown = defineModel<boolean>("shown", { required: true });
const emit = defineEmits<{ run: []; go: [id: string] }>();
const pct = (r: TreeRunResult): string => `${Math.round((r.finished / (r.n || 1)) * 100)}`;
const div = (x: number): string => (Number.isFinite(x) ? (x >= 100 ? x.toFixed(0) : x.toFixed(1)) : "—");
</script>

<template>
  <button type="button" data-tree-run class="g-btn sm" :disabled="running || !ready" :title="tr(`${RUN_N} 人をエンジンで回し、通った道と人数を木の上に重ねて出す (値段は始まりの箱の値段と今の相場)`, `Play ${RUN_N} runs with the engine and overlay the paths taken (prices: start box + current market)`)" @click="emit('run')">{{ tr(`${RUN_N} 人回す`, `Run ${RUN_N}`) }}</button>
  <span data-tree-run-sum class="tabular-nums" :class="result && !running ? '' : 'opacity-70'">
    <template v-if="result">{{ tr(`${result.n} 人回した時: 1 個あたり ${div(result.perItem)} 神 · 完成 ${pct(result)}%`, `${result.n} runs: ${div(result.perItem)} div per item · ${pct(result)}% done`) }}</template>
    <template v-else>{{ tr(`${RUN_N} 人回した時: 1 個あたり — 神 · 完成 —%`, `${RUN_N} runs: — div per item · —% done`) }}</template>
  </span>
  <button v-for="[id, n] in running ? [] : stuck.slice(0, 1)" :key="id" type="button" data-tree-run-stuck-sum class="rounded-full bg-rose-700/90 px-2 text-[12px] font-bold text-white hover:bg-rose-600" :title="tr('止まった箱へ寄る', 'Go to the stuck box')" @click="emit('go', id)">{{ tr(`止まり ${result?.stuck ?? n} 人`, `${result?.stuck ?? n} stuck`) }}</button>
  <span v-if="result && !running && result.capped" class="rounded-full bg-rose-900/80 px-2 text-[12px] text-rose-100">{{ tr(`打ち止め ${result.capped} 人`, `${result.capped} capped`) }}</span>
  <button v-if="result && !running" type="button" data-tree-run-toggle class="g-btn sm" :aria-pressed="shown" @click="shown = !shown">{{ shown ? tr("結果を隠す", "Hide results") : tr("結果を出す", "Show results") }}</button>
</template>
