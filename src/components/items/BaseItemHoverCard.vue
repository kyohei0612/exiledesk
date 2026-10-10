<!--
  BaseItemHoverCard.vue — ベースに乗せた時のカード (2026-10-10 オーナー「ベースについてるスキルとか暗黙とか足りてない」「ゲームで表示通りに」
  「カードの中身の挙動は全てジェムと同じカードの出し方で、あっちを変えたらこっちも変わるように」)。
  枠・位置・ピン留め・重なりはジェムのカードと同じ GameItemCard + hover-stack。付与スキルの名前に乗せるとジェムのカードが上に重なる。
  並びはゲームのアイテム画面: 種類 → 性能 (ダメージ・防御・スピリット・付与スキル) → 装備条件 → 暗黙。中身は [[base-info.json]] (scripts/build-base-info.mjs)
-->
<script setup lang="ts">
import { computed } from "vue";
import GameItemCard from "../decor/GameItemCard.vue";
import RichText from "../decor/RichText.vue";
import GemName from "../decor/GemName.vue";
import baseInfo from "../../data/base-info.json";
import { htcBaseInfo } from "../../services/htc/patch";
import { baseStatsOf } from "../../services/craft-stage/stage-bases";
import { classJa } from "../../services/items/base-catalog";
import { jaTypeName } from "../../services/trade2/localize";
import { gemHoverOf, loadGemHover } from "../../services/gem-hover";
import { lang, tr } from "../../i18n/lang";

const props = defineProps<{ en: string; x: number; y: number; layerKey: number; pinned: boolean; z: number }>();
void loadGemHover();
type Info = { lv?: number; str?: number; dex?: number; int?: number; spirit?: number; reload?: number; range?: number; block?: number; skills?: string[] };
const info = computed<Info>(() => (baseInfo as Record<string, Info>)[props.en] ?? {});
const htc = computed(() => htcBaseInfo()[props.en]);
const st = computed(() => baseStatsOf(props.en));
const en = computed(() => lang.value === "en");
const name = computed(() => (en.value ? props.en : htc.value?.ja ?? jaTypeName(props.en)));
const cls = computed(() => { const c = htc.value?.cls ?? st.value?.cls ?? ""; return !c ? "" : en.value ? (st.value?.cls ?? c).replace(/_/g, " ") : classJa(c, false); });
const num = (v: number | [number, number] | undefined): string => (v == null ? "" : Array.isArray(v) ? (v[0] === v[1] ? `${v[0]}` : `${v[0]}-${v[1]}`) : `${v}`);

/** 性能の行 (ゲームの順: ダメージ → クリティカル → 秒間アタック → 再装填 → 防御 → ブロック → スピリット)。見出しはゲームの文 (ClientStrings) */
const props2 = computed(() => {
  const s = st.value, i = info.value, out: Array<{ k: string; v: string }> = [];
  if (s?.phys) out.push({ k: tr("物理ダメージ", "Physical Damage"), v: `${s.phys[0]}-${s.phys[1]}` });
  if (s?.crit && s.phys) out.push({ k: tr("クリティカルヒット率", "Critical Hit Chance"), v: `${s.crit.toFixed(2)}%` });
  if (s?.aps) out.push({ k: tr("秒間アタック回数", "Attacks per Second"), v: s.aps.toFixed(2) });
  if (i.reload) out.push({ k: tr("再装填時間", "Reload Time"), v: (i.reload / 1000).toFixed(2) });
  if (s?.armour) out.push({ k: tr("アーマー", "Armour"), v: num(s.armour) });
  if (s?.evasion) out.push({ k: tr("回避力", "Evasion Rating"), v: num(s.evasion) });
  if (s?.es) out.push({ k: tr("エナジーシールド", "Energy Shield"), v: num(s.es) });
  const block = i.block ?? s?.block;
  if (block) out.push({ k: tr("ブロック率", "Block chance"), v: `${block}%` });
  if (i.spirit) out.push({ k: tr("スピリット", "Spirit"), v: `${i.spirit}` });
  return out;
});
/** 装備条件 (ゲーム: 「装備条件：レベル 16、知性 31」) */
const req = computed(() => {
  const i = info.value, lv = htc.value?.lvl ?? i.lv ?? 0;
  const parts = [lv ? tr(`レベル ${lv}`, `Level ${lv}`) : "", i.str ? tr(`筋力 ${i.str}`, `${i.str} Str`) : "", i.dex ? tr(`器用さ ${i.dex}`, `${i.dex} Dex`) : "", i.int ? tr(`知性 ${i.int}`, `${i.int} Int`) : ""].filter(Boolean);
  return parts.join(tr("、", ", "));
});
const implicits = computed(() => (htc.value?.implicits ?? []).map((m) => (en.value ? (m as { en?: string }).en ?? m.ja : m.ja)));
const skills = computed(() => (info.value.skills ?? []).map((s) => ({ en: s, label: en.value ? s : gemHoverOf(s)?.n ?? s })));
</script>

<template>
  <GameItemCard :show="true" :x="x" :y="y" :name="name" tone="normal" :width="380" :layer-key="layerKey" :pinned="pinned" :z="z">
    <p v-if="cls" class="g-dim text-[12px]">{{ cls }}</p>
    <p v-for="p in props2" :key="p.k" class="g-dim">{{ p.k }}: <span class="g-white">{{ p.v }}</span></p>
    <!-- 付与スキル: 名前に乗せるとジェムのカード (いくつかから 1 つの首飾りは全部並べる) -->
    <p v-if="skills.length" class="g-dim">
      {{ tr("スキルを付与", "Grants Skill") }}{{ skills.length > 1 ? tr(" (いずれか 1 つ)", " (one of)") : "" }}:
      <template v-for="(s, i) in skills" :key="s.en"><span v-if="i" class="g-dim">{{ tr("、", ", ") }}</span><span class="g-white"><GemName :en="s.en" :label="s.label" /></span></template>
    </p>
    <template v-if="req">
      <div class="g-sep" />
      <p class="g-dim">{{ tr("装備条件：", "Requires: ") }}<span class="g-white">{{ req }}</span></p>
    </template>
    <template v-if="implicits.length">
      <div class="g-sep" />
      <p v-for="(m, i) in implicits" :key="i" class="g-mod"><RichText :text="m" /></p>
    </template>
  </GameItemCard>
</template>
