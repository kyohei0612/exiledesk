<!--
  PhoneViewBranch.vue — シミュのスマホの道の、枝が分かれる手の札 (S-94h、スイッチ phoneView。オーナー 11-01「枝分かれ時はそのカレンシーの所でプルダウンでつくＭＯＤを表示させて表示させたらきもちいやろ」)。
  手の札そのものがプルダウン: 押すと各枝で付く MOD の一覧、選ぶと札の中に選んだ MOD が出て下の道が替わる。枠の外・Esc は選ぶ前のまま閉じる (U-20)
-->
<script setup lang="ts">
import { ref } from "vue";
import { BOX_W, type Hand } from "../../../services/simulator/tree/tree-model";
import TreeHandChip from "../tree/TreeHandChip.vue";
import { useDismiss } from "../../../utils/use-dismiss";
import { tr } from "../../../i18n/lang";

defineProps<{ id: string; hand: Hand | null; split?: number; labels: string[]; at: number }>();
const emit = defineEmits<{ pick: [i: number] }>();
const open = ref(false);
const root = ref<HTMLElement | null>(null);
useDismiss(() => open.value, [root], () => { open.value = false; }, { always: true });
function pick(i: number): void { open.value = false; emit("pick", i); }
</script>

<template>
  <div ref="root" data-phone-view-branch class="absolute inset-x-0 top-0 h-[68px]">
    <TreeHandChip :id="id" :hand="hand" :split="split" :x="BOX_W / 2" :y="34" :inv="1" off :room="BOX_W" :choice="labels[at]" />
    <button type="button" data-phone-view-branch-open class="absolute inset-0 z-[6]" aria-haspopup="listbox" :aria-expanded="open" :aria-label="tr('付く MOD を選ぶ', 'Choose the mod')" @click="open = !open" />
    <div v-if="open" data-phone-view-branch-list role="listbox" class="absolute inset-x-0 top-full z-20 flex flex-col gap-1 rounded-lg border border-[var(--exile-color-border-brass)]/60 bg-[#14110d] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.7)]">
      <button v-for="(l, i) in labels" :key="i" type="button" role="option" data-phone-view-branch-item :aria-selected="i === at" class="min-h-11 break-words rounded px-2 py-1 text-left text-[14px]" :class="i === at ? 'bg-amber-400/20 font-bold text-amber-100' : 'text-sim-body'" @click="pick(i)">{{ l }}</button>
    </div>
  </div>
</template>
