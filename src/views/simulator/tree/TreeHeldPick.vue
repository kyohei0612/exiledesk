<!--
  TreeHeldPick.vue — 棚で削減を持っている間の「MOD レベルごとに 打つ / 打たない」(S-39 ②b、スイッチ whittleBands。11-11 オーナー「もったらまた神みたいに。持ちながらいろいろチェック付けれたり」)。
  神の欄 (TreeDivinePick) と同じ所に出す。出る枠はこの箱の品からデータで数えた組。選びはカードを押して手を置いた時に各枠へ入る (tree-held-use の fillHeldDefaults)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from "vue";
import { tr } from "../../../i18n/lang";
import type { StageItem } from "../../../services/craft-stage/engine";
import type { Hand } from "../../../services/simulator/tree/tree-model";
import type { LvClass } from "../../../services/simulator/tree/tree-whittle";
import { craftStage } from "../../../state/craft-stage";
import { lvLook } from "./tree-whittle-marks";
import { dropHeldPick, heldPickRows, seedHeldPick, setHeldPick } from "./tree-held-use";
import { useTree } from "./use-tree";

const props = defineProps<{ boxId: string; hand: Hand; item: StageItem }>();
const t = useTree();
watch(() => props.boxId, (id, was) => { if (was) dropHeldPick(was); seedHeldPick(t.doc.value, id); }, { immediate: true });
onBeforeUnmount(() => dropHeldPick(props.boxId));
const rows = computed(() => { const data = craftStage.data.value; return data ? heldPickRows(data, t.doc.value, props.boxId, props.item, props.hand) : []; });
const TXT: Record<LvClass, [string, string, string, string]> = {
  lo: ["▼ 低い", "▼ Lower", "外れが消える", "the miss goes"],
  eq: ["＝ 同じ", "= Same", "外れか残す MOD が半々で消える", "the miss or a kept mod goes, 50/50"],
  hi: ["▲ 高い", "▲ Higher", "残す MOD より高い MOD レベル = 残す MOD が消える", "higher than the kept mods: a kept mod goes"],
};
const BTN = "h-7 rounded px-2.5 text-[12px] ring-1";
</script>

<template>
  <div v-if="rows.length" data-tree-held-pick class="rounded-lg border border-amber-300/45 bg-[#1b150e] p-2.5 text-[13px]">
    <p class="font-bold text-amber-300">{{ tr("MOD レベルごとに 打つ / 打たない", "Use or skip per mod level") }}</p>
    <p class="text-[12px] opacity-70">{{ tr("持ったまま決めて、カードを押すと枠ごとに入る。打たない枠は「ハズレ (打たない)」の箱。未選択の枠は決めるまで未設定", "Decide while holding, then click the card to place it per frame. Skipped frames become one “Miss (not used)” box. Undecided frames stay unset") }}</p>
    <div v-for="r in rows" :key="r.lv" data-tree-held-pick-row :data-lv="r.lv" class="mt-1.5 flex flex-wrap items-center gap-2">
      <span class="min-w-16 rounded px-1.5 text-center font-bold text-black" :style="{ background: `rgb(${lvLook(r.lv).rgb})` }">{{ tr(TXT[r.lv][0], TXT[r.lv][1]) }}</span>
      <span class="min-w-0 flex-1 opacity-85">{{ tr(TXT[r.lv][2], TXT[r.lv][3]) }}</span>
      <span class="flex gap-1">
        <button type="button" data-tree-held-pick-on :aria-pressed="r.use === true" :class="[BTN, r.use === true ? 'bg-emerald-400/25 text-emerald-100 ring-emerald-300/80' : 'text-sim-body opacity-60 ring-white/20 hover:opacity-100']" @click.stop="setHeldPick(boxId, r.lv, true)">{{ tr("打つ", "Use") }}</button>
        <button type="button" data-tree-held-pick-off :aria-pressed="r.use === false" :class="[BTN, r.use === false ? 'bg-white/15 text-white ring-white/70' : 'text-sim-body opacity-60 ring-white/20 hover:opacity-100']" @click.stop="setHeldPick(boxId, r.lv, false)">{{ tr("打たない", "Skip") }}</button>
      </span>
    </div>
  </div>
</template>
