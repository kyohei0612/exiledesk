<!--
  TreeCatPick.vue — 木の途中の手の窓のカタリスト (S-31b、スイッチ catHand。本番の要望 18774cd7・10-29 オーナー「手の途中でカタリストが付けれないね」
  「カタリストクリックで％どこまで上げれるか決めれるみたいな手　これはエッセンスと同じ挙動で打ったらそのエッセンスが打たれた枠が登場する」)。
  持っていない時: 「カタリスト」の札 (このアイテムに打てる物だけ、エンジンの useReason)。押すと持つ。
  持っている時: 「品質を n % まで」の欄 (上限 = 今の品質の上限 maxQualityOf、既定は上限)。種類は窓の上のカタリストの札で替える (TreeHandShelf)
-->
<script setup lang="ts">
import { computed, watch } from "vue";
import { maxQualityOf, useReason, type StageItem } from "../../../services/craft-stage/engine";
import { craftStage as s } from "../../../state/craft-stage";
import { TREE_CATALYSTS, isCatalyst } from "../../../services/simulator/tree/tree-hands";
import { handName } from "./tree-names";
import { tr } from "../../../i18n/lang";

const props = defineProps<{ item: StageItem | null; held: string | null }>();
const to = defineModel<number>({ required: true });
const emit = defineEmits<{ hold: [key: string] }>();
/** このアイテムに打てるカタリスト (無ければ札を出さない) */
const usable = computed(() => { const d = s.data.value, it = props.item; return d && it ? TREE_CATALYSTS.filter((k) => !useReason(d, it, k)) : []; });
const max = computed(() => (props.item ? maxQualityOf(props.item) : 0));
const now = computed(() => props.item?.catalystQuality ?? 0);
// 持った時は既定で上限まで (0 のままだと前の「最大まで」の通り抜けの手になる)
watch(() => [props.held, max.value] as const, () => { if (isCatalyst(props.held ?? "") && !to.value) to.value = max.value; }, { immediate: true });
</script>

<template>
  <div v-if="isCatalyst(held ?? '')" data-tree-cat-to class="flex flex-wrap items-center gap-1.5 text-[12px]">
    <span>{{ tr("品質を", "Raise quality to") }}</span>
    <input v-model.number="to" data-tree-cat-pct type="number" :min="1" :max="max" class="h-7 w-16 rounded-md border border-white/15 bg-black/40 px-1 text-right" @change="to = Math.max(1, Math.min(max, Math.round(to || max)))" />
    <span>{{ tr(`% まで (上限 ${max}%、今 ${now}%)`, `% (max ${max}%, now ${now}%)`) }}</span>
  </div>
  <button v-else-if="usable.length" type="button" data-tree-cat-hold class="g-btn sm self-start" :title="tr(`カタリストで品質を指定の % まで上げる (結果は 1 箱、費用は打った個数)。種類: ${usable.map(handName).join(' / ')}`, `Raise quality with a catalyst to a set % (one result box; cost = catalysts used)`)" @click="emit('hold', usable[0]!)">{{ tr("カタリスト (品質を上げる)", "Catalyst (raise quality)") }}</button>
</template>
