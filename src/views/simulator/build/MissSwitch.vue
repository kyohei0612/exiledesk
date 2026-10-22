<!--
  MissSwitch.vue — シミュレーターの入口 ②③ の「空打ち」のスイッチ (2026-10-22 オーナー「お告げと同じ所・同じ見た目で、お告げと並ぶ」)。
  カレンシーを持っている間、棚のお告げの欄の所に出す。入っている間は打つと外れの 1 手 (外れ MOD が付く / 何も付かない、出る割合どおり)、
  切れていれば毎回候補から付く MOD を選ぶ。お告げと同じく打っても切れない (クラフト台の omenKeep と同じ)
-->
<script setup lang="ts">
import { craftStage as s, nameOf } from "../../../state/craft-stage";
import { tr } from "../../../i18n/lang";
import { missOn } from "../../../state/simulator/build-state";
import { pathMiss, pathSearch } from "./use-build";
</script>

<template>
  <div data-miss-switch class="mt-2 rounded-lg border border-violet-400/25 bg-violet-500/[0.06] p-2">
    <p class="mb-1 text-[11px] text-violet-200/80">{{ tr(`${nameOf(s.held.value ?? "")} の打ち方`, `How to use ${nameOf(s.held.value ?? "")}`) }}</p>
    <div class="flex flex-wrap items-center gap-2">
      <button type="button" role="switch" data-miss-toggle :aria-checked="missOn" class="g-plain inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[12px] max-md:min-h-10" :class="missOn ? 'border-violet-300 bg-violet-500/30 text-violet-50 shadow-[0_0_8px_rgba(167,139,250,0.45)]' : 'border-white/15 bg-black/40 text-violet-200/80 hover:border-violet-300/60'" :title="tr('入れると、打った時に候補を出さずに外れの 1 手 (狙いが付かない、外れ MOD が出る割合どおりに付く)', 'When on, a use is a miss (no target; a miss mod rolls at its normal chance) without the choice list')" @click="missOn = !missOn">
        <span class="inline-block size-2.5 rounded-full" :class="missOn ? 'bg-violet-200' : 'bg-white/25'" />{{ tr("空打ち", "Miss") }}
      </button>
      <span class="text-[11px] opacity-60">{{ missOn ? tr("打つと外れの 1 手", "Uses are misses") : tr("打つと付く MOD を選ぶ", "Uses ask which mod to add") }}</span>
      <span v-if="pathSearch" class="text-[11px] opacity-80">{{ tr(`探している… ${pathSearch.n.toLocaleString()}`, `Finding… ${pathSearch.n.toLocaleString()}`) }}</span>
    </div>
    <p v-if="pathMiss && missOn" class="mt-1 text-[11px] text-rose-200">{{ pathMiss }}</p>
  </div>
</template>
