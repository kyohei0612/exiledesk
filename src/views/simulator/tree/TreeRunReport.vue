<!--
  TreeRunReport.vue — 「100 人回す」を回し終えた後の結果のまとめ (2026-10-22 オーナー「回した後の結果レポート的なオーバーレイの実装は?」)。
  木の枠の上に重ねる (組む画面とは別の層、箱の人数の表示は残す)。中身: 1 個の平均・完成率・費用の幅 (安い 10%・中央・高い 10%)・
  止まり / 打ち止めの人数と箱・一番お金を使った箱 (上位 3)・カレンシー別の 1 人あたりの数と神。箱を押すとその箱へ寄る。
  値段は回した時と同じ (今の相場、高貴建て → 神、use-tree-run.ts)。出すのは TreeRunBar (帯) から木の枠へ Teleport。
  10-22 オーナー「どの始め方が安いかは結果のまとめで」: 一番上にこのタブの始め方のベースの値段 (取引所で探す・手で入れる) と、回したタブどうしの比べ
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import NumStep from "../../../components/NumStep.vue";
import { startOf, startRarity, startsFractured } from "../../../services/simulator/tree/tree-model";
import { useTreeSearch, type TreeSearchKind } from "./use-tree-search";
import type { TreeRunResult } from "../../../services/simulator/tree/tree-run";
import { useTree } from "./use-tree";
import { handLabel, handName, outName, startName } from "./tree-names";
import { tr } from "../../../i18n/lang";

const props = defineProps<{ result: TreeRunResult }>();
const emit = defineEmits<{ close: []; go: [id: string] }>();
const t = useTree();

const div = (x: number): string => (!Number.isFinite(x) ? "—" : x >= 100 ? x.toFixed(0) : x.toFixed(1));
const pct = computed(() => Math.round((props.result.finished / (props.result.n || 1)) * 100));
/** 1 個 (高貴建ての値段 → 神、回した時と同じ) */
const price = (k: string): number => t.treePrice(k) / (t.treePrice("divine") || 1);
/** 箱の名前 (打つ手の名前、無ければ結果の名前) */
const boxName = (id: string): string => { const b = t.doc.value.boxes[id]; return !b ? id : b.hand ? handLabel(b.hand) : id === "start" ? tr("始まり", "Start") : outName(b.out); };
/** カレンシー別 (1 人あたりの数・神、神の多い順) */
const uses = computed(() => Object.entries(props.result.uses).map(([k, n]) => ({ k, name: handName(k), n, div: n * price(k) })).sort((a, z) => z.div - a.div || z.n - a.n));
const SHOW = 8;
const rest = computed(() => uses.value.slice(SHOW).reduce((a, u) => a + u.div, 0));
/** 一番お金を使った箱 (1 人あたり、上位 3) */
const spend = computed(() => Object.entries(props.result.boxes).filter(([, b]) => b.spend > 0.005).sort((a, z) => z[1].spend - a[1].spend).slice(0, 3));
const stuck = computed(() => Object.entries(props.result.stuckAt).sort((a, z) => z[1] - a[1]));
/** 回した時の始めの値段 (後で値段を替えたら「回し直す」の一言。タブどうしの比べは 10-24 にやめた、タブは別々の木) */
const ranPrice = ref(t.startPrice());
watch(() => props.result, () => { ranPrice.value = t.startPrice(); });
/** 取引所で探す (開くだけ、値段は手で入れる。ノーマル = 白、フラクチャー済み = ✦ の MOD がフラクチャー、ほかは ✦ が無いので探せない) */
const ts = useTreeSearch();
const searchKind = computed((): TreeSearchKind | null => (startsFractured(t.doc.value) ? "fractured" : startRarity(t.doc.value) === "normal" ? "white" : null));
const priceIn = computed(() => startOf(t.doc.value).price ?? null);
</script>

