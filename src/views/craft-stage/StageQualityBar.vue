<!--
  StageQualityBar.vue — アイテムの品質を手で決める小さい帯 (アイテムの説明の窓の外、すぐ上)。
  2026-10-10 要望「品質欄で防御値をシミュレーション」→ オーナー「今の仕組みを装備にも、最大もつけて」「長押しでも」
  「アイテムのぞいた時の窓の中にゲームに無い物を出すのはおかしい」で窓の外へ。
  − / + は長押しで続けて動く (押した時に 1 つ、0.4 秒後から 0.06 秒ごと)。最小は 0%、最大は上限まで。上限はふだん足し算 (ベース + 「品質の最大値」の MOD、qualityFieldMax。インフューザーは棚に無い間は足さない)、プルダウンで広げられる (qcap の手)。
  宝飾品は品質の種類 (触媒と同じ。選んだ種類のタグの MOD が伸びる)。スキルジェムには出さない (ワンド・スタッフ・セプターは 10-17 から出す)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount } from "vue";
import { tr } from "../../i18n/lang";
import { CATALYSTS } from "../../services/htc/quality";
import { inAny } from "../../services/mods/item-classes";
import { qualityCapOf, qualityFieldMax, SANCTIFIED_REASON } from "../../services/craft-stage/apply-currency";
import { hasExtraCatalyst, maxQualityOf } from "../../services/craft-stage/stage-core";
import { isGem } from "../../services/craft-stage/stage-bases";
import type { StageItem } from "../../services/craft-stage/types";

const props = defineProps<{ item: StageItem }>();
const emit = defineEmits<{ quality: [n: number, tag?: string]; cap: [n: number]; catalyst: [n: number, tag: string] }>();

/** 品質の上限 (手で決めた値 or 足し算)。品質の − / + / 最大はここまで */
const maxQ = computed(() => qualityCapOf(props.item));
/** 足し算の上限 (ベース + 品質の最大値の MOD + インフューザー)。プルダウンの「今付けられる最大」 */
const natural = computed(() => qualityFieldMax(props.item));
// 種類を選んだら、その時点の上限 (MOD・品質の種類で変わる) まで上げる。そこから − / + で手で変えられる (2026-10-13 オーナー)
// カタリストの種類を選べるのは指輪・アミュレット (普通の物) とジュエル (精製された物)。ベルトには無い (2026-10-13 総点検: 前はベルトにも出て、打つと弾かれた)
const jewel = computed(() => inAny(props.item.cls.category, ["ringAmulet", "jewel"]));
/** ベースの品質とは別にカタリストの品質を持つベース (グラスピングメイル)。種類と % を別の欄で */
const extraCat = computed(() => hasExtraCatalyst(props.item.base));
const catMax = computed(() => maxQualityOf(props.item));
const catQ = computed(() => props.item.catalystQuality ?? 0);
// ワンド・スタッフ・セプターにも出す (品質は付与スキルに乗る。2026-10-17 オーナー「品質は等しく上げれるように、カレンシーでも設定でも」)
/** 聖別済みは灰色で押せない (今の値は見せる。乗せると理由の文。2026-10-22 オーナー、エンジンも apply-currency の入口で止める) */
const locked = computed(() => !!props.item.sanctified);
/** 灰色にして、中のボタンには乗せない (乗せた時に帯の理由の文が出るように) */
const LOCKED_CLS = "cursor-not-allowed opacity-50 [&_*]:pointer-events-none";
const shown = computed(() => !isGem(props.item.cls.category));

let rep: ReturnType<typeof setTimeout> | null = null;
function step(d: number): void {
  const n = Math.max(0, Math.min(maxQ.value, props.item.quality + d));
  if (n !== props.item.quality) emit("quality", n);
}
function stop(): void { if (rep) clearTimeout(rep); rep = null; }
function hold(d: number): void {
  stop();
  step(d);
  const tick = (): void => { step(d); rep = setTimeout(tick, 60); };
  rep = setTimeout(tick, 400);
}
onBeforeUnmount(stop);
/** 上限のプルダウン: 足し算の上限と、20 から 10 きざみ (今の上限も入れる)。2026-10-10 オーナー「プルダウンで上限上げてね、20 以降 10 ずつ」 */
const caps = computed(() => [...new Set([natural.value, 20, 30, 40, 50, 60, 70, 80, maxQ.value])].sort((a, b) => a - b));
// 帯の中は全部 24px の高さに揃える (2026-10-18 オーナーの UI 点検「品質の行が浮いている」。高さと字の大きさがばらばらで 2 段に折れていた)
const btn = "g-plain grid size-6 place-items-center rounded border border-white/15 text-white/70 hover:bg-white/10 disabled:opacity-30";
const wbtn = "g-plain h-6 rounded border border-white/15 px-1.5 text-white/70 hover:bg-white/10 disabled:opacity-30";
const sel = "h-6 cursor-pointer rounded border border-white/15 bg-black/60 px-1 text-white/80";
</script>

