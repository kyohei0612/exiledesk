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
import GemIcon from "../decor/GemIcon.vue";
import { baseArt } from "../../services/craft-stage/base-art";
import baseInfo from "../../data/base-info.json";
import grantedSkills from "../../data/granted-skills.json";
import { htcBaseInfo } from "../../services/htc/patch";
import { baseStatsOf } from "../../services/craft-stage/stage-bases";
import { classEn, classJa } from "../../services/items/base-catalog";
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
const cls = computed(() => { const c = htc.value?.cls ?? st.value?.cls ?? ""; return !c ? "" : en.value ? classEn(st.value?.cls ?? c, false) : classJa(c, false); });
/** 数字は余計な 0 を付けない (poe2db と同じ: 5%、1.6) */
const trim = (n: number, d = 2): string => String(Number(n.toFixed(d)));
const art = computed(() => baseArt(props.en));
const num = (v: number | [number, number] | undefined): string => (v == null ? "" : Array.isArray(v) ? (v[0] === v[1] ? `${v[0]}` : `${v[0]}-${v[1]}`) : `${v}`);

/** 性能の行 (ゲームの順: ダメージ → クリティカル → 秒間アタック → 再装填 → 防御 → ブロック → スピリット)。見出しはゲームの文 (ClientStrings) */
const props2 = computed(() => {
  const s = st.value, i = info.value, out: Array<{ k: string; v: string }> = [];
  if (s?.phys) out.push({ k: tr("物理ダメージ", "Physical Damage"), v: `${s.phys[0]}-${s.phys[1]}` });
  if (s?.crit && s.phys) out.push({ k: tr("クリティカルヒット率", "Critical Hit Chance"), v: `${trim(s.crit)}%` });
  if (s?.aps) out.push({ k: tr("秒間アタック回数", "Attacks per Second"), v: trim(s.aps) });
  if (i.range && s?.phys) out.push({ k: tr("武器攻撃距離", "Weapon Range"), v: trim(i.range / 10, 1) });
  if (i.reload) out.push({ k: tr("再装填時間", "Reload Time"), v: trim(i.reload / 1000) });
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
const skills = computed(() => (info.value.skills ?? []).map((s) => ({ en: s, label: en.value ? s : gemHoverOf(s)?.n ?? (grantedSkills as Record<string, { ja: string }>)[s]?.ja ?? s })));
</script>

<template>
  <GameItemCard :show="true" :x="x" :y="y" :name="name" tone="normal" :width="art ? 460 : 380" :layer-key="layerKey" :pinned="pinned" :z="z">
    <!-- poe2db と同じ並び: 説明を左、ベースの絵を右 (2026-10-10 オーナーの見本) -->
    <div class="flex items-start gap-2">
      <div class="min-w-0 flex-1">
        <p v-if="cls" class="g-dim text-[12px]">{{ cls }}</p>
        <p v-for="p in props2" :key="p.k" class="g-dim">{{ p.k }}: <span class="g-white">{{ p.v }}</span></p>
        <!-- 付与スキル: 左に小さなジェムのアイコン、見出しは青、名前はジェムの色。名前に乗せるとジェムのカード -->
        <p v-for="sk in skills" :key="sk.en" class="mt-1 flex items-center justify-center gap-1">
          <GemIcon :en="sk.en" :size="20" class="shrink-0" />
          <span class="g-mod">{{ tr("スキルを付与", "Grants Skill") }}:</span>
          <span class="text-[#1ba29b]"><GemName :en="sk.en" :label="sk.label" /></span>
        </p>
        <p v-if="skills.length > 1" class="g-dim text-[11px]">{{ tr("(いずれか 1 つ)", "(one of these)") }}</p>
        <p v-if="!en" class="g-dim mt-0.5 text-[11px] [font-variant:small-caps]">{{ props.en }}</p>
        <template v-if="req">
          <div class="g-sep" />
          <p class="g-dim">{{ tr("装備条件：", "Requires: ") }}<span class="g-white">{{ req }}</span></p>
        </template>
        <template v-if="implicits.length">
          <div class="g-sep" />
          <p v-for="(m, i) in implicits" :key="i" class="g-mod"><RichText :text="m" /></p>
        </template>
      </div>
      <img v-if="art" :src="art" alt="" class="max-h-44 w-20 shrink-0 object-contain" draggable="false" />
    </div>
  </GameItemCard>
</template>
