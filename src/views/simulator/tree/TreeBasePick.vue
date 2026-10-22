<!--
  TreeBasePick.vue — 0 完成形の設定の重ね窓 (TreeGoalPage.vue) の 1 の上の行: レアリティとアイテムレベル (適正) (2026-10-22)。
  ベースはこの下の BaseCatalog で選ぶ。アイテムレベルだけ替えるなら木はそのまま。数字は常に出す、? で説明 (オーナー 10-22)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import NumStep from "../../../components/NumStep.vue";
import HelpTip from "../../../components/ui/HelpTip.vue";
import { startOf } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";
import { useTree } from "./use-tree";

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
const rarity = computed(() => startOf(t.doc.value).rarity);
</script>

<template>
  <div data-tree-base-pick class="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
    <span class="flex items-center gap-2">
      <span>{{ tr("レアリティ", "Rarity") }}</span>
      <button v-for="r in (['rare', 'magic'] as const)" :key="r" type="button" :data-tree-rarity="r" class="g-tab !min-h-[28px] !px-3 !text-[12px]" :class="rarity === r ? 'on' : ''" @click="t.setRarity(r)">{{ r === "rare" ? tr("レア", "Rare") : tr("マジック", "Magic") }}</button>
    </span>
    <label class="flex items-center gap-2">
      <span class="flex items-center gap-1">{{ tr("アイテムレベル", "Item level") }}<HelpTip :text="tr('適正 = 完成の狙い (と当たりの箱・始まりの MOD) の段が全部付く一番低いアイテムレベル。狙いを足す・替えるたびに自動で変わる (新しいツリーは適正から)。数字を入れるとその数で決まり、適正は外れる。もう一度「適正」を押すと自動に戻る', 'Fit = the lowest item level where every final target tier (and hit boxes, starting mods) can roll. It updates as you add or change targets (new trees start on Fit). Typing a number sets it and turns Fit off; press “Fit” again to go back to automatic')" /></span>
      <!-- 左端に適正、数字は常に出す (適正の間は自動の値)。数字を触ったらその数で決まり、適正は外れる (オーナー 10-22) -->
      <button type="button" data-tree-ilvl-fit class="g-tab !min-h-[28px] !px-2.5 !text-[12px]" :class="t.doc.value.ilvlFit ? 'on' : ''" :title="tr('狙いの MOD の段が全部付く一番低いレベルに自動で合わせる (狙いを足すたびに変わる)', 'Follow the lowest level where every target tier can roll (updates as you add targets)')" @click="useFit">{{ tr("適正", "Fit") }}</button>
      <NumStep :model-value="t.doc.value.ilvlFit ? t.doc.value.itemLevel : ilvl" integer width="w-20" :placeholder-value="t.doc.value.itemLevel" @update:model-value="setIlvl" />
    </label>
  </div>
</template>
