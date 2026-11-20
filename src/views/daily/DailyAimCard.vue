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
import { anyEleMod, tierRankLabel } from "../../services/craft-stage/engine";
import { eleAnyText } from "../../services/simulator/tree/tree-ele-any";
import type { RowTag } from "../../components/for-share/item/stage-item-row-tag";
import { withTopicQuality } from "./daily-quality-item";
import { placeWithSlots } from "../simulator/tree/tree-slot-mods";
import type { DailyAim } from "./daily-api";
import DailyEssNote from "./DailyEssNote.vue";
import type { TopicQuality } from "./daily-quality";

/** width = カードの幅 (無ければ PC 400・スマホ 340) */
/** essNote = カードの下に「エッセンスで代用可」の注意書きを出す (お題の完成形の時だけ。投稿の確かめでは出さない、D-37e3) */
/** fractured = 狙いと同じ順のフラクチャーの印 (投稿の確かめで、読んだ品の印を見せるだけ。D-14b) */
/** ele = 忍者産のお題 (D-06c): 火・冷気・雷の狙いを「いずれかの元素耐性」の 1 行 (2 つ以上は「× n」) で見せる (シミュの完成形 S-10h ① と同じ形、✦ の狙いは元素のまま) */
const props = defineProps<{ ele?: boolean; base: string; ilvl: number; aims: readonly DailyAim[]; width?: number; essNote?: boolean; fractured?: readonly boolean[]; /** お題の id (注意書きの字を完成の物差しの日の門に合わせる、D-37e3) */ day?: string; /** 完成形の品質 (D-03d)。カードの品質の行に出す */ quality?: TopicQuality | null }>();
const phone = usePhone();
/** 「いずれか」で見せる狙い (段の厳しい順。1 本目の行だけカードに残す) */
const eleRows = computed(() => {
  const data = s.data.value;
  if (!props.ele || !data) return [];
  return props.aims.filter((a, i) => !props.fractured?.[i] && anyEleMod(data, a.modId)).sort((x, y) => x.tier - y.tier);
});
const placed = computed(() => {
  const data = s.data.value;
  if (!data) return null;
  // 読んだ品のフラクチャーの印 (狙いと同じ順) はそのままエンジンの口へ流す (印の付いた MOD として置くのはエンジン、画面の側で品を書き換えない)
  const fr = props.fractured;
  // 「いずれか」の 2 本目から先は置かない (1 本目の行に「× n」、シミュの完成形 E-112 と同じ。D-06c)
  const rest = eleRows.value.slice(1);
  return placeWithSlots(data, props.base, props.ilvl, props.aims.map((a, i) => ({ a, f: !!fr?.[i] })).filter((x) => !rest.includes(x.a)).map(({ a, f }) => ({ modId: a.modId, tier: a.tier, fractured: f })), [], () => 0.5);
});
// 品質のあるお題は品にその品質と種類を載せる (カードの品質の行・品質で伸びた値がゲームの品と同じに出る、D-03d)
const item = computed(() => {
  const it = placed.value?.item ?? null, data = s.data.value;
  return it && data ? withTopicQuality(data, it, props.quality) : it;
});
const eleTags = computed((): Map<string, RowTag> | null => {
  const a = eleRows.value[0], n = eleRows.value.length;
  if (!a) return null;
  const text = eleAnyText(tr(a.ja, a.en)) + (n > 1 ? ` × ${n}` : "");
  return new Map([[a.modId, { text, replace: true, tone: "info", title: n > 1 ? tr(`火・冷気・雷耐性のうち違う元素 ${n} つが段以上で完成`, `${n} different elements among fire / cold / lightning at this tier or better`) : tr("火・冷気・雷耐性のどれか 1 つが段以上で完成", "Any one of fire / cold / lightning at this tier or better") }]]);
});
/** カードに乗らなかった狙い (枠が足りない等)。黙って消さず文で下に出す */
const left = computed(() => (placed.value?.left ?? []).map((x) => props.aims.find((a) => a.modId === x.modId)).filter((a): a is DailyAim => !!a));
</script>

<template>
  <div data-daily-aim-card class="daily-aim-card">
    <StageItemCard v-if="item" :item="item" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="width ?? (phone ? 340 : 400)" compact tier-at-least :row-tags="eleTags" />
    <p v-else class="text-[14px] opacity-70">{{ tr("読み込み中", "Loading") }}</p>
    <DailyEssNote v-if="essNote && item" :day="day" :quality="quality" :style="{ width: '100%', maxWidth: `${width ?? (phone ? 340 : 400)}px` }" />
    <ul v-if="left.length" data-daily-aim-left class="mt-2 text-[14px]">
      <li v-for="a in left" :key="a.modId">{{ tr(`カードに乗らない狙い: ${a.ja}`, `Not on the card: ${a.en}`) }} <small>{{ tierRankLabel(a.tier) }}</small></li>
    </ul>
  </div>
</template>
