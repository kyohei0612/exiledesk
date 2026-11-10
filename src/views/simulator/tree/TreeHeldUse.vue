<!--
  TreeHeldUse.vue — ヒネコラで持つ削減の「MOD レベルごとに 打つ / 打たない」の欄 (S-39 ②b、スイッチ whittleBands。11-11 オーナー案、見た目「おｋ」)。
  予見の箱が削減の手前の枠 (低い・同じ・高い) に分かれ、組のどれかが削減を持つ時だけ、手の窓の上に出す。押すとその枠の手を置き直す (1 つ戻すで戻せる)
-->
<script setup lang="ts">
import { computed } from "vue";
import { tr } from "../../../i18n/lang";
import { lvLook } from "./tree-whittle-marks";
import { heldUseRows, setHeldUse } from "./tree-held-use";
import { useTree } from "./use-tree";

const props = defineProps<{ boxId: string }>();
const t = useTree();
const rows = computed(() => heldUseRows(t.doc.value, props.boxId));
const TXT: Record<string, [string, string, string, string]> = {
  lo: ["▼ 低い", "▼ Lower", "外れが消える", "the miss goes"],
  eq: ["＝ 同じ", "= Same", "外れか残す MOD が半々で消える", "the miss or a kept mod goes, 50/50"],
  hi: ["▲ 高い", "▲ Higher", "残す MOD より高い MOD レベル = 残す MOD が消える", "higher than the kept mods: a kept mod goes"],
};
const BTN = "h-7 rounded px-2.5 text-[12px] ring-1";
const pick = (id: string, use: boolean): void => t.edit((d) => setHeldUse(d, id, use));
</script>

<template>
  <div v-if="rows.length" data-tree-held-use class="mb-2 rounded-lg border border-amber-300/45 bg-[#1b150e] p-2.5 text-[13px]">
    <p class="font-bold text-amber-300">{{ tr("MOD レベルごとに 打つ / 打たない", "Use or skip per mod level") }}</p>
    <p class="text-[12px] opacity-70">{{ tr("予見で見えた外れ MOD の MOD レベルで決める。打たない枠は「ハズレ (打たない)」の箱 (アイテムはそのまま・費用なし)。未選択の枠は決めるまで未設定", "Decide by the foreseen miss mod level. A skipped frame becomes one “Miss (not used)” box (item unchanged, no cost). Undecided frames stay unset") }}</p>
    <div v-for="r in rows" :key="r.id" data-tree-held-row :data-lv="r.lv" class="mt-1.5 flex flex-wrap items-center gap-2">
      <span class="min-w-16 rounded px-1.5 text-center font-bold text-black" :style="{ background: `rgb(${lvLook(r.lv).rgb})` }">{{ tr(TXT[r.lv]![0], TXT[r.lv]![1]) }}</span>
      <span class="min-w-0 flex-1 opacity-85">{{ tr(TXT[r.lv]![2], TXT[r.lv]![3]) }}</span>
      <span class="flex gap-1">
        <button type="button" data-tree-held-on :aria-pressed="r.use === true" :class="[BTN, r.use === true ? 'bg-emerald-400/25 text-emerald-100 ring-emerald-300/80' : 'text-sim-body opacity-60 ring-white/20 hover:opacity-100']" @click="pick(r.id, true)">{{ tr("打つ", "Use") }}</button>
        <button type="button" data-tree-held-off :aria-pressed="r.use === false" :class="[BTN, r.use === false ? 'bg-white/15 text-white ring-white/70' : 'text-sim-body opacity-60 ring-white/20 hover:opacity-100']" @click="pick(r.id, false)">{{ tr("打たない", "Skip") }}</button>
      </span>
    </div>
  </div>
</template>
