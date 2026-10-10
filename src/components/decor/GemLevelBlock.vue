<!--
  GemLevelBlock.vue — ジェムのカードの 1 レベル分 (コスト・クールダウン・効果など) (2026-09-26)
  本体・付随するスキル・別の型で同じ形。見出しの言葉はクライアントの ClientStrings に合わせる
  (コスト / リザーブ / キャストタイム / クールダウン時間 / アタックスピード 基本の◯% / クリティカルヒット率 …)。
-->
<script setup lang="ts">
import RichText from "./RichText.vue";
import type { GemLevelStats } from "../../services/gem-hover";
import { tr } from "../../i18n/lang";

defineProps<{ lv: GemLevelStats }>();
/** 秒 (ClientStrings の ItemDisplaySkillGemCastTimeValue「{0}秒」/「{0}s」) */
const sec = (v: number): string => tr(`${v}秒`, `${v}s`);
/** 基本の◯% (PercentageOfBase「基本の{0}%」/「{0}% of base」) */
const ofBase = (v: number): string => tr(`基本の${v}%`, `${v}% of base`);
</script>

<template>
  <p v-if="lv.cost" class="g-dim">{{ tr("コスト", "Cost") }}: <span class="g-white">{{ lv.cost }}</span></p>
  <p v-if="lv.mult && lv.mult !== 100" class="g-dim">{{ tr("コスト倍率", "Cost Multiplier") }}: <span class="g-white">{{ lv.mult }}%</span></p>
  <p v-if="lv.res" class="g-dim">{{ tr("リザーブ", "Reservation") }}: <span class="g-white">{{ lv.res }}</span></p>
  <p v-if="lv.cd" class="g-dim">{{ tr("クールダウン時間", "Cooldown Time") }}: <span class="g-white">{{ sec(lv.cd) }}<template v-if="lv.uses && lv.uses > 1"> {{ tr(`(${lv.uses}回使用可)`, `(${lv.uses} uses)`) }}</template></span></p>
  <p v-if="lv.cast" class="g-dim">{{ tr("キャストタイム", "Cast Time") }}: <span class="g-white">{{ sec(lv.cast) }}</span></p>
  <p v-if="lv.atk" class="g-dim">{{ tr("アタックタイム", "Attack Time") }}: <span class="g-white">{{ sec(lv.atk) }}</span></p>
  <p v-if="lv.as" class="g-dim">{{ tr("アタックスピード", "Attack Speed") }}: <span class="g-white">{{ ofBase(lv.as) }}</span></p>
  <p v-if="lv.dmg" class="g-dim">{{ tr("アタックダメージ", "Attack Damage") }}: <span class="g-white">{{ ofBase(lv.dmg) }}</span></p>
  <p v-if="lv.crit" class="g-dim">{{ tr("クリティカルヒット率", "Critical Hit Chance") }}: <span class="g-white">{{ lv.crit }}%</span></p>
  <p v-for="(t, i) in lv.tb ?? []" :key="'t' + i" class="g-dim"><RichText :text="t" /></p>
  <p v-for="(st, i) in lv.stats ?? []" :key="'s' + i" class="g-mod"><RichText :text="st" /></p>
</template>
