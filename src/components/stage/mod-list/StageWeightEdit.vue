<!--
  StageWeightEdit.vue — MOD 一覧の行の重みの札と、重みを直す 1 行 (2026-10-22 オーナー「1000 で置いて、修正できるように」、直す欄は開発版だけ)。
  badge: 行の右の札。直した行は「重みを直した」、推定で埋めた重み (weight-overrides) は「重みは推定」(前は StageModList.vue にあった札)。
  無し: 段の表の上の 1 行「重み [1000] ↺ · 全部戻す」。値 = その MOD の一番重い段の重み (ほかの段は同じ比で動く)。系統をまとめた行は出さない。
  値はエンジンの入口に渡すだけ (state/emulator/stage-tuning.ts → services/craft-stage/stage-tuning.ts、打つ結果と確率の表の両方に効く)。
-->
<script setup lang="ts">
import { computed } from "vue";
import { tr } from "../../../i18n/lang";
import { craftStage } from "../../../state/craft-stage";
import type { ListRow } from "../../../services/craft-stage/engine";
import { defaultWeightOf, OVERRIDDEN } from "../../../services/craft-stage/engine";
import { weightOverrideNote } from "../../../services/htc/weight-overrides";
import { modWeights, resetModWeights, setModWeight, WEIGHTS_ON } from "../../../state/stage/stage-tuning";

const props = defineProps<{ row: ListRow; badge?: boolean }>();
const est = computed(() => props.row.tiers.some((t) => OVERRIDDEN.has(t.modId ?? props.row.id)));
/** 1 つの MOD の行だけ (系統をまとめた行は段ごとに MOD が違う) */
const single = computed(() => !props.row.tiers.some((t) => t.modId));
const mod = computed(() => (single.value ? craftStage.data.value?.mods.get(props.row.id) ?? null : null));
const base = computed(() => (mod.value ? defaultWeightOf(mod.value) : 0));
const edited = computed(() => modWeights.value[props.row.id]);
const count = computed(() => Object.keys(modWeights.value).length);
function onInput(e: Event): void {
  const v = Number((e.target as HTMLInputElement).value);
  setModWeight(props.row.id, Number.isFinite(v) && v >= 0 && v !== base.value ? v : null);
}
const btn = "g-plain h-6 rounded border border-white/15 px-1.5 text-white/70 hover:bg-white/10";
</script>

<template>
  <template v-if="badge">
    <span v-if="WEIGHTS_ON && edited != null" class="whitespace-nowrap rounded-sm border border-amber-300/50 bg-amber-500/15 px-1 py-px text-[10px] leading-none text-amber-200" :title="tr(`重み ${base} → ${edited}`, `Weight ${base} → ${edited}`)">{{ tr("重みを直した", "Weight edited") }}</span>
    <span v-else-if="est" class="whitespace-nowrap rounded-sm border border-white/20 px-1 py-px text-[10px] leading-none text-[var(--exile-color-text-tertiary)]" :title="weightOverrideNote()">{{ tr("重みは推定", "Est. weight") }}</span>
  </template>
  <div v-else-if="WEIGHTS_ON && mod && base > 0" class="mt-1 flex flex-wrap items-center gap-1 text-[11px] leading-none text-white/60" data-weight-edit @click.stop>
    <label class="flex items-center gap-1" :title="tr('一番重い段の重み (ほかの段は同じ比で動く)。打つ結果と付く確率の両方に効く', 'Weight of the heaviest tier (other tiers scale with it). Affects both rolls and chances')">
      <span>{{ tr("重み", "Weight") }}</span>
      <input type="number" min="0" step="10" :value="edited ?? base" class="h-6 w-[6em] rounded border bg-black/60 px-1 tabular-nums" :class="edited != null ? 'border-amber-300/60 text-amber-100' : 'border-white/15 text-white/80'" @change="onInput" />
    </label>
    <span v-if="edited != null" class="tabular-nums opacity-70">{{ tr(`既定 ${base}`, `Default ${base}`) }}</span>
    <button v-if="edited != null" type="button" :class="btn" :title="tr('既定に戻す', 'Reset to default')" @click="setModWeight(row.id, null)">↺</button>
    <button v-if="count" type="button" :class="btn" :title="tr('直した重みを全部既定に戻す', 'Reset all edited weights')" @click="resetModWeights()">{{ tr(`全部戻す (${count})`, `Reset all (${count})`) }}</button>
  </div>
</template>
