<!--
  TreeRunBar.vue — 帯の「穴チェック」(S-70)「足りない所 n ▾」「100 人回す」(2026-10-22 オーナー「回すボタンもやろ？」)。回した結果のまとまりは TreeRunSum.vue (10-26 夜に分けた)。
  回す状態は use-tree-run.ts、木の上の層は TreeRunLayer.vue、回し終えた後のまとめは TreeRunReport.vue (木の枠へ Teleport)。回すとまず 1 人目が木を進む。
  帯の幅が狭い時は字を短く (帯の @container、オーナー 10-26 夜「1 行で表示させてくれ」。切らない・… にしない)
-->
<script setup lang="ts">
import { computed, watch } from "vue";
import TreeRunReport from "./TreeRunReport.vue";
import type { TreeRunResult } from "../../../services/simulator/tree/tree-run";
import { tr } from "../../../i18n/lang";
import { RUN_N } from "./use-tree-run";
import { simOp } from "../../../web/track";
import { finalLockedWhy, finalName, finalTitle, holeBusy, holeName, holesCount, holesShowTitle, holeTitle, runLockedWhy } from "./hole-check";

/** test = 穴チェック (use-tree-check: 回している・今の道で合格・見つけた穴の数)。合格するまで「100 人回す」は灰色で押せない (S-70)。halted = 止まった人が出て途中で止めた */
const props = defineProps<{ /** ハズレ整理のボタンの状態 (S-192) */ tidy?: { on: boolean; step: string; unset: number; guide: boolean; busy: boolean; empty?: boolean; finalLit: boolean }; result: TreeRunResult | null; running: boolean; ready: boolean; test: { busy: boolean; passed: boolean; holes: number; /** 穴を見せている (札が押された状態) */ shown: boolean }; halted?: { box: string; n: number } | null; /** 今の結果が穴チェックの走行 (use-tree-run の test) */ drive?: boolean }>();
const emit = defineEmits<{ run: []; go: [id: string]; test: []; holes: []; holesOn: []; /** 穴の一覧の窓を開く (札の横の ▾) */ list: []; /** ハズレ整理 (S-192) */ tidy: []; /** 完成の後の案内から組む所へ戻る (S-198) */ tidyBack: [] }>();
/** 穴チェックに合格していないので「100 人回す」を止める (回している間は別の理由) */
const locked = computed(() => !props.test.passed);
/** 回し終えた後の結果のまとめ (TreeRunReport)。回し終えたら開き、止まって止めた時は開かない。TreeRunSum の「結果のまとめ」・流れの帯の 4 でまた開く (開閉は置き場が持つ) */
const report = defineModel<boolean>("report", { required: true });
watch(() => props.running, (on, was) => {
  if (was && !on && props.result) simOp("run-result", `${Math.round((props.result.finished / (props.result.n || 1)) * 100)}%`); // シミュの操作の流れ (web/sim-trail)
  // 止まる人が残る最終チェックは結果の窓を開かず、光る箱で見せる (S-190)
  if (was && !on && props.result && !props.halted && !(props.tidy?.on && props.drive && props.test.holes)) report.value = true; // 穴チェックの走行も回し終えたら開く (止まった箱・ループの一覧) if (on) report.value = false;
});
</script>

