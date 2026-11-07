<!--
  DailyAimCard.vue — お題の狙いを完成形のカードで見せる (D-37e)。シミュの完成形と同じ placeWithSlots でベースに狙いを付け、段は「以上」。
  共有の木 (useTree) には触らない (締めた日のお題・投稿のページで木を壊さない)。値は段の真ん中
-->
<script setup lang="ts">
import { computed } from "vue";
import { tr } from "../../i18n/lang";
import StageItemCard from "../../components/for-share/item/StageItemCard.vue";
import { craftStage as s } from "../../state/craft-stage";
import { usePhone } from "../../utils/use-phone";
import { tierRankLabel } from "../../services/craft-stage/engine";
import { placeWithSlots } from "../simulator/tree/tree-slot-mods";
import type { DailyAim } from "./daily-api";

/** width = カードの幅 (無ければ PC 400・スマホ 340) */
const props = defineProps<{ base: string; ilvl: number; aims: readonly DailyAim[]; width?: number }>();
const phone = usePhone();
const placed = computed(() => {
  const data = s.data.value;
  if (!data) return null;
  return placeWithSlots(data, props.base, props.ilvl, props.aims.map((a) => ({ modId: a.modId, tier: a.tier })), [], () => 0.5);
});
const item = computed(() => placed.value?.item ?? null);
/** カードに乗らなかった狙い (枠が足りない等)。黙って消さず文で下に出す */
const left = computed(() => (placed.value?.left ?? []).map((x) => props.aims.find((a) => a.modId === x.modId)).filter((a): a is DailyAim => !!a));
</script>

<template>
  <div data-daily-aim-card class="daily-aim-card">
    <StageItemCard v-if="item" :item="item" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="width ?? (phone ? 340 : 400)" compact tier-at-least />
    <p v-else class="text-[14px] opacity-70">{{ tr("読み込み中", "Loading") }}</p>
    <ul v-if="left.length" data-daily-aim-left class="mt-2 text-[14px]">
      <li v-for="a in left" :key="a.modId">{{ tr(`カードに乗らない狙い: ${a.ja}`, `Not on the card: ${a.en}`) }} <small>{{ tierRankLabel(a.tier) }}</small></li>
    </ul>
  </div>
</template>
