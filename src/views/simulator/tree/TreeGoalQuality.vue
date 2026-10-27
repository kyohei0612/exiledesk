<!--
  TreeGoalQuality.vue — 完成形の品質の欄 (10-27 夕オーナー、モンキー 7「品質 +40% を入れる所が見当たらない」。スイッチ goalShape)。
  ベースの最大品質 (アクセサリーは 20%) を超える品質は、途中でブリーチのエッセンス (essence:breach、品質の最大値 +20%) を付けて品質を上げる。
  品質はその後でブリーチの MOD が消えても残る (エンジンの applyCurrency で確かめた、10-27 夕) ので、完成の狙いには足さない (狙いの枠を使わない)。
  完成の判定は品質の値で見る (tree-unbounded の goalsHeld)。ブリーチの MOD が付かないベースは「このベースでは超えられない」
-->
<script setup lang="ts">
import { computed } from "vue";
import NumStep from "../../../components/NumStep.vue";
import { craftStage as s } from "../../../state/craft-stage";
import { maxQualityOf, type StageItem } from "../../../services/craft-stage/engine";
import { essenceTarget } from "../../../services/craft-stage/apply-essence";
import { useTree } from "./use-tree";
import { tr } from "../../../i18n/lang";

const t = useTree();
/** 完成形のカードのアイテム (ベースの最大品質を見る) */
const item = computed((): StageItem | null => t.goalItem.value?.item ?? null);
const baseMax = computed(() => (item.value ? maxQualityOf(item.value) : 20));
/** このベースにブリーチのエッセンスの MOD があるか (エンジンの essenceTarget) */
const hasBreach = computed(() => { const d = s.data.value, it = item.value; if (!d || !it) return false; try { return !!essenceTarget(d, it, "essence:breach"); } catch { return false; } });
const q = computed(() => t.doc.value.goalQuality ?? null);
const over = computed(() => (q.value ?? 0) > baseMax.value);
/** 品質を決める (1 回の編集)。前の作り (b18ffaca) で狙いに足したブリーチの MOD があれば外す */
function setQ(v: number | null): void {
  t.edit((d) => {
    if (v === null || v <= 0) delete d.goalQuality; else d.goalQuality = Math.round(v);
    if ((d.memoAims ?? []).some((a) => a.forQuality)) d.memoAims = (d.memoAims ?? []).filter((a) => !a.forQuality);
  });
}
</script>

<template>
  <div data-tree-goal-quality class="flex flex-col gap-1 px-1 text-[12px]">
    <label class="flex items-center gap-2">
      <span class="text-[#d8ccb4]">{{ tr("品質", "Quality") }}</span>
      <NumStep :model-value="q" integer width="w-20" :placeholder-value="baseMax" @update:model-value="setQ" />
      <span class="opacity-70">%</span>
      <span class="opacity-60">{{ tr(`(ベースの最大 ${baseMax}%)`, `(base max ${baseMax}%)`) }}</span>
    </label>
    <p v-if="over && hasBreach" data-tree-goal-quality-breach class="break-words text-amber-200/90">{{ tr(`${baseMax}% を超えるには、途中でブリーチのエッセンス (品質の最大値 +20%) を付けて品質を上げる。その後でブリーチの MOD が消えても品質は残る (完成形の MOD の枠は使わない)`, `Above ${baseMax}% needs a Perfect Essence of the Breach (+20% to Maximum Quality) on the way to raise quality. The quality stays even if that mod is removed later (no final mod slot used)`) }}</p>
    <p v-else-if="over" data-tree-goal-quality-cant class="break-words text-rose-200/90">{{ tr(`このベースでは ${baseMax}% を超えられない (ブリーチのエッセンスが付かない)`, `This base can't go above ${baseMax}% (no Essence of the Breach)`) }}</p>
  </div>
</template>