<template>
  <!-- 穴チェック (木を変えるたびに必ず自動で回る、S-70) → 合格 / 穴 n → 100 人回す。中身はルート精査 (5 人を辿り 30 人を回して穴を探す、費用は出さない) -->
  <!-- 未設定の間の灰色の「未設定 n つ」は出さない (赤い「未設定 n つ ▾」と同じ数が 2 つ並んでいた。11-11 オーナー「おすすめ」= 上の行を 1 行にする案 A) -->
  <button v-if="tidy && tidy.step !== 'check' && tidy.step !== 'unset'" type="button" data-tree-tidy :data-step="tidy.step" class="g-btn sm shrink-0 whitespace-nowrap" :class="tidy.guide && tidy.step === 'tidy' ? 'ring-2 ring-amber-300 shadow-[0_0_16px_rgba(252,211,77,0.75)]' : ''" :disabled="tidy.busy || running || tidy.empty || tidy.step === 'unset'" :title="tidy.empty ? tr('手を足すと押せる', 'Add a craft first') : tidy.step === 'unset' ? tr('光る箱を決めると最終チェックへ進める', 'Decide the lit boxes to reach the final check') : tr('同じ枠へ自動でつなぎ、残りを未設定として洗い出す', 'Link outcomes to matching boxes and list what is left')" @click="emit('tidy')">{{ tidy.busy ? tr("整理中", "Sorting") : tidy.step === "unset" ? holesCount(tidy.unset) : tr("ハズレ整理", "Sort misses") }}</button>
  <button v-if="tidy?.guide" type="button" data-tree-tidy-back class="g-btn sm shrink-0 whitespace-nowrap" :title="tr('案内を閉じて手を足せる形に戻す (決めた所はそのまま)', 'Leave the guide and go back to building (your choices stay)')" @click="emit('tidyBack')">{{ tr("組むに戻る", "Back to building") }}</button>
  <button v-if="!tidy || tidy.step === 'check'" type="button" data-tree-test class="g-btn sm shrink-0 whitespace-nowrap" :class="tidy?.finalLit ? 'ring-2 ring-amber-300 shadow-[0_0_16px_rgba(252,211,77,0.75)]' : ''" :disabled="test.busy || running" :title="tidy?.on ? finalTitle() : holeTitle()" @click="emit('test')">
    <template v-if="tidy?.busy">{{ tr("整理中", "Sorting") }}</template>
    <template v-else-if="test.busy">{{ holeBusy() }}</template>
    <template v-else-if="tidy?.on">{{ finalName() }}</template>
    <template v-else>{{ holeName() }}</template>
  </button>
  <span v-if="test.passed && !test.busy" data-tree-test-ok class="shrink-0 whitespace-nowrap rounded-full bg-emerald-700/80 px-2 text-[12px] font-bold text-white">{{ tr("✓ 合格", "✓ Passed") }}</span>
  <!-- 未設定の札 = 一覧の窓の開け閉めだけ (11-08 オーナー「押したら未設定マーク消えるけどツリーの その挙動削除して未設定一覧ってので矢印の挙動に変えてくれ」「未設定もっかい押したら閉じるで」)。
       箱の ! は消さない (前の 10-25 の「押すとオフ」は撤回)。shown = 一覧を開いている -->
  <button v-else-if="test.holes && !test.busy" type="button" data-tree-test-holes data-tree-test-list :aria-expanded="test.shown" class="shrink-0 whitespace-nowrap rounded-full border border-rose-400 bg-rose-700/90 px-2 text-[12px] font-bold text-white transition-colors hover:bg-rose-600" :class="test.shown ? 'shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)]' : ''" :title="test.shown ? tr('未設定の一覧を閉じる', 'Close the list of unset boxes') : holesShowTitle()" @click="emit('list')">{{ holesCount(test.holes) }} {{ test.shown ? "▴" : "▾" }}</button>
  <button type="button" data-tree-run class="g-btn sm shrink-0 whitespace-nowrap" :disabled="running || !ready || locked" :data-run-locked="locked && !running ? '' : undefined" :title="locked && !running ? (tidy?.on ? finalLockedWhy() : runLockedWhy(test.busy, test.holes)) : test.passed ? tr(`${RUN_N} 人をエンジンで回し、通った道と人数を木の上に重ねて出す (値段は結果のまとめで入れたベースの値段と今の相場)`, `Run ${RUN_N} times with the engine and overlay the paths taken (prices: the base price from the summary + current market)`) : tr('未設定を直すと回せる。押すと一覧を開く', 'Fix what is unset to run. Click to open the list')" @click="test.passed ? emit('run') : emit('holesOn')">{{ tr(`${RUN_N} 人回す`, `Run ${RUN_N}`) }}</button>
  <Teleport defer to="[data-tree-frame]"><TreeRunReport v-if="report && result && !running" :result="result" :test="drive" @close="report = false" @go="(id) => emit('go', id)" /></Teleport>
</template>
