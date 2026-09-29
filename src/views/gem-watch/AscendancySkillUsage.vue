<!--
  AscendancySkillUsage.vue — アセンダンシー別のスキル使用率 (poe.ninja の全キャラ) (2026-09-29)
  オーナー「スキルに関しては使用率ランキングの自動監視に分かりやすく表示させるのが綺麗」。
  上位プレイヤー MOD 一覧の「スキル」欄にあった物をここへ移した (あちらはビルドごとの 10 人の中身だけを出す)。
  データは上位プレイヤー MOD 一覧の取得 (craftV2Store) のついでに取れている poe.ninja の集計。部品は SkillUsageCard をそのまま使う。
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import SkillUsageCard from "../../components/craft-v2/SkillUsageCard.vue";
import { craftV2Store } from "../../state/craft-v2-store";
import { TARGET_ASCENDANCY_COUNT } from "../craft-v2/helpers";

const list = computed(() => [...craftV2Store.ascendancies].sort((a, b) => b.usagePercent - a.usagePercent).slice(0, TARGET_ASCENDANCY_COUNT));
const picked = ref<string>("");
const asc = computed(() => list.value.find((a) => a.id === picked.value) ?? list.value[0] ?? null);
</script>

<template>
  <section class="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
    <h2 class="mb-1 text-sm font-bold text-amber-100">アセンダンシー別のスキル使用率</h2>
    <p class="mb-3 text-[11px] text-white/45">poe.ninja に登録されている、そのアセンダンシーの全キャラの使用率 (上位プレイヤー MOD 一覧の取得と一緒に取れた物)。</p>
    <div v-if="list.length" class="mb-3 flex flex-wrap gap-1.5">
      <button
        v-for="a in list"
        :key="a.id"
        type="button"
        class="rounded-md px-2.5 py-1 text-[12px] ring-1 transition"
        :class="asc?.id === a.id ? 'bg-amber-400/15 text-amber-100 ring-amber-300/60' : 'bg-white/5 text-white/70 ring-white/10 hover:bg-white/10'"
        @click="picked = a.id"
      >
        {{ a.name }} <span class="tabular-nums text-white/40">{{ a.usagePercent.toFixed(1) }}%</span>
      </button>
    </div>
    <SkillUsageCard v-if="asc" :ninja="asc.ninjaSkills ?? null" :skills="asc.skills" :sample-size="asc.sampleSize" :ascendancy-name="asc.name" />
    <p v-else class="text-[12px] text-white/40">まだ取れていません (上位プレイヤー MOD 一覧の取得が終わると出ます)</p>
  </section>
</template>
