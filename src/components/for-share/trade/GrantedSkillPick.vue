<!--
  GrantedSkillPick.vue — 取引所で探す時の「付与スキル: どれでも / 各スキル」(共通管理 for-share、U-12f、スイッチ tradeSkill)。
  付与スキルを 1 つ選んで付くベース (嘆きの / 前兆の / 不在のアミュレット) の時だけ出す。選んだ英語の名前を v-model で返し、
  画面の側が取引所の検索 (buildSpecQuery の grantedSkill) に入れる。どれでも = null。ベースが替わって候補に無くなったら どれでも に戻す。
  オーナー 11-13「①採用」(シミュ部長 25 の案 a)。
-->
<script setup lang="ts">
import { computed, watch } from "vue";
import { tr } from "../../../i18n/lang";
import { grantedSkillsOf } from "./granted-skills";

const props = defineProps<{ base: string | null | undefined }>();
const skill = defineModel<string | null>({ default: null });
const list = computed(() => grantedSkillsOf(props.base));
watch(list, (l) => { if (skill.value && !l.some((k) => k.en === skill.value)) skill.value = null; }, { immediate: true });
</script>

<template>
  <label v-if="list.length" data-granted-skill class="flex items-center gap-1 text-[12px] text-[var(--exile-color-text-secondary)]" :title="tr('取引所の検索に付与スキルを入れる (このベースは付与スキルで値段が別物)', 'Include the granted skill in the trade search (prices differ by skill on this base)')">
    <span class="whitespace-nowrap">{{ tr("付与スキル", "Granted skill") }}</span>
    <select data-granted-skill-select class="h-[30px] max-w-[11rem] cursor-pointer rounded border bg-black/60 px-1.5 max-md:h-10" :class="skill ? 'border-amber-300/70 text-amber-100' : 'border-white/15 text-white/70'" :value="skill ?? ''" @change="skill = ($event.target as HTMLSelectElement).value || null">
      <option value="">{{ tr("どれでも", "Any") }}</option>
      <option v-for="k in list" :key="k.en" :value="k.en">{{ tr(k.ja, k.en) }}</option>
    </select>
  </label>
</template>
