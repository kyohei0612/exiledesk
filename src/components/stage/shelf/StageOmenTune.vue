<!--
  StageOmenTune.vue — 掛けたお告げの名前のすぐ下に出す設定 (2026-10-21 オーナー「分からない所を使う人にいじらせたい」、開発版だけ)。
  触媒の高貴: カタリストの品質 1% ごとに、対応する MOD の重みへ足す倍率 (既定 0.2 = Craft of Exile。ゲームに数字は無い)。右に今の品質での倍率。
  聖別: チェックを入れた時だけ倍率を決める (既定は 0.78〜1.22 の中でランダム)。見た目は聖別の帯 (StageSanctifyBar) と同じ。
  値はエンジンの入口に渡すだけ (state/emulator/stage-tuning.ts)。
-->
<script setup lang="ts">
import { computed } from "vue";
import { tr } from "../../../i18n/lang";
import { useShelf } from "../../../state/stage/shelf-context";
import { catalystOf } from "../../../services/craft-stage/engine";
import { CATALYSING_PER_PCT, tunedCatalysingMultiplier } from "../../../services/craft-stage/engine";
import { SANCTIFY_SELECT, SANCTIFY_STEPS, sanctifyLabel } from "./sanctify-steps";
import { catalysingPerPct, sanctifyK, setCatalysingPerPct, setSanctifyK, TUNING_ON } from "../../../state/stage/stage-tuning";

const props = defineProps<{ k: string }>();
/** お告げ・アイテムは棚の文脈から (クラフト台は craftStage、シミュは provideShelf の物。2026-10-22) */
const shelf = useShelf();
const CAT = "OmenofCatalysingExaltation";
const SAN = "OmenofSanctification";
const show = computed(() => TUNING_ON && (props.k === CAT || props.k === SAN) && shelf.omens.value.includes(props.k));

const pct = computed(() => (shelf.item.value ? catalystOf(shelf.item.value).pct : 0));
const mult = computed(() => { void catalysingPerPct.value; return tunedCatalysingMultiplier(pct.value); });
function onRate(e: Event): void {
  const v = Number((e.target as HTMLInputElement).value);
  setCatalysingPerPct(Number.isFinite(v) && v >= 0 ? v : null);
}
// 聖別の帯と同じ選び (sanctify-steps.ts)
const steps = SANCTIFY_STEPS, label = sanctifyLabel, sel = SANCTIFY_SELECT;
</script>

<template>
  <div v-if="show" class="mt-0.5 flex max-w-[210px] flex-wrap items-center justify-center gap-1 text-[10px] leading-none text-white/60 max-md:text-[11px]" data-omen-tune @click.stop>
    <template v-if="k === CAT">
      <label class="flex items-center gap-1" :title="tr(`カタリストの品質 1% ごとに、対応する MOD の重みへ足す倍率。既定 ${CATALYSING_PER_PCT} は Craft of Exile の式 (ゲームに数字は無く未確認)。20% を超えた分は 0.6 倍`, `Added to the weight of matching mods per 1% Catalyst quality. Default ${CATALYSING_PER_PCT} is Craft of Exile's formula (no in-game number, unverified). Above 20% counts at 0.6x`)">
        <span>{{ tr("1% ごと +", "Per 1% +") }}</span>
        <input type="number" min="0" step="0.05" :value="catalysingPerPct ?? CATALYSING_PER_PCT" class="h-6 w-[4.6em] rounded border border-white/15 bg-black/60 px-1 text-white/80 tabular-nums" @change="onRate" />
      </label>
      <span class="tabular-nums text-amber-200/80">{{ tr("重み", "Weight") }} ×{{ mult.toFixed(1) }}</span>
      <button v-if="catalysingPerPct != null" type="button" class="g-plain h-6 rounded border border-white/15 px-1 text-white/70 hover:bg-white/10" :title="tr('既定に戻す', 'Reset to default')" @click="setCatalysingPerPct(null)">↺</button>
    </template>
    <template v-else>
      <label class="flex cursor-pointer items-center gap-1" :title="tr('入れると付く倍率を決める (外すと 0.78〜1.22 の中でランダム)', 'Pick the multiplier (off: random in 0.78-1.22)')">
        <input type="checkbox" :checked="sanctifyK != null" @change="setSanctifyK(($event.target as HTMLInputElement).checked ? 100 : null)" />
        <span>{{ tr("倍率", "Multiplier") }}</span>
      </label>
      <select v-if="sanctifyK != null" :class="sel" :value="sanctifyK" @change="setSanctifyK(Number(($event.target as HTMLSelectElement).value))">
        <option v-for="n in steps" :key="n" :value="n">{{ label(n) }}</option>
      </select>
    </template>
  </div>
</template>
