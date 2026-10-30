<!--
  TreeGoalQuality.vue — 完成形の品質 (10-27 夕オーナー、モンキー 7「品質 +40% を入れる所が見当たらない」。スイッチ goalQuality)。
  既定はオフ (品質は見ない)。☑「品質も狙う」でオンにすると、エミュのクラフト台と同じ品質の帯 (StageQualityBar: 品質・上限・種類) で値を決める。
  ベースの最大品質 (アクセサリーは 20%) を超える品質は、途中でブリーチのエッセンス (essence:breach、品質の最大値 +20%) を付けて品質を上げる。
  品質はその後でブリーチの MOD が消えても残る (エンジンの applyCurrency で確かめた) ので、完成の狙いには足さない (狙いの枠を使わない)。
  オンの時だけ回す時に品質を見る (tree-unbounded の goalsHeld・tree-run の完成の箱。足りない人は止まり)
-->
<script setup lang="ts">
import { computed } from "vue";
import StageQualityBar from "../../craft-stage/StageQualityBar.vue";
import { craftStage as s } from "../../../state/craft-stage";
import { CATALYSTS, maxQualityOf, qualityFieldMax, type StageItem } from "../../../services/craft-stage/engine";
import { flag } from "../../../web/release-flags";
import { essenceTarget } from "../../../services/craft-stage/apply-essence";
import { useTree } from "./use-tree";
import { tr } from "../../../i18n/lang";
import { BREACH_OVER } from "./use-goal-shown";
import { askQuality } from "./tree-goal-quality";

/** warn = 「決めた」を押した時に止めた理由 (TreeGoalPage、S-31c) */
defineProps<{ warn?: string | null }>();
const t = useTree();
const on = computed(() => !!t.doc.value.goalQualityOn);
/** 品質の帯に渡す完成形のアイテム (品質・上限・種類は完成形の設定の値) */
const item = computed((): StageItem | null => {
  const it = t.goalItem.value?.item, d = t.doc.value;
  return it ? { ...it, quality: d.goalQuality ?? 0, qualityCap: d.goalQualityCap ?? null, qualityTag: d.goalQualityTag ?? it.qualityTag ?? null } : null;
});
/** ベースの最大品質 (ブリーチの MOD 無し) */
const baseMax = computed(() => (t.goalItem.value ? maxQualityOf(t.goalItem.value.item) : 20));
/** このベースにブリーチのエッセンスの MOD があるか (エンジンの essenceTarget) */
const hasBreach = computed(() => { const d = s.data.value, it = t.goalItem.value?.item; if (!d || !it) return false; try { return !!essenceTarget(d, it, "essence:breach"); } catch { return false; } });
const over = computed(() => on.value && (t.doc.value.goalQuality ?? 0) > baseMax.value);
/** 上限を 11% 以上超える = ブリーチのエッセンスが要る (+10 まではヴァールのインフューザーで届く、10-27 夜オーナー) */
const needBreach = computed(() => over.value && (t.doc.value.goalQuality ?? 0) - baseMax.value >= BREACH_OVER);
/** ☑ 品質も狙う (前の作りで狙いに足したブリーチの MOD があれば外す) */
function setOn(v: boolean): void {
  t.edit((d) => {
    if (v) d.goalQualityOn = true; else delete d.goalQualityOn;
    if ((d.memoAims ?? []).some((a) => a.forQuality)) d.memoAims = (d.memoAims ?? []).filter((a) => !a.forQuality);
  });
}
/**
 * 完成形で届く品質の上限 = エミュのクラフト台と同じ出し方 (qualityFieldMax: ベース + 暗黙などの「品質の最大値」) + 途中で付けるブリーチのエッセンスの +20 (付くベースだけ)。
 * 帯の上限のプルダウン (80% まで) で上げても、この値より上にはしない (指輪で上限 80% にすると +41% にできた、10-27 夜モンキー 2 回目 11。スイッチ qualityLimit)
 */
