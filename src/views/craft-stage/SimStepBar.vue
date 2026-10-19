<!--
  SimStepBar.vue — シミュレーターの工程の帯 (2026-10-19 オーナー「各工程ページ別にしたい、欲しい情報だけ簡易的に表示」「初心者でもわかりやすく」、[[sim-step-pages]])。
  ① ベース → ② 狙う MOD → ③ 始め方 → ④ 付ける順番 → ⑤ 打ち方 → ⑥ 回す・結果 を札 (.g-tab) で横に並べる。札の 2 行目は決めた中身の要約。
  今のページは .on、行ける所は押すとそのページ (前の工程は直せる形に開く)、まだ行けない所は押せない。下に「このページでやること」を 1 行。
  スマホは横に送る (今の札が見える所へ)
-->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { SIM_STEPS, type SimStep } from "../../state/web-page";
import { tr } from "../../i18n/lang";

const props = defineProps<{
  current: SimStep;
  /** 行ける一番先の工程 (SIM_STEPS の番号) */
  reach: number;
  /** 札の 2 行目 (決めた中身。空ならまだ) */
  base: string;
  notes: Partial<Record<SimStep, string>>;
}>();
const emit = defineEmits<{ go: [s: SimStep]; base: [] }>();

const TITLE: Record<SimStep, [string, string]> = {
  mods: ["狙う MOD", "Target mods"], start: ["始め方", "How to start"], order: ["付ける順番", "Order"], play: ["打ち方", "Crafting steps"], result: ["回す・結果", "Run & results"],
};
/** このページでやること (初めての人向けの 1 行) */
const LEAD: Record<SimStep, [string, string]> = {
  mods: ["欲しい MOD を下の一覧から選び、付け方 (高貴・カオス・フラクチャーなど) を決める", "Pick the mods you want from the list below and how to add each one"],
  start: ["何から作り始めるか (白・適当なレア・買う) と、ベースの値段を入れる。右の値段が一番安い物に印", "Choose what to start from and enter base prices. The cheapest is marked"],
  order: ["MOD を付ける順番を決める。打ち方はこの順で並ぶ", "Set the order to add mods. The crafting steps follow this order"],
  play: ["まず全部うまくいった時の打ち方、次に外れた時の手を決める", "First the steps when everything lands, then what to do when it misses"],
  result: ["大勢が同じ打ち方で作った時の、1 個あたりの費用と運の幅", "Cost per item and luck spread when many people craft with these steps"],
};
const nav = ref<HTMLElement | null>(null);
// スマホ: 今の札が帯の真ん中に来るまで帯の中だけ横に送る (scrollIntoView はページも縦に動かすので使わない)。幅が変わった時も
function centerOn(): void {
  const n = nav.value, on = n?.querySelector<HTMLElement>(".on");
  if (n && on) n.scrollLeft = on.offsetLeft - (n.clientWidth - on.offsetWidth) / 2; // nav は relative なので offsetLeft は帯の中の位置
}
watch(() => props.current, () => void nextTick(centerOn));
onMounted(() => { centerOn(); window.addEventListener("resize", centerOn); });
onBeforeUnmount(() => window.removeEventListener("resize", centerOn));
</script>

<template>
  <div data-sim-step-bar>
    <nav ref="nav" class="relative flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
      <button type="button" class="g-tab shrink-0 !h-auto !min-w-[8.5rem] !flex-col !items-start !gap-0.5 !px-5 !py-1.5 max-md:!min-w-[7rem] max-md:!px-3" :title="tr('ベースを選び直す', 'Choose another base')" @click="emit('base')">
        <span class="text-[14px] leading-tight">1 {{ tr("ベース", "Base") }} <span class="text-emerald-300">✓</span></span>
        <span class="max-w-[11rem] truncate text-[11px] leading-tight opacity-85">{{ base }}</span>
      </button>
      <button
        v-for="(st, i) in SIM_STEPS" :key="st" type="button" :data-sim-step="st"
        class="g-tab shrink-0 !h-auto !min-w-[8.5rem] !flex-col !items-start !gap-0.5 !px-5 !py-1.5 max-md:!min-w-[7rem] max-md:!px-3" :class="st === current ? 'on' : ''"
        :disabled="i > reach" :aria-current="st === current ? 'step' : undefined"
        :title="i > reach ? tr('前の工程を決めると進める', 'Finish the earlier steps first') : st === current ? '' : tr('このページへ (直せる)', 'Go to this page (you can edit it)')"
        @click="emit('go', st)"
      >
        <span class="text-[14px] leading-tight">{{ i + 2 }} {{ tr(TITLE[st][0], TITLE[st][1]) }}<span v-if="i < reach && st !== current" class="ml-1 text-emerald-300">✓</span></span>
        <span class="max-w-[11rem] truncate text-[11px] leading-tight opacity-85">{{ notes[st] || (i > reach ? tr("まだ", "Not yet") : st === current ? tr("今ここ", "You are here") : "") }}</span>
      </button>
    </nav>
    <p class="mt-1.5 text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr(LEAD[current][0], LEAD[current][1]) }}</p>
  </div>
</template>
