<!--
  TreeGoalQuality.vue — 完成形の品質 (10-27 夕オーナー、モンキー 7「品質 +40% を入れる所が見当たらない」。スイッチ goalQuality)。
  既定はオフ (品質は見ない)。☑「品質も狙う」でオンにすると、エミュのクラフト台と同じ品質の帯 (StageQualityBar: 品質・上限・種類) で値を決める。
  ベースの最大品質 (アクセサリーは 20%) を超える品質は、途中でブリーチのエッセンス (essence:breach、品質の最大値 +20%) を付けて品質を上げる。
  品質はその後でブリーチの MOD が消えても残る (エンジンの applyCurrency で確かめた) ので、完成の狙いには足さない (狙いの枠を使わない)。
  オンの時だけ回す時に品質を見る (tree-unbounded の goalsHeld・tree-run の完成の箱。足りない人は止まり)
-->
<script setup lang="ts">
import { computed } from "vue";
import StageQualityBar from "../../craft-stage/StageQualityBar.vue";
import { craftStage as s } from "../../../state/craft-stage";
import { maxQualityOf, type StageItem } from "../../../services/craft-stage/engine";
import { essenceTarget } from "../../../services/craft-stage/apply-essence";
import { useTree } from "./use-tree";
import { tr } from "../../../i18n/lang";

const t = useTree();
const on = computed(() => !!t.doc.value.goalQualityOn);
/** 品質の帯に渡す完成形のアイテム (品質・上限・種類は完成形の設定の値) */
const item = computed((): StageItem | null => {
  const it = t.goalItem.value?.item, d = t.doc.value;
  return it ? { ...it, quality: d.goalQuality ?? 0, qualityCap: d.goalQualityCap ?? null, qualityTag: d.goalQualityTag ?? it.qualityTag ?? null } : null;
});
/** ベースの最大品質 (ブリーチの MOD 無し) */
const baseMax = computed(() => (t.goalItem.value ? maxQualityOf(t.goalItem.value.item) : 20));
/** このベースにブリーチのエッセンスの MOD があるか (エンジンの essenceTarget) */
const hasBreach = computed(() => { const d = s.data.value, it = t.goalItem.value?.item; if (!d || !it) return false; try { return !!essenceTarget(d, it, "essence:breach"); } catch { return false; } });
const over = computed(() => on.value && (t.doc.value.goalQuality ?? 0) > baseMax.value);
/** ☑ 品質も狙う (前の作りで狙いに足したブリーチの MOD があれば外す) */
function setOn(v: boolean): void {
  t.edit((d) => {
    if (v) d.goalQualityOn = true; else delete d.goalQualityOn;
    if ((d.memoAims ?? []).some((a) => a.forQuality)) d.memoAims = (d.memoAims ?? []).filter((a) => !a.forQuality);
  });
}
function setQuality(n: number, tag?: string): void { t.edit((d) => { if (n > 0) d.goalQuality = n; else delete d.goalQuality; if (tag) d.goalQualityTag = tag; }); }
function setCap(n: number): void { t.edit((d) => { d.goalQualityCap = n; if ((d.goalQuality ?? 0) > n) d.goalQuality = n; }); }
</script>

<template>
  <div data-tree-goal-quality class="flex flex-col gap-1 px-1 text-[12px]">
    <label class="flex min-h-7 cursor-pointer items-center gap-2 text-[#d8ccb4]">
      <input data-tree-goal-quality-on type="checkbox" :checked="on" @change="setOn(($event.target as HTMLInputElement).checked)" />{{ tr("品質も狙う", "Also aim for quality") }}
    </label>
    <StageQualityBar v-if="on && item" :item="item" @quality="setQuality" @cap="setCap" @catalyst="() => {}" />
    <p v-if="over && hasBreach" data-tree-goal-quality-breach class="break-words text-amber-200/90">{{ tr(`${baseMax}% を超えるには、途中でブリーチのエッセンス (品質の最大値 +20%) を付けて品質を上げる。その後でブリーチの MOD が消えても品質は残る (完成形の MOD の枠は使わない)`, `Above ${baseMax}% needs a Perfect Essence of the Breach (+20% to Maximum Quality) on the way to raise quality. The quality stays even if that mod is removed later (no final mod slot used)`) }}</p>
    <p v-else-if="over" data-tree-goal-quality-cant class="break-words text-rose-200/90">{{ tr(`このベースでは ${baseMax}% を超えられない (ブリーチのエッセンスが付かない)`, `This base can't go above ${baseMax}% (no Essence of the Breach)`) }}</p>
  </div>
</template>
