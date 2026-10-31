<!--
  TreeRunSum.vue — 100 人回した結果のまとまり (結果の文・早送り・飛ばす・止まり・打ち止め・結果のまとめ・結果を出す / 隠す)。TreeRunBar から分けた (10-26 夜):
  上の帯の 1 行に置く (オーナー「1 行で表示させてくれ」)。PC の形 (1280 以上、U-53) だけなので置き場は 1 つ (前は 1100px 未満で木の下の右の列にも出していた)
-->
<script setup lang="ts">
import type { TreeRunResult } from "../../../services/simulator/tree/tree-run";
import { tr } from "../../../i18n/lang";
import { driveSum } from "./hole-check";
import { RUN_N } from "./use-tree-run";

/** halted = 止まった人が出て途中で止めた (何人目)。walk = 1 人目が進んでいる所 */
defineProps<{ result: TreeRunResult | null; running: boolean; stuck: [string, number][]; halted?: { box: string; n: number } | null; walk?: { step: number; total: number; cost: number; fast: boolean } | null; /** 穴チェックの走行の結果 (費用を出さず人数だけ) */ test?: boolean; /** 手だけ替える前の結果 (S-57c) */ before?: TreeRunResult | null }>();
const shown = defineModel<boolean>("shown", { required: true });
const report = defineModel<boolean>("report", { required: true });
const emit = defineEmits<{ go: [id: string]; skip: [] }>();
const pct = (r: TreeRunResult): string => `${Math.round((r.finished / (r.n || 1)) * 100)}`;
/** 打ち止めの人が一番回っていた箱 */
const loopTop = (r: TreeRunResult): string | null => Object.entries(r.loopAt ?? {}).sort((a, z) => z[1] - a[1])[0]?.[0] ?? null;
const div = (x: number): string => (Number.isFinite(x) ? (x >= 100 ? x.toFixed(0) : x.toFixed(1)) : "—");
/** 帯の中の小さなボタン (ゲームの絵の枠は 1 つ 58px あり 1 行に入らなかった) */
const MINI = "shrink-0 whitespace-nowrap rounded-md border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[12px] text-sim-body hover:bg-white/10 hover:text-white aria-pressed:border-amber-400/60 aria-pressed:text-amber-100";
</script>

<template>
  <span class="flex min-w-0 items-center gap-1.5">
    <!-- 一番大事な数字なので切らない (縮めるのはレシピの名前、10-22 金の指輪の録画で完成 % が … で切れた) -->
    <span data-tree-run-sum class="shrink-0 whitespace-nowrap tabular-nums" :class="result && !running ? '' : 'opacity-70'">
      <template v-if="walk">{{ tr(`1 人目が進んでいる ${walk.step}/${walk.total} 箱 · ${div(walk.cost)} 神`, `Run 1 walking ${walk.step}/${walk.total} boxes · ${div(walk.cost)} div`) }}</template>
      <template v-else-if="result && halted && halted.n === 1">{{ tr("1 人目が止まったので止めた (止まった箱を直して回し直す)", "Run 1 got stuck, stopped (fix the box and run again)") }}</template>
      <template v-else-if="result && halted">{{ tr(`${halted.n} 人目で止まったので止めた (止まった箱を直して回し直す)`, `Stopped at run ${halted.n}: a run got stuck (fix the box and run again)`) }}</template>
      <template v-else-if="result && test">{{ driveSum(result.n, result.finished) }}</template>
      <!-- 手だけ替えた後は替える前と今を並べる (S-57c。回す前は今が —) -->
      <span v-else-if="before && (!result || !running)" data-tree-run-compare>{{ tr(`替える前 1 個 ${div(before.perItem)} 神 · 完成 ${pct(before)}% → 今 ${result ? `1 個 ${div(result.perItem)} 神 · 完成 ${pct(result)}%` : "—"}`, `Before ${div(before.perItem)} div/item · ${pct(before)}% done → Now ${result ? `${div(result.perItem)} div/item · ${pct(result)}% done` : "—"}`) }}</span>
      <template v-else-if="result">{{ tr(`${result.n} 人: 1 個 ${div(result.perItem)} 神 · 完成 ${pct(result)}%`, `${result.n} runs: ${div(result.perItem)} div/item · ${pct(result)}% done`) }}</template>
      <template v-else>{{ tr(`${RUN_N} 人: 1 個 — 神 · 完成 —%`, `${RUN_N} runs: — div/item · —% done`) }}</template>
    </span>
    <!-- 同じ所に 3 秒とどまって早送りしている間だけ見える (場所は取ったまま、帯が揺れないように) -->
    <span v-if="walk" :data-tree-run-fast="walk.fast ? '' : undefined" class="shrink-0 rounded bg-amber-400/20 px-1.5 text-[11px] font-bold text-amber-200" :class="walk.fast ? '' : 'invisible'" :title="tr('同じ所に 3 秒とどまったので、抜けるまで早送り', 'Stayed in one place for 3 s, fast-forwarding until it moves on')">{{ tr("▶▶ 早送り", "▶▶ Fast") }}</span>
    <button v-if="walk" type="button" data-tree-run-skip :class="MINI" :title="tr('1 人目を見ずに残りを回す', 'Skip run 1 and play the rest')" @click="emit('skip')">{{ tr("飛ばす", "Skip") }}</button>
    <button v-for="[id, n] in running ? [] : stuck.slice(0, 1)" :key="id" type="button" data-tree-run-stuck-sum class="shrink-0 whitespace-nowrap rounded-full bg-rose-700/90 px-2 text-[12px] font-bold text-white hover:bg-rose-600" :title="tr('止まった箱へ寄る', 'Go to the stuck box')" @click="emit('go', id)">{{ tr(`止まり ${result?.stuck ?? n} 人`, `${result?.stuck ?? n} stuck`) }}</button>
    <!-- 打ち止め = 手の上限まで輪から出られなかった人。押すとその人たちが一番回っていた箱へ (loopAt、10-27 穴チェックの走行) -->
    <button v-if="result && !running && result.capped" type="button" data-tree-run-loop class="shrink-0 whitespace-nowrap rounded-full bg-rose-900/80 px-2 text-[12px] text-rose-100 hover:bg-rose-800" :title="tr('輪から出られなかった人が一番回っていた箱へ寄る', 'Go to the box where capped runs looped most')" @click="loopTop(result) && emit('go', loopTop(result)!)">{{ test ? tr(`ループ ${result.capped} 人`, `${result.capped} looping`) : tr(`打ち止め ${result.capped} 人`, `${result.capped} capped`) }}</button>
    <button v-if="result && !running && !halted" type="button" data-tree-run-report-open :class="MINI" :aria-pressed="report" @click="report = !report">{{ tr("結果のまとめ", "Summary") }}</button>
    <button v-if="result && !running" type="button" data-tree-run-toggle :class="MINI" :aria-pressed="shown" @click="shown = !shown">{{ shown ? tr("結果を隠す", "Hide results") : tr("結果を出す", "Show results") }}</button>
  </span>
</template>
