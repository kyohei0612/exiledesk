<!--
  SimTargetSort.vue — シミュレーターの 2 の「決めた」の後の整理 (2026-10-18 オーナー「決めたボタンを押して、この画面で付け方が同じ奴の設定をする UI」)。
  2 では欲しい MOD を並べるだけ (何個でも・付け方が重なってもまとめない)。ここで、同じ側・同じ付け方の組ごとに「全部付ける」か「この中のどれか N つ」を選ぶ。
  側ごとに使う枠 / ベースの枠を出し、超えている間は 3 に進ませない (use-sim-run.ts の step3)
-->
<script setup lang="ts">
import { computed } from "vue";
import { craftStage as s } from "../../state/craft-stage";
import { METHOD_EN, METHOD_JA, setAnyOf, sideLimits, sideUse, sortBuckets, type SortBucket } from "../../services/craft-stage/sim-methods";
import { fillModText } from "../../services/htc/mod-text";
import { tierDisplayRanges } from "../../services/mods/stat-scale";
import { tr } from "../../i18n/lang";
import Icon from "../../components/ui/Icon.vue";

const emit = defineEmits<{ back: []; done: [] }>();

const buckets = computed(() => sortBuckets(s.data.value, s.simTargets.value));
const use = computed(() => sideUse(s.data.value, s.simTargets.value));
const limits = computed(() => sideLimits(s.data.value, s.base.value, s.itemLevel.value));
const SIDES = [["prefix", "プレフィックス", "Prefixes"], ["suffix", "サフィックス", "Suffixes"]] as const;
const over = computed(() => use.value.prefix > limits.value.prefix || use.value.suffix > limits.value.suffix);
function nameOf(m: { modId: string; minTierIndex: number }): string {
  const md = s.data.value?.mods.get(m.modId);
  const t = md?.tiers[m.minTierIndex];
  return md ? fillModText(md, t ? tierDisplayRanges(t) : []).replace(/\n/g, " / ") : m.modId;
}
/** 全部付ける (= まとめない) か */
const all = (b: SortBucket): boolean => b.need >= b.members.length;
function set(b: SortBucket, n: number): void { s.simTargets.value = setAnyOf(s.simTargets.value, b, n); }
/**
 * 「この中のどれか」を押した時の初めの数: その側の空いている枠に収まる一番大きい数 (候補 − 1 まで、最低 1)。
 * 前は候補 − 1 で、サフィの枠 3 に冒涜の候補 6 つだと「どれか 5 つ」になり、− を何回も押さないと進めなかった (2026-10-21 モンキーチェック)
 */
function anyOf(b: SortBucket): void {
  const free = limits.value[b.side] - (use.value[b.side] - b.need);
  set(b, Math.max(1, Math.min(b.members.length - 1, free)));
}
</script>

<template>
  <div data-sim-sort class="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[12px]">
    <p class="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      <b class="text-[var(--exile-color-text-primary)]">{{ tr("付け方が同じ MOD の整理", "Group mods with the same method") }}</b>
      <span v-for="sd in SIDES" :key="sd[0]" class="tabular-nums" :class="use[sd[0]] > limits[sd[0]] ? 'font-bold text-rose-300' : 'text-[var(--exile-color-text-secondary)]'">{{ tr(sd[1], sd[2]) }} {{ use[sd[0]] }} / {{ tr(`枠 ${limits[sd[0]]}`, `${limits[sd[0]]} slots`) }}</span>
    </p>
    <p v-if="over" class="mb-1.5 text-rose-300">{{ tr("枠より多いので、下で「この中のどれか N つ」にまとめて枠に収める (収まるまで 3 に進めない)", "More targets than slots: group them below as “any N of these” until they fit (step 3 waits until then)") }}</p>
    <p v-if="!buckets.length" class="opacity-60">{{ over ? tr("まとめられる組が無い。「← 狙う MOD に戻る」で狙いを減らす", "Nothing to group. Use “← Back to target mods” to drop some targets") : tr("同じ側に同じ付け方の MOD が 2 つ以上ある時、ここでまとめられる", "When a side has 2+ mods with the same method, you can group them here") }}</p>
    <div v-for="b in buckets" :key="`${b.side}:${b.method}`" data-sim-sort-bucket class="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/5 py-1.5">
      <span class="shrink-0 text-[11px] text-[var(--exile-color-text-tertiary)]">{{ b.side === "prefix" ? tr("プレ", "Prefix") : tr("サフィ", "Suffix") }} · {{ tr(METHOD_JA[b.method], METHOD_EN[b.method]) }}</span>
      <span class="min-w-0 flex-1 truncate text-[#c8c8ff]" :title="b.members.map(nameOf).join('\n')">{{ b.members.map(nameOf).join(" / ") }}</span>
      <span class="flex shrink-0 items-center gap-1">
        <button type="button" class="g-tab !min-h-[26px] !px-2 !text-[11px] max-md:!min-h-10" :class="all(b) ? 'on' : ''" @click="set(b, b.members.length)">{{ tr(`全部 (${b.members.length} つ)`, `All (${b.members.length})`) }}</button>
        <button type="button" class="g-tab !min-h-[26px] !px-2 !text-[11px] max-md:!min-h-10" :class="all(b) ? '' : 'on'" @click="all(b) && anyOf(b)">{{ tr("この中のどれか", "Any of these:") }}</button>
        <template v-if="!all(b)">
          <button type="button" class="g-plain grid size-6 place-items-center rounded border border-amber-400/50 bg-black/40 font-sans text-[15px] font-bold leading-none text-amber-100 hover:bg-amber-500/15 disabled:opacity-30 max-md:size-10" :disabled="b.need <= 1" :aria-label="tr('1 つ減らす', 'One fewer')" @click="set(b, b.need - 1)">−</button>
          <b class="w-4 text-center tabular-nums text-amber-100">{{ b.need }}</b>
          <button type="button" class="g-plain grid size-6 place-items-center rounded border border-amber-400/50 bg-black/40 font-sans text-[15px] font-bold leading-none text-amber-100 hover:bg-amber-500/15 disabled:opacity-30 max-md:size-10" :disabled="b.need >= b.members.length - 1" :aria-label="tr('1 つ増やす', 'One more')" @click="set(b, b.need + 1)">+</button>
          <span class="text-[11px] opacity-70">{{ tr("つ", "") }}</span>
        </template>
      </span>
    </div>
    <!-- 戻る / 決めた (2026-10-18 オーナー「決定とか戻るとかない」)。枠に収まるまで決められない -->
    <div class="mt-2 flex items-center gap-2 border-t border-white/5 pt-2">
      <button type="button" data-sim-sort-back class="g-btn sm max-md:min-h-10" @click="emit('back')">{{ tr("← 狙う MOD に戻る", "← Back to target mods") }}</button>
      <button type="button" data-sim-sort-done class="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--exile-color-accent-focus)] px-3 text-[13px] font-semibold text-black transition hover:bg-[var(--exile-color-accent-focus-hover)] disabled:opacity-40 max-md:min-h-11" :class="over ? '!bg-white/10 !text-white/45 cursor-not-allowed' : ''" :disabled="over" :title="over ? tr('枠に収めると押せる', 'Fit the slots first') : undefined" @click="emit('done')">{{ over ? tr("枠に収めると決められる", "Fit the slots to continue") : tr("決めた", "Done") }}<Icon v-if="!over" name="arrow-right" class="size-4" /></button>
    </div>
  </div>
</template>
