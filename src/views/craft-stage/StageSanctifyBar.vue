<!--
  StageSanctifyBar.vue — 聖別の数値を手で決める小さい帯 (品質の帯のすぐ下、聖別したアイテムだけ)。
  2026-10-20 オーナー「聖別の数値も手で決めて使えるといい」(運に頼らず最大まで振れたらどうなるかを試す)。
  打った時の運の結果はそのまま出て、ここで後から倍率 (0.78〜1.22、聖別のお告げの幅) を全部の MOD にそろえて決め直す (sset の手、apply-vaal.ts)。
  最大 = 段の最大 × 1.22、最小 = 段の最小 × 0.78。運の結果のように MOD ごとに倍率が違う時はプルダウンが「MOD ごと」
-->
<script setup lang="ts">
import { computed } from "vue";
import { tr } from "../../i18n/lang";
import { allMods } from "../../services/craft-stage/stage-core";
import { SANCTIFY_SELECT, SANCTIFY_STEPS, sanctifyLabel } from "./sanctify-steps";
import type { StageItem } from "../../services/craft-stage/types";

const props = defineProps<{ item: StageItem }>();
const emit = defineEmits<{ set: [k: number | "max" | "min"] }>();

const mods = computed(() => allMods(props.item).filter((m) => m.sanctify));
/** 全部の MOD の倍率が同じならその値 (×100)、違えば null */
const common = computed(() => {
  const ks = [...new Set(mods.value.map((m) => Math.round(m.sanctify!.k * 100)))];
  return ks.length === 1 ? ks[0]! : null;
});
const steps = SANCTIFY_STEPS, label = sanctifyLabel, sel = SANCTIFY_SELECT;
// 品質の帯と同じ形 (24px の高さ)
const wbtn = "g-plain h-6 rounded border border-white/15 px-1.5 text-white/70 hover:bg-white/10";
</script>

<template>
  <div v-if="item.sanctified && mods.length" class="flex w-full flex-wrap items-center justify-end gap-1 text-[11px] leading-none text-white/60" @click.stop>
    <span class="text-amber-200/80">{{ tr("聖別", "Sanctified") }}</span>
    <button type="button" :class="wbtn" :title="tr('段の最小 × 0.78', 'Tier min × 0.78')" @click="emit('set', 'min')">{{ tr("最小", "Min") }}</button>
    <select :class="sel" :value="common ?? ''" :title="tr('全部の MOD の倍率 (聖別のお告げの 0.78〜1.22)', 'Multiplier for all mods (Omen of Sanctification: 0.78-1.22)')" @change="emit('set', Number(($event.target as HTMLSelectElement).value))">
      <option v-if="common == null" value="" disabled>{{ tr("MOD ごと", "Per mod") }}</option>
      <option v-for="n in steps" :key="n" :value="n">{{ label(n) }}</option>
    </select>
    <button type="button" :class="wbtn" :title="tr('段の最大 × 1.22', 'Tier max × 1.22')" @click="emit('set', 'max')">{{ tr("最大", "Max") }}</button>
  </div>
</template>
