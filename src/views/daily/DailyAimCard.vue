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
import DailyEssNote from "./DailyEssNote.vue";

/** width = カードの幅 (無ければ PC 400・スマホ 340) */
/** essNote = カードの下に「エッセンスで代用可」の注意書きを出す (お題の完成形の時だけ。投稿の確かめでは出さない、D-37e3) */
/** fractured = 狙いと同じ順のフラクチャーの印 (投稿の確かめで、読んだ品の印を見せるだけ。D-14b) */
const props = defineProps<{ base: string; ilvl: number; aims: readonly DailyAim[]; width?: number; essNote?: boolean; fractured?: readonly boolean[] }>();
const phone = usePhone();
const placed = computed(() => {
  const data = s.data.value;
  if (!data) return null;
  // 読んだ品のフラクチャーの印 (狙いと同じ順) はそのままエンジンの口へ流す (印の付いた MOD として置くのはエンジン、画面の側で品を書き換えない)
  const fr = props.fractured;
  return placeWithSlots(data, props.base, props.ilvl, props.aims.map((a, i) => ({ modId: a.modId, tier: a.tier, fractured: !!fr?.[i] })), [], () => 0.5);
});
const item = computed(() => placed.value?.item ?? null);
/** カードに乗らなかった狙い (枠が足りない等)。黙って消さず文で下に出す */
const left = computed(() => (placed.value?.left ?? []).map((x) => props.aims.find((a) => a.modId === x.modId)).filter((a): a is DailyAim => !!a));
</script>

<template>
  <div data-daily-aim-card class="daily-aim-card">
    <StageItemCard v-if="item" :item="item" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="width ?? (phone ? 340 : 400)" compact tier-at-least />
    <p v-else class="text-[14px] opacity-70">{{ tr("読み込み中", "Loading") }}</p>
    <DailyEssNote v-if="essNote && item" :style="{ width: '100%', maxWidth: `${width ?? (phone ? 340 : 400)}px` }" />
    <ul v-if="left.length" data-daily-aim-left class="mt-2 text-[14px]">
      <li v-for="a in left" :key="a.modId">{{ tr(`カードに乗らない狙い: ${a.ja}`, `Not on the card: ${a.en}`) }} <small>{{ tierRankLabel(a.tier) }}</small></li>
    </ul>
  </div>
</template>