const limit = computed(() => (t.goalItem.value ? qualityFieldMax(t.goalItem.value.item) + (hasBreach.value ? 20 : 0) : 100));
const clampQ = (n: number): number => (flag("qualityLimit") ? Math.min(n, limit.value) : n);
function setQuality(n: number, tag?: string): void { const q = clampQ(n); t.edit((d) => { if (q > 0) d.goalQuality = q; else delete d.goalQuality; if (tag) d.goalQualityTag = tag; }); }
/**
 * スイッチ qualityAsk: カタリストの部位は「品質を狙う / 狙わない」の 2 択 (どちらか 1 つ、最初はどちらも外し、S-31c)。
 * 狙うにした時は上限 = 今付けられる上限、値 = 上限 (決めてあればそのまま)。上限を選ぶと値も上限に (10-29 深夜オーナー「わざわざ最大ぼたんおすのダルイ」)
 */
const ask = computed(() => askQuality(t.goalItem.value?.item));
const no = computed(() => !!t.doc.value.goalQualityNo);
const natural = computed(() => (t.goalItem.value ? qualityFieldMax(t.goalItem.value.item) : 20));
const caps = computed(() => [...new Set([natural.value, 20, 30, 40, 50, 60, 70, 80])].filter((c) => c <= limit.value).sort((a, b) => a - b));
const capNow = computed(() => t.doc.value.goalQualityCap ?? natural.value);
const qNow = computed(() => t.doc.value.goalQuality ?? 0);
function choose(v: "on" | "no" | null): void {
  t.edit((d) => {
    delete d.goalQualityOn; delete d.goalQualityNo;
    if (v === "no") d.goalQualityNo = true;
    if (v !== "on") return;
    d.goalQualityOn = true;
    const c = clampQ(d.goalQualityCap ?? natural.value);
    d.goalQualityCap = c;
    if (!d.goalQuality) d.goalQuality = c;
    if ((d.memoAims ?? []).some((a) => a.forQuality)) d.memoAims = (d.memoAims ?? []).filter((a) => !a.forQuality);
  });
}
function pickCap(n: number): void { const c = clampQ(n); t.edit((d) => { d.goalQualityCap = c; d.goalQuality = c; }); }
function stepQ(dq: number): void { const n = Math.max(1, Math.min(capNow.value, qNow.value + dq)); setQuality(n); }
function pickTag(tag: string): void { t.edit((d) => { if (tag) d.goalQualityTag = tag; else delete d.goalQualityTag; }); }
const sel = "h-7 cursor-pointer rounded border border-white/15 bg-black/60 px-1 text-white/80";
const btn = "g-plain grid size-7 place-items-center rounded border border-white/15 text-white/70 enabled:hover:bg-white/10 disabled:opacity-30";
function setCap(n: number): void { const c = clampQ(n); t.edit((d) => { d.goalQualityCap = c; if ((d.goalQuality ?? 0) > c) d.goalQuality = c; }); }
</script>

