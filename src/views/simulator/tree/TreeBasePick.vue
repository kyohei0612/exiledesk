<!--
  TreeBasePick.vue — ツリーの右の欄: 木のアイテムレベル (適正) と、ベースを選ぶ 1 画面 (TreeBasePage.vue) への入口 (2026-10-22)。
  ベースはこの欄の中では選ばない (オーナー 10-22「エミュと同じくベースを選ぶ 1 画面へ行って選び、ツリーに戻る」)。アイテムレベルだけ替えるなら木はそのまま
-->
<script setup lang="ts">
import { ref } from "vue";
import NumStep from "../../../components/NumStep.vue";
import HelpTip from "../../../components/ui/HelpTip.vue";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { tr } from "../../../i18n/lang";
import { useTree } from "./use-tree";

const emit = defineEmits<{ close: [] }>();
const t = useTree();

const ILVL_MIN = 1;
const ILVL_MAX = 100;
const ilvl = ref<number | null>(t.doc.value.itemLevel);
/** 欄の数を木へ (範囲の外・空欄は入れない) */
function setIlvl(v: number | null): void {
  ilvl.value = v;
  if (v === null || v < ILVL_MIN || v > ILVL_MAX) return;
  if (t.doc.value.ilvlFit) t.setFit(false); // 手で入れたら適正から外れる
  t.setBase(t.doc.value.base, Math.round(v));
}
/** 適正に戻す (狙いの段が全部付く一番低いレベルに自動で合わせる) */
function useFit(): void { t.setFit(true); ilvl.value = t.doc.value.itemLevel; }
/** ベースを選ぶ 1 画面へ (欄は閉じる) */
function toBasePage(): void { t.basePage.value = true; emit("close"); }
</script>

<template>
  <div data-tree-base-pick class="flex shrink-0 flex-col gap-3">
    <div class="flex items-center gap-2">
      <b class="flex-1 text-[14px]">{{ tr("ベースとアイテムレベル", "Base and item level") }}</b>
      <button type="button" class="g-btn sm" @click="emit('close')">{{ tr("閉じる", "Close") }}</button>
    </div>
    <div class="flex items-center gap-2 text-[13px]">
      <span class="min-w-0 flex-1 truncate">{{ tr("ベース", "Base") }}: <b>{{ tr(jaTypeName(t.doc.value.base), t.doc.value.base) }}</b></span>
      <button type="button" data-tree-base-open class="g-btn sm" @click="toBasePage">{{ tr("ベースを選ぶ →", "Choose a base →") }}</button>
    </div>
    <label class="flex items-center gap-2 text-[13px]">
      <span class="flex flex-1 items-center gap-1">{{ tr("アイテムレベル", "Item level") }}<HelpTip :text="tr('適正 = このツリーの狙い (当たりの箱・始まりの MOD・欲しい MOD のメモ) の段が全部付く一番低いアイテムレベル。狙いを足す・替えるたびに自動で変わる (新しいツリーは適正から)。数字を入れるとその数で決まり、適正は外れる。もう一度「適正」を押すと自動に戻る', 'Fit = the lowest item level where every target tier in this tree (hit boxes, starting mods, wanted-mod notes) can roll. It updates as you add or change targets (new trees start on Fit). Typing a number sets it and turns Fit off; press “Fit” again to go back to automatic')" /></span>
      <!-- 左端に適正、数字は常に出す (適正の間は自動の値)。数字を触ったらその数で決まり、適正は外れる (オーナー 10-22) -->
      <button type="button" data-tree-ilvl-fit class="g-tab !min-h-[28px] !px-2.5 !text-[12px]" :class="t.doc.value.ilvlFit ? 'on' : ''" :title="tr('狙いの MOD の段が全部付く一番低いレベルに自動で合わせる (狙いを足すたびに変わる)', 'Follow the lowest level where every target tier can roll (updates as you add targets)')" @click="useFit">{{ tr("適正", "Fit") }}</button>
      <NumStep :model-value="t.doc.value.ilvlFit ? t.doc.value.itemLevel : ilvl" integer width="w-20" :placeholder-value="t.doc.value.itemLevel" @update:model-value="setIlvl" />
    </label>
  </div>
</template>
