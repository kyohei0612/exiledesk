<!--
  TreeOrbAsk.vue — 段を下げた後の「オーブをどうしますか」(S-10f、スイッチ tierDown)。
  11-13 オーナー「ティアの下限をいじった時に今のオーブで出なかったら注意書きでオーブのおすすめ」「変更加えたオーブだけいじったらええんちゃう」:
  下げた MOD を狙う手のうち、今のオーブ (高貴の完全など) の段の下限では新しい下限の段が出ない手だけを並べ、おすすめのオーブを出す。押した手だけ替える (1 つ戻すで戻る)。出る手は触らない
-->
<script setup lang="ts">
import { computed } from "vue";
import { tr } from "../../../i18n/lang";
import { useTree } from "./use-tree";
import { craftStage as s } from "../../../state/craft-stage";
import { isAimMod, orbMisfits } from "../../../services/simulator/tree/tree-tier-down";
import { nameOfKey } from "../../../state/for-share/craft-stage-shelf";
import { stepOf } from "./tree-fail";

const props = defineProps<{ modIds: readonly string[] }>();
const emit = defineEmits<{ close: [] }>();
const t = useTree();
const rows = computed(() => {
  const data = s.data.value;
  if (!data) return [];
  return t.goals.value.filter((g) => props.modIds.some((id) => isAimMod(data, g, id))).flatMap((g) => orbMisfits(data, t.doc.value, g));
});
const name = (k: string): string => nameOfKey(k, null);
function swap(box: string, to: string): void { t.edit((d) => { const h = d.boxes[box]?.hand; if (h) h.currency = to; }); }
</script>

<template>
  <div v-if="rows.length" data-tree-orb-ask class="mt-1.5 rounded-md border border-amber-400/60 bg-amber-950/40 p-1.5 text-[12px] leading-snug">
    <div class="flex items-start gap-1">
      <p class="flex-1 font-bold text-amber-200">{{ tr("オーブをどうしますか (今のオーブでは下げた段が出ない手)", "Switch orbs? (These steps' orbs can't roll the lowered tier)") }}</p>
      <button type="button" class="shrink-0 rounded px-1 text-white/60 hover:bg-white/10 hover:text-white" :title="tr('このままにする', 'Keep as is')" @click="emit('close')">×</button>
    </div>
    <div v-for="r in rows" :key="r.box" data-tree-orb-row :data-box="r.box" class="mt-1 rounded bg-black/30 px-1.5 py-1">
      <p class="text-white/80"><span class="mr-1 font-bold text-amber-100">{{ tr(`${stepOf(t.doc.value, r.box)} 段目`, `Step ${stepOf(t.doc.value, r.box)}`) }}</span>{{ tr(`${name(r.currency)} では ${t.aimLabel(r.aim)} (Lv${r.level}) が出ない`, `${name(r.currency)} can't roll ${t.aimLabel(r.aim)} (Lv${r.level})`) }}</p>
      <button type="button" data-tree-orb-swap class="g-btn sm mt-1 w-full" @click="swap(r.box, r.to)">{{ tr(`${name(r.to)} に替える`, `Switch to ${name(r.to)}`) }}</button>
    </div>
  </div>
</template>
