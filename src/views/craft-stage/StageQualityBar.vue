<!--
  StageQualityBar.vue — アイテムの品質を手で決める小さい帯 (アイテムの説明の窓の外、すぐ上)。
  2026-10-10 要望「品質欄で防御値をシミュレーション」→ オーナー「今の仕組みを装備にも、最大もつけて」「長押しでも」
  「アイテムのぞいた時の窓の中にゲームに無い物を出すのはおかしい」で窓の外へ。
  − / + は長押しで続けて動く (押した時に 1 つ、0.4 秒後から 0.06 秒ごと)。最小は 0%、最大は上限まで。上限はふだん足し算 (ベース + 「品質の最大値」の MOD + インフューザー、qualityFieldMax)、プルダウンで広げられる (qcap の手)。
  宝飾品は品質の種類 (触媒と同じ。選んだ種類のタグの MOD が伸びる)。ワンド・スタッフ・セプター (品質は付与スキルの品質で数字は変わらない) とスキルジェムには出さない
-->
<script setup lang="ts">
import { computed, onBeforeUnmount } from "vue";
import { tr } from "../../i18n/lang";
import { CATALYSTS } from "../../services/htc/quality";
import { qualityCapOf, qualityFieldMax } from "../../services/craft-stage/apply-currency";
import { isGem } from "../../services/craft-stage/stage-bases";
import type { StageItem } from "../../services/craft-stage/types";

const props = defineProps<{ item: StageItem }>();
const emit = defineEmits<{ quality: [n: number, tag?: string]; cap: [n: number] }>();

/** 品質の上限 (手で決めた値 or 足し算)。品質の − / + / 最大はここまで */
const maxQ = computed(() => qualityCapOf(props.item));
/** 足し算の上限 (ベース + 品質の最大値の MOD + インフューザー)。プルダウンの「今付けられる最大」 */
const natural = computed(() => qualityFieldMax(props.item));
const jewel = computed(() => ["Rings", "Amulets", "Belts"].includes(props.item.cls.category));
const shown = computed(() => !isGem(props.item.cls.category) && !["Wands", "Staves", "Sceptres"].includes(props.item.cls.category));

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
const btn = "g-plain grid size-6 place-items-center rounded border border-white/15 text-white/70 hover:bg-white/10 disabled:opacity-30";
</script>

<template>
  <div v-if="shown" class="flex w-full flex-wrap items-center justify-end gap-1 text-[11px] text-white/60" @click.stop>
    {{ tr("品質", "Quality") }}
    <button type="button" class="g-plain rounded border border-white/15 px-1.5 py-0.5 text-white/70 hover:bg-white/10 disabled:opacity-30" :disabled="item.quality <= 0" :title="tr('品質を 0% に', 'Set quality to 0%')" @click="emit('quality', 0)">{{ tr("最小", "Min") }}</button>
    <button type="button" :class="btn" :disabled="item.quality <= 0" :title="tr('品質 −1% (長押しで続けて)', 'Quality −1% (hold to repeat)')" @pointerdown.prevent="hold(-1)" @pointerup="stop" @pointerleave="stop" @pointercancel="stop" @keydown.enter.prevent="step(-1)">−</button>
    <span class="w-10 text-center tabular-nums" :class="item.quality > 0 ? 'text-rarity-magic' : 'text-white/60'">+{{ item.quality }}%</span>
    <button type="button" :class="btn" :disabled="item.quality >= maxQ" :title="tr(`品質 +1% (上限 ${maxQ}%、長押しで続けて)`, `Quality +1% (max ${maxQ}%, hold to repeat)`)" @pointerdown.prevent="hold(1)" @pointerup="stop" @pointerleave="stop" @pointercancel="stop" @keydown.enter.prevent="step(1)">+</button>
    <button type="button" class="g-plain rounded border border-white/15 px-1.5 py-0.5 text-white/70 hover:bg-white/10 disabled:opacity-30" :disabled="item.quality >= maxQ" :title="tr(`品質を上限の ${maxQ}% に`, `Set quality to the max (${maxQ}%)`)" @click="emit('quality', maxQ)">{{ tr("最大", "Max") }}</button>
    <!-- 「上限」と選ぶ欄は離さない (スマホで折り返すと「上限」だけ右端に残っていた) -->
    <span class="ml-1 inline-flex items-center gap-1 whitespace-nowrap"><span class="opacity-70">{{ tr("上限", "Cap") }}</span>
    <select class="cursor-pointer rounded border border-white/15 bg-black/60 px-1 py-0.5 tabular-nums text-white/80" :value="maxQ" :title="tr(`品質の上限 (今付けられる最大 ${natural}% = ベース + 品質の最大値の MOD + インフューザー。エッセンスを打たずに広げて試すならここで)`, `Max quality (currently ${natural}% = base + max-quality mods + infuser; raise it here to skip the essence)`)" @change="emit('cap', Number(($event.target as HTMLSelectElement).value))">
      <option v-for="q in caps" :key="q" :value="q">{{ q }}%{{ q === natural ? tr(" (今の最大)", " (current)") : "" }}</option>
    </select></span>
    <select v-if="jewel" class="ml-1 w-[9.5rem] rounded border border-white/15 bg-black/60 px-1 py-0.5 text-white/80" :value="item.qualityTag ?? ''" :title="tr('品質の種類 (この種類の MOD が品質で伸びる)', 'Quality type (mods of this type are boosted by quality)')" @change="emit('quality', Math.max(item.quality, 1), ($event.target as HTMLSelectElement).value)">
      <option value="" disabled>{{ tr("種類を選ぶ", "Choose type") }}</option>
      <option v-for="c in CATALYSTS" :key="c.tag" :value="c.tag">{{ tr(c.label.ja, c.label.en) }}</option>
    </select>
  </div>
</template>