<template>
  <div data-tree-goal-quality class="flex flex-col gap-1 px-1 text-[12px]" :class="flag('qualityFit') ? 'goal-q-fit' : ''">
    <!-- カタリストの部位: 狙う / 狙わないの 2 択 + 上限と種類のプルダウン (S-31c、スイッチ qualityAsk) -->
    <template v-if="ask">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[#d8ccb4]">
        <label class="flex min-h-7 cursor-pointer items-center gap-2 max-md:min-h-11"><input data-tree-goal-quality-yes type="checkbox" :checked="on" @change="choose(($event.target as HTMLInputElement).checked ? 'on' : null)" />{{ tr("品質を狙う", "Aim for quality") }}</label>
        <label class="flex min-h-7 cursor-pointer items-center gap-2 max-md:min-h-11"><input data-tree-goal-quality-no type="checkbox" :checked="no" @change="choose(($event.target as HTMLInputElement).checked ? 'no' : null)" />{{ tr("品質は狙わない", "No quality") }}</label>
      </div>
      <div v-if="on" data-tree-goal-quality-pick class="flex flex-wrap items-center gap-1.5 text-[#d8ccb4]">
        <select data-tree-goal-quality-cap :class="[sel, 'tabular-nums']" :value="capNow" :title="tr('品質の上限 (選ぶと品質もこの値になる)', 'Max quality (the quality is set to it)')" @change="pickCap(Number(($event.target as HTMLSelectElement).value))">
          <option v-for="c in caps" :key="c" :value="c">{{ tr(`上限 ${c}%`, `Cap ${c}%`) }}</option>
        </select>
        <button type="button" :class="btn" :disabled="qNow <= 1" :title="tr('品質 −1%', 'Quality −1%')" @click="stepQ(-1)">−</button>
        <span data-tree-goal-quality-value class="w-11 text-center tabular-nums text-rarity-magic">+{{ qNow }}%</span>
        <button type="button" :class="btn" :disabled="qNow >= capNow" :title="tr('品質 +1%', 'Quality +1%')" @click="stepQ(1)">+</button>
        <select data-tree-goal-quality-tag :class="[sel, 'min-w-[8rem]']" :value="t.doc.value.goalQualityTag ?? ''" :title="tr('カタリストの種類 (この種類の MOD が品質で伸びる)', 'Catalyst type (mods of this type are boosted by quality)')" @change="pickTag(($event.target as HTMLSelectElement).value)">
          <option value="" disabled>{{ tr("カタリストの種類を選ぶ", "Choose catalyst type") }}</option>
          <option v-for="c in CATALYSTS" :key="c.tag" :value="c.tag">{{ tr(c.label.ja, c.label.en) }}</option>
        </select>
      </div>
      <p v-if="warn" data-tree-goal-quality-warn class="break-words rounded border border-rose-400/50 bg-[#2a1416] px-2 py-1 text-rose-100">{{ warn }}</p>
    </template>
    <template v-else>
    <label class="flex min-h-7 cursor-pointer items-center gap-2 text-[#d8ccb4]">
      <input data-tree-goal-quality-on type="checkbox" :checked="on" @change="setOn(($event.target as HTMLInputElement).checked)" />{{ tr("品質も狙う", "Also aim for quality") }}
    </label>
    <StageQualityBar v-if="on && item" :item="item" :cap-limit="flag('goalAskFix') ? limit : undefined" @quality="setQuality" @cap="setCap" @catalyst="() => {}" />
    </template>
    <p v-if="over && !needBreach" data-tree-goal-quality-infuser class="break-words text-amber-200/90">{{ tr(`${baseMax}% を超える分 (+10% まで) はヴァールのインフューザーで届く`, `Up to +10% above ${baseMax}% is reachable with an Infuser`) }}</p>
    <p v-else-if="needBreach && hasBreach" data-tree-goal-quality-breach class="break-words text-amber-200/90">{{ tr(`${baseMax + 10}% を超えるには、途中でブリーチのエッセンス (品質の最大値 +20%) を付けて品質を上げる。その後でブリーチの MOD が消えても品質は残る (完成形のカードの「途中で消える」の行。完成の MOD の枠には数えない)`, `Above ${baseMax + 10}% needs a Perfect Essence of the Breach (+20% to Maximum Quality) on the way. The quality stays even if that mod is removed later (the "Removed on the way" row on the final item; not counted as a final mod slot)`) }}</p>
    <p v-else-if="needBreach" data-tree-goal-quality-cant class="break-words text-rose-200/90">{{ tr(`このベースでは ${baseMax + 10}% を超えられない (ブリーチのエッセンスが付かない)`, `This base can't go above ${baseMax + 10}% (no Essence of the Breach)`) }}</p>
  </div>
</template>

<style>
/* 品質の種類の欄を文字の幅より狭くしない (スマホで「品質 (マナモ」で切れた、10-27 夜モンキー 2 回目 12)。帯は折り返すので、入らなければ次の行へ */
.goal-q-fit select { min-width: max-content; }
</style>
