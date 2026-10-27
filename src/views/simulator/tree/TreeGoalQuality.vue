<!--
  TreeGoalQuality.vue — 完成形の品質の欄 (10-27 夕オーナー、モンキー 7「品質 +40% を入れる所が見当たらない」。スイッチ goalShape)。
  ベースの最大品質 (アクセサリーは 20%) を超える品質は、ブリーチのエッセンス (essence:breach、品質の最大値 +20%) の MOD が要る。
  超えたらその MOD を完成の狙いに足す (印 forQuality、狙いの MOD として 1 枠を使う = エンジンのエッセンスの MOD と同じ数え方)。最大以下に戻すと外す。
  ブリーチの MOD が付かないベースは「このベースでは超えられない」
-->
<script setup lang="ts">
import { computed } from "vue";
import NumStep from "../../../components/NumStep.vue";
import { craftStage as s } from "../../../state/craft-stage";
import { maxQualityOf, useReason, type StageItem } from "../../../services/craft-stage/engine";
import type { Aim } from "../../../services/simulator/tree/tree-model";
import { essenceAimsOf, handOf } from "./tree-hand-plan";
import { useTree } from "./use-tree";
import { tr } from "../../../i18n/lang";

const t = useTree();
const BREACH = "essence:breach";
/** 完成形のカードのアイテム (品質の上限を見る。ブリーチの MOD が付いていれば +20%) */
const item = computed((): StageItem | null => t.goalItem.value?.item ?? null);
/** ブリーチの MOD を除いた最大品質 (= ベースの最大) */
const baseMax = computed(() => { const it = item.value; if (!it) return 20; const own = forQualityAim.value; return own ? maxQualityOf({ ...it, prefixes: it.prefixes.filter((m) => m.modId !== own.modId), suffixes: it.suffixes.filter((m) => m.modId !== own.modId) }) : maxQualityOf(it); });
const forQualityAim = computed((): Aim | null => (t.doc.value.memoAims ?? []).find((a) => a.forQuality) ?? null);
/** このベースで付くブリーチの MOD (狙いの形、エンジンで打った結果から) */
const breachAim = computed((): Aim | null => {
  const d = s.data.value, it = item.value;
  if (!d || !it) return null;
  try { return essenceAimsOf(d, it, handOf({ held: BREACH, omens: [], spam: false, spamMax: null, free: false })).find((a) => !it.prefixes.concat(it.suffixes).some((m) => m.modId === a.modId)) ?? forQualityAim.value; } catch { return forQualityAim.value; }
});
/** ブリーチのエッセンスが打てない理由 (エンジンの useReason。エッセンスの MOD は 1 つまで など) */
const why = computed((): string | null => { const d = s.data.value, it = item.value; if (!d || !it) return null; try { return useReason(d, it, BREACH); } catch { return null; } });
const q = computed(() => t.doc.value.goalQuality ?? null);
const over = computed(() => (q.value ?? 0) > baseMax.value);
/** 品質を決める。最大を超えたらブリーチの MOD を狙いに足し、戻したら外す (1 回の編集) */
function setQ(v: number | null): void {
  const b = breachAim.value;
  t.edit((d) => {
    if (v === null || v <= 0) delete d.goalQuality; else d.goalQuality = Math.round(v);
    const list = (d.memoAims ?? []).filter((a) => !a.forQuality);
    if (v !== null && v > baseMax.value && b) list.push({ modId: b.modId, tier: b.tier, forQuality: true });
    d.memoAims = list;
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
    <p v-if="over && breachAim" data-tree-goal-quality-breach class="break-words text-amber-200/90">{{ tr(`${baseMax}% を超えるにはブリーチのエッセンス (品質の最大値 +20%) が要る。MOD の 1 枠を使う (完成の狙いに足した)`, `Above ${baseMax}% needs a Perfect Essence of the Breach (+20% to Maximum Quality). It uses one mod slot (added to the final mods)`) }}</p>
    <p v-else-if="over" data-tree-goal-quality-cant class="break-words text-rose-200/90">{{ tr(`${baseMax}% を超えられない: ブリーチのエッセンスが打てない (${why ?? "このベースには付かない"})`, `Can't go above ${baseMax}%: the Essence of the Breach can't be used (${why ?? "not on this base"})`) }}</p>
  </div>
</template>
