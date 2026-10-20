<!--
  SimStartPick.vue — シミュレーターの 3 の頭: アイテムレベル → 付与スキル (候補から 1 つ付くベースだけ)。アイテムレベルは付与スキルを選ぶ前から出す
  (2026-10-18 オーナー「付与スキルがあったら先に決めさせて、ベース計算表示」、2026-10-19「アイテムレベルは付与スキル選ぶ前から」)。
  始め方は StageSimPanel.vue の 3 で縦に全部並べて値段を比べる (前はここの札)。
  アイテムレベル: 狙いの段が全部付く一番低いレベルを最初に入れ、それ以上から選ぶ (オーナー「MOD 選んだ後なら、選んだ MOD が付く下限のアイテムレベルをデフォで置ける」)
-->
<script setup lang="ts">
import { computed, onMounted } from "vue";
import { SIM_ILVL_MAX } from "../craft-stage/use-stage-base";
import { htcBaseInfo } from "../../services/htc/patch";
import { jaSkill } from "../../i18n/skills-ja";
import { craftStage as s } from "../../state/craft-stage";
import { tr } from "../../i18n/lang";
import { simPasted } from "../../state/simulator/sim-state";

/** 狙いの段が全部付く一番低いアイテムレベル (狙いの下限の段の MOD レベルの一番高い物) */
const needIlvl = computed(() => Math.max(1, ...s.simTargets.value.map((t) => s.data.value?.mods.get(t.modId)?.tiers[t.minTierIndex]?.ilvl ?? 1)));
const ILVL_CHOICES = computed(() => Array.from({ length: Math.max(0, SIM_ILVL_MAX - needIlvl.value + 1) }, (_, i) => needIlvl.value + i));
// 3 に来た時: まだ選んでいない (2 の間の一番上のまま) か、下限より低ければ下限を入れる。エミュレーターの状態からも引き継がず下限を入れる
// (2026-10-19 オーナー「エミュから引き継がなくておk、こっちのルールで表示させてくれデフォで」)
onMounted(() => { if (s.simStart.value === "item" || s.itemLevel.value === SIM_ILVL_MAX || s.itemLevel.value < needIlvl.value) s.itemLevel.value = needIlvl.value; });
/**
 * 貼り付けから始めた時: アイテムレベルは貼った物を使い (上で入れてある)、品質・コラプト・未発現は持ち越さない (始めは白ベース) と 1 行で
 * (2026-10-20 点検 1: ⑤ のカードが品質なし・コラプトなしで、貼った物と別の物で回すのが分からなかった)
 */
const fromPaste = computed(() => !!simPasted.value);
const pastedDrop = computed(() => {
  const p = simPasted.value;
  if (!p) return [];
  return [
    p.quality ? tr(`品質 +${p.quality}%`, `Quality +${p.quality}%`) : "",
    p.corrupted ? (p.corrupted === 2 ? tr("二重コラプト", "Twice Corrupted") : tr("コラプト", "Corrupted")) : "",
    p.unrevealed ? tr(`未発現 ${p.unrevealed}`, `${p.unrevealed} unrevealed`) : "",
  ].filter(Boolean);
});
/** 付与スキルの候補 (2 つ以上ある時だけ選ばせる。1 つに決まっているベースは選ぶ物が無い) */
const grants = computed(() => htcBaseInfo()[s.base.value]?.grants ?? []);
</script>

<template>
  <div class="flex flex-col gap-2">
  <!-- アイテムレベル (エミュレーターの状態からも選ぶ) -->
  <span class="flex flex-wrap items-center gap-2 text-[12px]">
    <span class="text-[var(--exile-color-text-secondary)]">{{ tr("アイテムレベル", "Item Level") }}</span>
    <select data-sim-ilvl class="h-[30px] cursor-pointer rounded border border-white/15 bg-black/60 px-1.5 tabular-nums text-white/85 max-md:h-10" :value="s.itemLevel.value" @change="s.itemLevel.value = Number(($event.target as HTMLSelectElement).value)">
      <option v-for="lv in ILVL_CHOICES" :key="lv" :value="lv">{{ lv }}</option>
    </select>
    <span class="text-[11px] opacity-60">{{ tr(`狙いが全部付く一番低いレベルは ${needIlvl}`, `Lowest level where every target can roll: ${needIlvl}`) }}</span>
  </span>
  <p v-if="fromPaste" data-sim-pasted-note class="text-[11px] text-[var(--exile-color-text-secondary)]">
    {{ tr("貼り付けから: 白ベースから作る", "From paste: crafting starts from a white base") }}<template v-if="pastedDrop.length">{{ tr(`(${pastedDrop.join("・")} は持ち越さない)`, ` (${pastedDrop.join(", ")} not carried over)`) }}</template>
  </p>
  <!-- 付与スキル (候補から 1 つ付くベースだけ。クラフトでは変えられないので、買うベースを決める物) -->
  <span v-if="grants.length > 1" class="flex flex-wrap items-center gap-2 text-[12px]">
    <span class="text-[var(--exile-color-text-secondary)]">{{ tr("付与スキル", "Granted skill") }}</span>
    <select data-sim-grant class="h-[30px] max-w-full cursor-pointer rounded border bg-black/60 px-1.5 max-md:h-10" :class="s.simGrant.value ? 'border-white/15 text-white/85' : 'border-amber-300/70 text-amber-100'" :value="s.simGrant.value ?? ''" @change="s.simGrant.value = ($event.target as HTMLSelectElement).value || null">
      <option value="">{{ tr(`選ぶ (${grants.length} 種)`, `Choose (${grants.length})`) }}</option>
      <option v-for="g in grants" :key="g.en" :value="g.en">{{ tr(jaSkill(g.en), g.en) }}{{ g.level ? ` (Lv ${g.level})` : "" }}</option>
    </select>
    <span class="text-[11px] opacity-60">{{ tr("クラフトでは変わらない。買うベースを決める物", "Crafting can't change it; it decides which base you buy") }}</span>
  </span>
  </div>
</template>