<template>
  <section data-tree-run-report class="nodrag nopan pointer-events-auto absolute right-3 top-3 z-40 flex max-h-[calc(100%-24px)] w-[360px] flex-col overflow-hidden rounded-xl border border-amber-400/40 bg-[#14100b]/[0.97] text-[13px] text-[#e6dcc6] shadow-[0_10px_30px_rgba(0,0,0,0.7)] max-md:inset-x-2 max-md:bottom-2 max-md:top-auto max-md:max-h-[72%] max-md:w-auto">
    <header class="flex items-center gap-2 border-b border-white/10 px-3 py-2">
      <b class="text-[14px] text-amber-200">{{ tr(`${result.n} 人回した結果`, `Result of ${result.n} runs`) }}</b>
      <button type="button" data-tree-run-report-close class="g-btn sm ml-auto" @click="emit('close')">{{ tr("木に戻る", "Back to tree") }}</button>
    </header>
    <div class="flex min-h-0 flex-col gap-3 overflow-y-auto px-3 py-3">
      <!-- 1 個の平均・完成率 -->
      <div class="flex items-baseline gap-3">
        <span class="text-[26px] font-bold tabular-nums text-amber-100">{{ div(result.perItem) }}<small class="ml-1 text-[14px] font-normal">{{ tr("神 / 1 個", "div / item") }}</small></span>
        <span class="ml-auto tabular-nums" :class="pct < 100 ? 'text-rose-300' : 'text-emerald-300'">{{ tr(`完成 ${pct}%`, `${pct}% done`) }}</span>
      </div>
      <!-- この始め方のベースの値段 (取引所の値段を手で入れる。入れたら回し直すと 1 個の神に入る) と、回したタブどうしの比べ -->
      <div data-tree-run-report-start class="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5">
        <h4 class="mb-1 truncate text-[12px] text-[#a99d86]">{{ tr(`ベースの値段 · ${startName(t.doc.value)}`, `Base price · ${startName(t.doc.value)}`) }}</h4>
        <div class="flex items-center gap-2">
          <NumStep data-tree-run-report-price :model-value="priceIn" width="w-24" placeholder-text="—" @update:model-value="t.setStartPrice" /><span>{{ tr("神", "div") }}</span>
          <button type="button" data-tree-run-report-search class="g-btn sm ml-auto" :disabled="!searchKind || !ts.can(searchKind)" :title="searchKind ? tr('取引所で探す (開くだけ。値段は手で入れる)', 'Search the trade site (opens it; type the price yourself)') : tr('ノーマル・フラクチャー済みの始め方で探せる', 'Available for normal and fractured starts')" @click="searchKind && ts.search(searchKind)">{{ tr("取引所で探す", "Search trade") }}</button>
        </div>
        <p v-if="priceIn !== null && Math.abs(priceIn - ranPrice) > 1e-9" class="mt-1 text-[11px] text-amber-200">{{ tr("値段を替えた: 回し直すと 1 個の神に入る", "Price changed: run again to include it") }}</p>
      </div>
      <!-- 費用の幅 (完成した人) -->
      <div>
        <h4 class="mb-1 text-[12px] text-[#a99d86]">{{ tr("完成した人の費用 (神)", "Cost of finished runs (div)") }}</h4>
        <div class="grid grid-cols-3 gap-1.5 text-center tabular-nums">
          <div class="rounded-md bg-white/[0.04] py-1"><div class="text-[11px] text-[#a99d86]">{{ tr("安い 10%", "Cheapest 10%") }}</div>{{ div(result.p10) }}</div>
          <div class="rounded-md bg-white/[0.06] py-1"><div class="text-[11px] text-[#a99d86]">{{ tr("中央", "Median") }}</div><b>{{ div(result.median) }}</b></div>
          <div class="rounded-md bg-white/[0.04] py-1"><div class="text-[11px] text-[#a99d86]">{{ tr("高い 10%", "Priciest 10%") }}</div>{{ div(result.p90) }}</div>
        </div>
      </div>
      <!-- 止まり・打ち止め -->
      <div v-if="result.stuck || result.capped" data-tree-run-report-stuck class="rounded-md border border-rose-400/40 bg-rose-900/20 px-2 py-1.5">
        <div class="text-rose-200">{{ tr(`止まり ${result.stuck} 人 · 打ち止め ${result.capped} 人`, `${result.stuck} stuck · ${result.capped} capped`) }}</div>
        <button v-for="[id, n] in stuck" :key="id" type="button" class="block w-full truncate text-left text-[12px] text-rose-100 underline-offset-2 hover:underline" @click="emit('go', id)">{{ tr(`${boxName(id)} で ${n} 人`, `${n} at ${boxName(id)}`) }}</button>
      </div>
      <!-- 一番お金を使った箱 -->
      <div v-if="spend.length">
        <h4 class="mb-1 text-[12px] text-[#a99d86]">{{ tr("一番お金を使った箱 (1 人あたり)", "Most expensive boxes (per run)") }}</h4>
        <button v-for="([id, b], i) in spend" :key="id" type="button" data-tree-run-report-spend class="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-white/[0.06]" @click="emit('go', id)">
          <span class="w-4 shrink-0 text-amber-300">{{ i + 1 }}</span><span class="min-w-0 flex-1 truncate">{{ boxName(id) }}</span><span class="shrink-0 tabular-nums text-amber-100">{{ div(b.spend) }} {{ tr("神", "div") }}</span>
        </button>
      </div>
      <!-- カレンシー別 -->
      <div>
        <h4 class="mb-1 text-[12px] text-[#a99d86]">{{ tr("使った物 (1 人あたり)", "Used (per run)") }}</h4>
        <div v-for="u in uses.slice(0, SHOW)" :key="u.k" class="flex items-center gap-2 py-0.5">
          <span class="min-w-0 flex-1 truncate">{{ u.name }}</span>
          <span class="shrink-0 tabular-nums text-[#a99d86]">{{ tr(`${div(u.n)} 個`, `×${div(u.n)}`) }}</span>
          <span class="w-16 shrink-0 text-right tabular-nums">{{ div(u.div) }} {{ tr("神", "div") }}</span>
        </div>
        <div v-if="uses.length > SHOW" class="flex py-0.5 text-[#a99d86]"><span class="flex-1">{{ tr(`ほか ${uses.length - SHOW} 種`, `${uses.length - SHOW} more`) }}</span><span class="w-16 text-right tabular-nums">{{ div(rest) }} {{ tr("神", "div") }}</span></div>
      </div>
    </div>
  </section>
</template>
