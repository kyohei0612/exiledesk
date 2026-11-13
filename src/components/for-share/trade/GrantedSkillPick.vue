<!--
  GrantedSkillPick.vue — 取引所で探す時の「付与スキル: どれでも / 各スキル」(共通管理 for-share、U-12f、スイッチ tradeSkill)。
  付与スキルを 1 つ選んで付くベース (嘆きの / 前兆の / 不在のアミュレット) の時だけ出す。選んだ英語の名前を v-model で返し、
  画面の側が取引所の検索 (buildSpecQuery の grantedSkill) に入れる。どれでも = null。ベースが替わって候補に無くなったら どれでも に戻す。
  オーナー 11-13「①採用」(シミュ部長 25 の案 a)。
-->
<script setup lang="ts">
import { computed, watch } from "vue";
import { tr } from "../../../i18n/lang";
import { flag } from "../../../web/release-flags";
import { grantedSkillsOf } from "./granted-skills";

const props = defineProps<{ base: string | null | undefined }>();
const skill = defineModel<string | null>({ default: null });
const list = computed(() => grantedSkillsOf(props.base));
/**
 * 品の上の帯の 1 行目 (StageQualityBar の上限・種類を選ぶ) と同じ高さ・字・枠に (U-12h、スイッチ qbarOneLine、オーナー 11-13「付与スキル太いな1行目と同じ太さでおｋ」)。
 * 閉じている間は前の形 (高さ 30・スマホ 40)
 */
const SLIM = flag("qbarOneLine");
const labelCls = SLIM ? "text-[11px] leading-none text-white/60" : "text-[12px] text-[var(--exile-color-text-secondary)]";
const selCls = SLIM ? "h-6 max-w-[11rem] cursor-pointer rounded border bg-black/60 px-1" : "h-[30px] max-w-[11rem] cursor-pointer rounded border bg-black/60 px-1.5 max-md:h-10";
const onCls = "border-amber-300/70 text-amber-100";
const offCls = SLIM ? "border-white/15 text-white/80" : "border-white/15 text-white/70";
watch(list, (l) => { if (skill.value && !l.some((k) => k.en === skill.value)) skill.value = null; }, { immediate: true });
</script>

<template>
  <label v-if="list.length" data-granted-skill class="flex items-center gap-1" :class="labelCls" :title="tr('取引所の検索に付与スキルを入れる (このベースは付与スキルで値段が別物)', 'Include the granted skill in the trade search (prices differ by skill on this base)')">
    <span class="whitespace-nowrap">{{ tr("付与スキル", "Granted skill") }}</span>
    <select data-granted-skill-select :class="[selCls, skill ? onCls : offCls]" :value="skill ?? ''" @change="skill = ($event.target as HTMLSelectElement).value || null">
      <option value="">{{ tr("どれでも", "Any") }}</option>
      <option v-for="k in list" :key="k.en" :value="k.en">{{ tr(k.ja, k.en) }}</option>
    </select>
  </label>
</template>
