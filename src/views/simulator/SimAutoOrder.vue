<!--
  SimAutoOrder.vue — ④ 付ける順番の「おすすめの順番を出す」(シミュ部長、2026-10-20。設計は共有メモ auto-order-design.md)。
  オーナー 10-20: 出す数字は各場面で一番安い手を打った時の目安 (⑤ を自分で答えると高くなると一文)、候補は上位 3 つ + 今の順番を並べて
  押した物にする (勝手に並べ替えない)、計算は押した時だけ。既定は 1 行 (説明は ? の中)。状態は use-sim-auto-order.ts
-->
<script setup lang="ts">
import { tr } from "../../i18n/lang";
import HelpTip from "../../components/ui/HelpTip.vue";
import type { useSimAutoOrder } from "./use-sim-auto-order";

const props = defineProps<{
  ao: ReturnType<typeof useSimAutoOrder>;
  /** 順番の行のキー → 短い名前 */
  label: (k: string) => string;
  money: (x: number) => string;
  pct: (x: number) => string;
}>();
/** 並びの文 (ルーンも入れる。長い時は … で切って title に全文) */
const line = (order: string[]): string => order.map(props.label).join(" → ");
</script>

<template>
  <div data-sim-auto-order class="mb-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px]">
    <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <template v-if="ao.rows.value.length || ao.busy.value">
        <b class="text-[12px] text-[var(--exile-color-text-title)]">{{ tr("おすすめの順番", "Suggested orders") }}</b>
        <span class="opacity-60">{{ tr("(最善の打ち方で打った時の目安)", "(estimate if every step is played optimally)") }}</span>
        <span v-if="ao.stub.value" class="rounded-sm bg-rose-500/25 px-1 text-[10px] font-bold text-rose-100" :title="tr('計算 (解析君の動的計画法) がまだなので、並びと見た目を確かめるための仮の数字', 'The real calculation is not ready yet; these numbers only check the layout')">{{ tr("仮の数字", "Placeholder numbers") }}</span>
      </template>
      <button v-else type="button" data-auto-order-start class="g-btn sm max-md:min-h-10" @click="ao.start">{{ tr("おすすめの順番を出す", "Suggest an order") }}</button>
      <HelpTip :width="320">
        <ul class="list-disc space-y-1 pl-4">
          <li>{{ tr("各場面で一番安い手を打った時の平均。⑤ の打ち方は自分で決める (この数字より高くなる事が多い)", "Average when the cheapest move is played at every point. You still choose the moves in step 5; real costs are usually higher") }}</li>
          <li>{{ tr("まだの関門より後ろの狙いは、付いても外れとして扱う (⑤・⑥ と同じ)", "Targets after the current gate count as misses even if they roll (same as steps 5 and 6)") }}</li>
          <li>{{ tr("打ち止め: カオス・冒涜・増強は 3,000 回、ほかは 300 回。止まった人は未完成 (費用は入る)", "Give-up limit: 3,000 for Chaos/Desecration/Augmentation spam, 300 otherwise. Those who stop count as unfinished (their cost still counts)") }}</li>
          <li>{{ tr("値段は ③ で入れた値段と今の相場。作り直しは ④ のベースの計算で選んだ始め方", "Prices are the ones entered in step 3 and the current market. A restart uses the start chosen in the base cost above") }}</li>
          <li>{{ tr("増強スパムの狙いは一番上、狙いに要るルーンはその MOD のすぐ前で固定", "Augmentation-spam targets stay on top, and runes a target needs stay right before it") }}</li>
          <li>{{ tr("近似: 外れの系統は置き場を減らさない扱い、段は狙いの段以上をまとめて 1 つ (エンジンとのずれ 1 割くらい)", "Approximation: misses don't use up affix slots, tiers at or above the target are merged (about 10% off the engine)") }}</li>
        </ul>
      </HelpTip>
      <span v-if="ao.busy.value" class="ml-auto inline-flex items-center gap-2">
        <span class="tabular-nums opacity-70">{{ tr("計算中", "Calculating") }} {{ ao.step.value ? `${ao.step.value.done}/${ao.step.value.total}` : "" }}</span>
        <button type="button" class="g-btn sm max-md:min-h-10" @click="ao.stop">{{ tr("やめる", "Stop") }}</button>
      </span>
      <button v-else-if="ao.rows.value.length" type="button" class="ml-auto inline-flex h-8 items-center rounded-md px-2 text-[var(--exile-color-text-secondary)] hover:bg-white/5 max-md:min-h-10" @click="ao.start">{{ tr("出し直す", "Recalculate") }}</button>
    </div>
    <p v-if="ao.unsupported.value" class="mt-1 text-amber-200">{{ tr("この狙いの組み合わせはおすすめを出せない", "Can't suggest an order for this set of targets") }} ({{ ao.unsupported.value }})</p>
    <p v-if="ao.error.value" class="mt-1 text-rose-300">{{ ao.error.value }}</p>
    <div v-if="ao.shown.value.length" class="mt-1.5 flex flex-col gap-1">
      <div v-for="(r, i) in ao.shown.value" :key="r.order.join('|')" data-auto-order-row class="flex min-h-8 min-w-0 items-center gap-2 rounded-md border px-2 py-1 max-md:flex-wrap" :class="r.now ? 'border-[var(--exile-color-border-brass)] bg-white/[0.04]' : 'border-white/10'">
        <b class="w-5 shrink-0 text-center text-amber-200">{{ r.current && i >= 3 ? tr("今", "Now") : i + 1 }}</b>
        <span class="min-w-0 flex-1 truncate max-md:basis-[calc(100%-2rem)]" :title="line(r.order)">{{ line(r.order) }}</span>
        <span class="shrink-0 tabular-nums max-md:ml-7">{{ tr("約", "≈") }} {{ money(r.perFinish) }} · {{ tr(`完成 ${pct(r.finish)}`, `${pct(r.finish)} finish`) }}</span>
        <span v-if="r.near" class="shrink-0 text-[10px] text-emerald-200">{{ tr("ほぼ同じ", "About the same") }}</span>
        <span v-if="r.now" class="ml-auto shrink-0 text-[10px] opacity-60">{{ tr("今の順番", "Your order") }}</span>
        <button v-else type="button" class="g-btn sm ml-auto shrink-0 max-md:min-h-10" @click="ao.use(r.order)">{{ tr("この順にする", "Use this order") }}</button>
      </div>
    </div>
  </div>
</template>
