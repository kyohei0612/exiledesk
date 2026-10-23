<!--
  ModeTabs.vue — 上の切り替えタブの帯 (エミュレーター / シミュレーター)。どの画面にも同じ作りで出すページの枠 (2026-10-23 オーナー
  「シミュへ移るとエミュのタブが消え、戻るとシミュのタブが消える。帯を 1 つにして両方に」)。
  - エミュレーター = クラフトステージ (/)、シミュレーター = クラフトの道 (?page=sim-tree)。押すとそのページへ (ブラウザの戻るは page.ts の履歴)
  - シミュレーターのタブは開発版だけ (TREE_ON。本番はまだ出さない)
  - 今いる方が選ばれた見た目。active で上書きできる (エミュの画面でジェムコラプトを開いている時は null = どちらも選ばない)
  - その画面だけのタブ (エミュのジェムコラプト・アプリのチュートリアル) は既定の slot で後ろに足す
  使い方: <ModeTabs @pick="(m) => …画面の後片付け" ><button class="g-tab">…</button></ModeTabs>
-->
<script setup lang="ts">
import { computed } from "vue";
import { tr } from "../../i18n/lang";
import { TREE_ON, treePage } from "../../state/web-page";
import { openTreePage } from "../../web/page";

type Mode = "hand" | "sim";
const props = defineProps<{ active?: Mode | null }>();
const emit = defineEmits<{ pick: [Mode] }>();

const on = computed((): Mode | null => (props.active !== undefined ? props.active : treePage.value ? "sim" : "hand"));
function pick(m: Mode): void {
  if (m === "sim") openTreePage();
  else treePage.value = false;
  emit("pick", m);
}
const TAB = "g-tab min-w-[170px] gap-1.5 !inline-flex max-md:min-w-0 max-md:flex-1 max-md:!px-1 max-md:!text-[12px]";
</script>

<template>
  <div data-mode-tabs class="inline-flex gap-1 max-md:flex max-md:w-full" role="tablist">
    <button type="button" role="tab" data-mode-tab="hand" :aria-selected="on === 'hand'" :class="[TAB, on === 'hand' ? 'on' : '']" @click="pick('hand')">{{ tr("エミュレーター", "Emulator") }}</button>
    <button v-if="TREE_ON" type="button" role="tab" data-mode-tab="sim" :aria-selected="on === 'sim'" :class="[TAB, on === 'sim' ? 'on' : '']" @click="pick('sim')">
      {{ tr("シミュレーター", "Simulator") }}<span class="text-[10px] font-normal opacity-70" :title="tr('作り込み中の機能', 'Still in development')">β</span>
    </button>
    <slot />
  </div>
</template>
