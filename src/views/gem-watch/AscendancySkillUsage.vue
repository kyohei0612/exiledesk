<!--
  AscendancySkillUsage.vue — アセンダンシー別のスキル使用率 (poe.ninja の全キャラ) (2026-09-29)
  オーナー「スキルに関しては使用率ランキングの自動監視に分かりやすく表示させるのが綺麗」。
  上位プレイヤー MOD 一覧の「スキル」欄にあった物をここへ移した (あちらはビルドごとの 10 人の中身だけを出す)。
  データは上位プレイヤー MOD 一覧の取得 (craftV2Store) のついでに取れている poe.ninja の集計。部品は SkillUsageCard をそのまま使う。
-->
<script setup lang="ts">
import { computed } from "vue";
import SkillUsageCard from "../../components/craft-v2/SkillUsageCard.vue";
import { craftV2Store } from "../../state/craft-v2-store";
import { TARGET_ASCENDANCY_COUNT } from "../craft-v2/helpers";

/**
 * klass = 使用率ランキングで選んでいるアセンダンシー (英語のクラス名)。2026-10-04 オーナー「使用率の 2 つの枠は一緒に、2 つ選択し合って
 * ややこしい」で、使用率ランキングの枠の中に入れ、選ぶのはランキングの選択 1 つに。全アセンダンシー ("") の時は「上で選ぶと出る」とだけ出す (選ぶ所は 1 つ)
 */
const props = defineProps<{ klass?: string | null }>();
const list = computed(() => [...craftV2Store.ascendancies].sort((a, b) => b.usagePercent - a.usagePercent).slice(0, TARGET_ASCENDANCY_COUNT));
const fixed = computed(() => (props.klass ? craftV2Store.ascendancies.find((a) => a.classEn === props.klass) ?? null : null));
const asc = computed(() => fixed.value);
</script>

<template>
  <div class="mt-5 border-t border-white/10 pt-4">
    <h3 class="mb-1 text-sm font-bold text-amber-100">スキルの使用率<span v-if="asc" class="ml-1.5 font-normal text-white/60">— {{ asc.name }}</span></h3>
    <p class="mb-3 text-[11px] text-white/45">poe.ninja に登録されている、そのアセンダンシーの全キャラの使用率 (上位プレイヤー MOD 一覧の取得と一緒に取れた物)。アセンダンシーは上の選択と同じ。</p>
    <SkillUsageCard v-if="asc" :ninja="asc.ninjaSkills ?? null" :skills="asc.skills" :sample-size="asc.sampleSize" :ascendancy-name="asc.name" />
    <p v-else-if="!klass" class="text-[12px] text-white/40">上の「アセンダンシー」でアセンダンシーを選ぶと、そのアセンダンシーのスキル使用率が出ます</p>
    <p v-else-if="list.length" class="text-[12px] text-white/40">このアセンダンシーのスキル使用率はまだ取れていません (上位プレイヤー MOD 一覧で取ったアセンダンシーだけ出ます)</p>
    <p v-else class="text-[12px] text-white/40">まだ取れていません (上位プレイヤー MOD 一覧の取得が終わると出ます)</p>
  </div>
</template>
