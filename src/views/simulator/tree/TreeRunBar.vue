<!--
  TreeRunBar.vue — 帯の「テストで回す」「足りない所 n ▾」「100 人回す」(2026-10-22 オーナー「回すボタンもやろ？」)。回した結果のまとまりは TreeRunSum.vue (10-26 夜に分けた)。
  回す状態は use-tree-run.ts、木の上の層は TreeRunLayer.vue、回し終えた後のまとめは TreeRunReport.vue (木の枠へ Teleport)。回すとまず 1 人目が木を進む。
  帯の幅が狭い時は字を短く (帯の @container、オーナー 10-26 夜「1 行で表示させてくれ」。切らない・… にしない)
-->
<script setup lang="ts">
import { watch } from "vue";
import TreeRunReport from "./TreeRunReport.vue";
import type { TreeRunResult } from "../../../services/simulator/tree/tree-run";
import { tr } from "../../../i18n/lang";
import { RUN_N } from "./use-tree-run";
import { simOp } from "../../../web/track";

/** test = テストラン (use-tree-check: 回している・今の道で合格・見つけた穴の数)。合格するまで「100 人回す」は押せない (10-24 オーナー)。halted = 止まった人が出て途中で止めた */
const props = defineProps<{ result: TreeRunResult | null; running: boolean; ready: boolean; test: { busy: boolean; passed: boolean; holes: number; /** 穴を見せている (札が押された状態) */ shown: boolean }; halted?: { box: string; n: number } | null }>();
const emit = defineEmits<{ run: []; go: [id: string]; test: []; holes: []; holesOn: []; /** 穴の一覧の窓を開く (札の横の ▾) */ list: [] }>();
/** 回し終えた後の結果のまとめ (TreeRunReport)。回し終えたら開き、止まって止めた時は開かない。TreeRunSum の「結果のまとめ」・流れの帯の 4 でまた開く (開閉は置き場が持つ) */
const report = defineModel<boolean>("report", { required: true });
watch(() => props.running, (on, was) => {
  if (was && !on && props.result) simOp("run-result", `${Math.round((props.result.finished / (props.result.n || 1)) * 100)}%`); // シミュの操作の流れ (web/sim-trail)
  if (was && !on && props.result && !props.halted) report.value = true; if (on) report.value = false;
});
</script>

<template>
  <!-- テストで回す (木を変えるたびに自動でも回る) → 合格 / 穴 n → 100 人回す。テストの中身はルート精査 (5 人を辿り 30 人を回して穴を探す、費用は出さない) -->
  <button type="button" data-tree-test class="g-btn sm shrink-0 whitespace-nowrap" :disabled="test.busy || running" :title="tr('テストで回す: 5 人をエンジンで辿り 30 人を回して、止まる所・打てない手・付かない当たり・完成に着かない道を探す (費用は出さない)。木を変えるたびに自動でも回る', 'Test run: walk 5 runs and play 30 runs with the engine to find dead ends, unusable crafts, unreachable hits and paths that never finish (no costs). Also runs by itself after each change')" @click="emit('test')">
    <template v-if="test.busy">{{ tr("テスト中…", "Testing…") }}</template>
    <template v-else><span class="@max-[899px]:hidden">{{ tr("テストで回す", "Test run") }}</span><span class="hidden @max-[899px]:inline">{{ tr("テスト", "Test") }}</span></template>
  </button>
  <span v-if="test.passed && !test.busy" data-tree-test-ok class="shrink-0 whitespace-nowrap rounded-full bg-emerald-700/80 px-2 text-[12px] font-bold text-white">{{ tr("✓ 合格", "✓ Passed") }}</span>
  <!-- 穴の札はスイッチ (10-25 オーナー「クリックでオンオフ」): 既定はオン (赤い札・箱の !・一覧)、押すとオフで数だけ灰色、もう一度でオン。オフは組み替えてもそのまま (10-25 オーナー「デフォで赤、押したらオフ」) -->
  <button v-else-if="test.holes && !test.busy" type="button" data-tree-test-holes :aria-pressed="test.shown" class="shrink-0 whitespace-nowrap rounded-full border px-2 text-[12px] transition-colors" :class="test.shown ? 'border-rose-400 bg-rose-700/90 font-bold text-white shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)]' : 'border-white/15 bg-white/[0.04] text-white/55 hover:text-white/80'" :title="test.shown ? tr('足りない所の表示を消す (箱の ! と一覧)', 'Hide what is missing (box marks and list)') : tr('足りない所を見る (箱の ! と一覧を出す、直すと次のテストで消える)', 'Show what is missing (box marks and list; they clear on the next test once fixed)')" @click="emit('holes')"><span class="@max-[759px]:hidden">{{ tr(`足りない所 ${test.holes}`, `${test.holes} missing`) }}</span><span class="hidden @max-[759px]:inline">! {{ test.holes }}</span></button>
  <button v-if="test.holes && !test.busy" type="button" data-tree-test-list class="-ml-1 shrink-0 rounded px-1 text-[12px] text-white/50 hover:bg-white/10 hover:text-white/85" :title="tr('足りない所の一覧を開く', 'Open the list of what is missing')" @click="emit('list')">▾</button>
  <button type="button" data-tree-run class="g-btn sm shrink-0 whitespace-nowrap" :disabled="running || !ready" :class="test.passed ? '' : 'opacity-60'" :title="test.passed ? tr(`${RUN_N} 人をエンジンで回し、通った道と人数を木の上に重ねて出す (値段は結果のまとめで入れたベースの値段と今の相場)`, `Run ${RUN_N} times with the engine and overlay the paths taken (prices: the base price from the summary + current market)`) : tr('足りない所を直すと回せる。押すと一覧を開く', 'Fix what is missing to run. Click to open the list')" @click="test.passed ? emit('run') : emit('holesOn')"><span class="@max-[899px]:hidden">{{ tr(`${RUN_N} 人回す`, `Run ${RUN_N}`) }}</span><span class="hidden @max-[899px]:inline">{{ tr(`${RUN_N} 人`, `${RUN_N}×`) }}</span></button>
  <Teleport defer to="[data-tree-frame]"><TreeRunReport v-if="report && result && !running" :result="result" @close="report = false" @go="(id) => emit('go', id)" /></Teleport>
</template>