<template>
  <div v-if="shown" class="flex w-full flex-wrap items-center justify-end gap-1 text-[11px] leading-none text-white/60" :class="locked && LOCKED_CLS" :title="locked ? SANCTIFIED_REASON() : undefined" @click.stop>
    {{ tr("品質", "Quality") }}
    <button type="button" :class="wbtn" :disabled="locked || item.quality <= 0" :title="tr('品質を 0% に', 'Set quality to 0%')" @click="emit('quality', 0)">{{ tr("最小", "Min") }}</button>
    <button type="button" :class="btn" :disabled="locked || item.quality <= 0" :title="tr('品質 −1% (長押しで続けて)', 'Quality −1% (hold to repeat)')" @pointerdown.prevent="hold(-1)" @pointerup="stop" @pointerleave="stop" @pointercancel="stop" @keydown.enter.prevent="step(-1)">−</button>
    <span class="w-10 text-center tabular-nums" :class="item.quality > 0 ? 'text-rarity-magic' : 'text-white/60'">+{{ item.quality }}%</span>
    <button type="button" :class="btn" :disabled="locked || item.quality >= maxQ" :title="tr(`品質 +1% (上限 ${maxQ}%、長押しで続けて)`, `Quality +1% (max ${maxQ}%, hold to repeat)`)" @pointerdown.prevent="hold(1)" @pointerup="stop" @pointerleave="stop" @pointercancel="stop" @keydown.enter.prevent="step(1)">+</button>
    <button type="button" :class="wbtn" :disabled="locked || item.quality >= maxQ" :title="tr(`品質を上限の ${maxQ}% に`, `Set quality to the max (${maxQ}%)`)" @click="emit('quality', maxQ)">{{ tr("最大", "Max") }}</button>
    <!-- 「上限」は選ぶ欄の中の字に (別の字にすると 1 行に入らず、種類の欄が 2 段目に落ちていた。2026-10-18) -->
    <select :disabled="locked" :class="[sel, 'tabular-nums']" :value="maxQ" :title="tr(`品質の上限 (今付けられる最大 ${natural}% = ベース + 品質の最大値の MOD + インフューザー。エッセンスを打たずに広げて試すならここで)`, `Max quality (currently ${natural}% = base + max-quality mods + infuser; raise it here to skip the essence)`)" @change="emit('cap', Number(($event.target as HTMLSelectElement).value))">
      <option v-for="q in caps" :key="q" :value="q">{{ tr(`上限 ${q}%`, `Cap ${q}%`) }}</option>
    </select>
    <span v-if="extraCat" class="ml-1 inline-flex items-center gap-1 whitespace-nowrap">{{ tr("カタリスト", "Catalyst") }}
      <select :disabled="locked" :class="[sel, 'w-[8.5rem]']" :value="item.qualityTag ?? ''" :title="tr('カタリストの種類 (この種類の MOD が伸びる。ベースの品質とは別)', 'Catalyst type (boosts mods of this type; separate from base quality)')" @change="emit('catalyst', catMax, ($event.target as HTMLSelectElement).value)">
        <option value="" disabled>{{ tr("種類を選ぶ", "Choose type") }}</option>
        <option v-for="c in CATALYSTS" :key="c.tag" :value="c.tag">{{ tr(c.label.ja, c.label.en) }}</option>
      </select>
      <span v-if="item.qualityTag" class="w-10 text-center tabular-nums" :class="catQ > 0 ? 'text-rarity-magic' : 'text-white/60'">+{{ catQ }}%</span>
      <button v-if="item.qualityTag" type="button" :class="wbtn" :disabled="locked || catQ <= 0" :title="tr('カタリストの品質を 0% に', 'Set Catalyst quality to 0%')" @click="emit('catalyst', 0, item.qualityTag!)">{{ tr("最小", "Min") }}</button>
    </span>
    <select v-if="jewel" :disabled="locked" :class="[sel, 'w-[7rem]']" :value="item.qualityTag ?? ''" :title="tr('品質の種類 (この種類の MOD が品質で伸びる)', 'Quality type (mods of this type are boosted by quality)')" @change="emit('quality', maxQ, ($event.target as HTMLSelectElement).value)">
      <option value="" disabled>{{ tr("種類を選ぶ", "Choose type") }}</option>
      <option v-for="c in CATALYSTS" :key="c.tag" :value="c.tag">{{ tr(c.label.ja, c.label.en) }}</option>
    </select>
  </div>
</template>
