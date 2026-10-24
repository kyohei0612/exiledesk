<!--
  TreeRunBar.vue — 帯の「100 人回す」と、回した結果のまとめ (完成率・1 個あたり・止まり) と、結果の層を出す / 隠す (2026-10-22 オーナー「回すボタンもやろ？」)。
  回す状態は use-tree-run.ts、木の上の層は TreeRunLayer.vue、回し終えた後のまとめは TreeRunReport.vue (木の枠へ Teleport)。回すとまず 1 人目が木を進む (その間は「1 人目 n/m 手」と「飛ばす」)
-->
<script setup lang="ts">
import { watch } from "vue";
import TreeRunReport from "./TreeRunReport.vue";
import type { TreeRunResult } from "../../../services/simulator/tree/tree-run";
import { tr } from "../../../i18n/lang";
import { RUN_N } from "./use-tree-run";

/** halted = 止まった人が出て途中で止めた (何人目)。walk = 1 人目が進んでいる所 */
/** test = テストラン (use-tree-check: 回している・今の道で合格・見つけた穴の数)。合格するまで「100 人回す」は押せない (10-24 オーナー) */
const props = defineProps<{ result: TreeRunResult | null; running: boolean; ready: boolean; test: { busy: boolean; passed: boolean; holes: number }; stuck: [string, number][]; halted?: { box: string; n: number } | null; walk?: { step: number; total: number; cost: number } | null }>();
const shown = defineModel<boolean>("shown", { required: true });
const emit = defineEmits<{ run: []; go: [id: string]; skip: []; test: []; holes: [] }>();
const pct = (r: TreeRunResult): string => `${Math.round((r.finished / (r.n || 1)) * 100)}`;
/** 回し終えた後の結果のまとめ (TreeRunReport)。回し終えたら開き、止まって止めた時は開かない。帯の「結果のまとめ」・流れの帯の 4 でまた開く (開閉は置き場が持つ) */
const report = defineModel<boolean>("report", { required: true });
watch(() => props.running, (on, was) => { if (was && !on && props.result && !props.halted) report.value = true; if (on) report.value = false; });
const div = (x: number): string => (Number.isFinite(x) ? (x >= 100 ? x.toFixed(0) : x.toFixed(1)) : "—");
</script>

<template>
  <!-- テストで回す (木を変えるたびに自動でも回る) → 合格 / 穴 n → 100 人回す。テストの中身はルート精査 (5 人を辿り 30 人を回して穴を探す、費用は出さない) -->
  <button type="button" data-tree-test class="g-btn sm shrink-0" :disabled="test.busy || running" :title="tr('テストで回す: 5 人をエンジンで辿り 30 人を回して、止まる所・打てない手・付かない当たり・完成に着かない道を探す (費用は出さない)。木を変えるたびに自動でも回る', 'Test run: walk 5 runs and play 30 runs with the engine to find dead ends, unusable crafts, unreachable hits and paths that never finish (no costs). Also runs by itself after each change')" @click="emit('test')">{{ test.busy ? tr("テスト中…", "Testing…") : tr("テストで回す", "Test run") }}</button>
  <span v-if="test.passed && !test.busy" data-tree-test-ok class="shrink-0 whitespace-nowrap rounded-full bg-emerald-700/80 px-2 text-[12px] font-bold text-white">{{ tr("✓ 合格", "✓ Passed") }}</span>
  <button v-else-if="test.holes && !test.busy" type="button" data-tree-test-holes class="shrink-0 whitespace-nowrap rounded-full bg-rose-700/90 px-2 text-[12px] font-bold text-white hover:bg-rose-600" :title="tr('見つけた穴の一覧を開く (直すと次のテストで消える)', 'Open the list of problems (fix them and they clear on the next test)')" @click="emit('holes')">{{ tr(`穴 ${test.holes}`, `${test.holes} issue(s)`) }}</button>
  <button type="button" data-tree-run class="g-btn sm shrink-0" :disabled="running || !ready" :class="test.passed ? '' : 'opacity-60'" :title="test.passed ? tr(`${RUN_N} 人をエンジンで回し、通った道と人数を木の上に重ねて出す (値段は結果のまとめで入れたベースの値段と今の相場)`, `Run ${RUN_N} times with the engine and overlay the paths taken (prices: the base price from the summary + current market)`) : tr('テストランに合格してから回せる。押すと穴の一覧を開く', 'Pass the test run first. Click to open the list of issues')" @click="test.passed ? emit('run') : emit('holes')">{{ tr(`${RUN_N} 人回す`, `Run ${RUN_N}`) }}</button>
  <!-- 一番大事な数字なので切らない (縮めるのはレシピの名前、10-22 金の指輪の録画で完成 % が … で切れた) -->
  <span data-tree-run-sum class="shrink-0 whitespace-nowrap tabular-nums" :class="result && !running ? '' : 'opacity-70'">
    <template v-if="walk">{{ tr(`1 人目が進んでいる ${walk.step}/${walk.total} 箱 · ${div(walk.cost)} 神`, `Run 1 walking ${walk.step}/${walk.total} boxes · ${div(walk.cost)} div`) }}</template>
    <template v-else-if="result && halted && halted.n === 1">{{ tr("1 人目が止まったので止めた (止まった箱を直して回し直す)", "Run 1 got stuck, stopped (fix the box and run again)") }}</template>
    <template v-else-if="result && halted">{{ tr(`${halted.n} 人目で止まったので止めた (止まった箱を直して回し直す)`, `Stopped at run ${halted.n}: a run got stuck (fix the box and run again)`) }}</template>
    <template v-else-if="result">{{ tr(`${result.n} 人: 1 個 ${div(result.perItem)} 神 · 完成 ${pct(result)}%`, `${result.n} runs: ${div(result.perItem)} div/item · ${pct(result)}% done`) }}</template>
    <template v-else>{{ tr(`${RUN_N} 人: 1 個 — 神 · 完成 —%`, `${RUN_N} runs: — div/item · —% done`) }}</template>
  </span>
  <button v-if="walk" type="button" data-tree-run-skip class="g-btn sm shrink-0" :title="tr('1 人目を見ずに残りを回す', 'Skip run 1 and play the rest')" @click="emit('skip')">{{ tr("飛ばす", "Skip") }}</button>
  <button v-for="[id, n] in running ? [] : stuck.slice(0, 1)" :key="id" type="button" data-tree-run-stuck-sum class="shrink-0 rounded-full bg-rose-700/90 px-2 text-[12px] font-bold text-white hover:bg-rose-600" :title="tr('止まった箱へ寄る', 'Go to the stuck box')" @click="emit('go', id)">{{ tr(`止まり ${result?.stuck ?? n} 人`, `${result?.stuck ?? n} stuck`) }}</button>
  <span v-if="result && !running && result.capped" class="shrink-0 rounded-full bg-rose-900/80 px-2 text-[12px] text-rose-100">{{ tr(`打ち止め ${result.capped} 人`, `${result.capped} capped`) }}</span>
  <button v-if="result && !running && !halted" type="button" data-tree-run-report-open class="g-btn sm shrink-0" :aria-pressed="report" @click="report = !report">{{ tr("結果のまとめ", "Summary") }}</button>
  <Teleport defer to="[data-tree-frame]"><TreeRunReport v-if="report && result && !running" :result="result" @close="report = false" @go="(id) => emit('go', id)" /></Teleport>
  <button v-if="result && !running" type="button" data-tree-run-toggle class="g-btn sm shrink-0" :aria-pressed="shown" @click="shown = !shown">{{ shown ? tr("結果を隠す", "Hide results") : tr("結果を出す", "Show results") }}</button>
</template>
