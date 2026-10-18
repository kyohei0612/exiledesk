<!--
  StageForesight.vue — ヒネコラの髪束の予見 (CraftStage.vue から分けた、2026-10-18 500 行の決まり)。
  持っているカレンシーを打った時の結果 (次の手の seed で引くので、打つとこの通りになる)
-->
<script setup lang="ts">
import { craftStage as s, nameOf } from "../../state/craft-stage";
import { tr } from "../../i18n/lang";
</script>

<template>
  <div v-if="s.foresight.value" class="w-[380px] max-md:w-full rounded-xl border border-violet-400/50 bg-violet-500/10 p-3 text-[12px]">
    <p class="mb-1 font-bold text-violet-200">{{ tr(`予見: ${nameOf(s.foresight.value.key)} を使うと`, `Foreseen: using ${nameOf(s.foresight.value.key)}`) }}</p>
    <p v-if="!s.foresight.value.applied" class="text-rose-300">{{ tr("使えない", "Can't use") }} — {{ s.foresight.value.reason }}</p>
    <template v-else>
      <p v-for="(t, i) in s.foresight.value.added" :key="'fa' + i" class="text-emerald-300">{{ tr('＋', '+') }} {{ t }}</p>
      <p v-for="(t, i) in s.foresight.value.removed" :key="'fr' + i" class="text-rose-300 line-through">{{ tr('－', '-') }} {{ t }}</p>
      <p v-if="s.foresight.value.after.destroyed" class="font-bold text-rose-400">{{ tr("壊れる", "Destroyed") }}</p>
      <p v-if="s.foresight.value.after.corrupted && !s.item.value?.corrupted" class="font-bold text-[#d20000]">{{ tr("コラプトする", "Corrupted") }}</p>
      <p v-if="!s.foresight.value.added.length && !s.foresight.value.removed.length && !s.foresight.value.after.destroyed" class="opacity-60">{{ tr("MOD は変わらない", "No mod change") }}</p>
    </template>
  </div>
</template>
