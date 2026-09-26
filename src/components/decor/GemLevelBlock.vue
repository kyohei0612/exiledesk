<!--
  GemLevelBlock.vue — ジェムのカードの 1 レベル分 (コスト・クールダウン・効果など) (2026-09-26)
  本体・付随するスキル・別の型で同じ形。見出しの言葉はクライアントの ClientStrings に合わせる
  (コスト / リザーブ / キャストタイム / クールダウン時間 / アタックスピード 基本の◯% / クリティカルヒット率 …)。
-->
<script setup lang="ts">
import RichText from "./RichText.vue";
import type { GemLevelStats } from "../../services/gem-hover";

defineProps<{ lv: GemLevelStats }>();
</script>

<template>
  <p v-if="lv.cost" class="g-dim">コスト: <span class="g-white">{{ lv.cost }}</span></p>
  <p v-if="lv.mult && lv.mult !== 100" class="g-dim">コスト倍率: <span class="g-white">{{ lv.mult }}%</span></p>
  <p v-if="lv.res" class="g-dim">リザーブ: <span class="g-white">{{ lv.res }}</span></p>
  <p v-if="lv.cd" class="g-dim">クールダウン時間: <span class="g-white">{{ lv.cd }}秒<template v-if="lv.uses && lv.uses > 1"> ({{ lv.uses }}回使用可)</template></span></p>
  <p v-if="lv.cast" class="g-dim">キャストタイム: <span class="g-white">{{ lv.cast }}秒</span></p>
  <p v-if="lv.atk" class="g-dim">アタックタイム: <span class="g-white">{{ lv.atk }}秒</span></p>
  <p v-if="lv.as" class="g-dim">アタックスピード: <span class="g-white">基本の{{ lv.as }}%</span></p>
  <p v-if="lv.dmg" class="g-dim">アタックダメージ: <span class="g-white">基本の{{ lv.dmg }}%</span></p>
  <p v-if="lv.crit" class="g-dim">クリティカルヒット率: <span class="g-white">{{ lv.crit }}%</span></p>
  <p v-for="(t, i) in lv.tb ?? []" :key="'t' + i" class="g-dim"><RichText :text="t" /></p>
  <p v-for="(st, i) in lv.stats ?? []" :key="'s' + i" class="g-mod"><RichText :text="st" /></p>
</template>
