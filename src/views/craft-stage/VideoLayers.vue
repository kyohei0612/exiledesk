<!--
  VideoLayers.vue — 動画用の「ダメージが減っていく順番」(2026-09-30、POE2Tube 要望 ㉒-B1、防御の回の主役)

  URL: ?video=1&layout=clip&view=layers&kind=physical|fire|cold|lightning|chaos&dmg=1000[&outcome=hit|evade|deflect|block][&red=1]
       キャラ: [&pob=<結果 JSON の pob>&step=N] と個別の上書き [&life=&es=&armour=&evasion=&deflect=&block=&res=]
       敵: [&lvl=敵のレベル (命中力)] [&acc=命中力]
  敵の一撃が 回避 → 受け流し → ブロック → 耐性 → アーマー → ES → ライフ と通って減っていく。段ごとに棒が縮む。
    - outcome: どこで止まる (避けた / 受け流した / ブロックした) の分岐。既定 hit (全部通る)
    - red=1: ボスの赤く光る技 (回避・ブロックを飛ばす、受け流しは効く)
    - &play=1: 上の段から順に棒が縮む (段ごとに 0.5 秒)。&hl=0: 数字を出さない
  撮影の準備の目印: 見出しの「ダメージが減る順番」の文字。下 15% (612px より下) は空ける。
-->
<script setup lang="ts">
import { computed } from "vue";
import { KIND_COLOR, KIND_JA, layersOf, type DamageKind, type Defender, type Outcome } from "../../services/craft-stage/defence";
import { easeOut, seg, useAnim } from "./use-anim";

const props = defineProps<{ d: Defender; hit: number; kind: DamageKind; acc: number; outcome: Outcome; red: boolean; lvl: number | null }>();
const hl = new URLSearchParams(location.search).get("hl") !== "0";
const layers = computed(() => layersOf(props.d, props.hit, props.kind, props.acc, props.outcome, props.red));
const color = computed(() => KIND_COLOR[props.kind]);
const N = 8;
const anim = useAnim(N * 500 + 400);
/** i 段目の進み (0 → 1) */
const p = (i: number) => (anim.play ? easeOut(seg(anim.t.value, i / (N + 0.8), (i + 0.9) / (N + 0.8))) : 1);
const stopAt = computed(() => layers.value.findIndex((l) => l.stopped));
const width = (v: number) => `${props.hit > 0 ? Math.max(0, (v / props.hit) * 100) : 0}%`;
const STAMP: Record<string, string> = { evade: "避けた！", block: "ブロック！" };
</script>

<template>
  <div class="absolute inset-x-0 top-0 h-[612px] px-10 pt-5 text-white">
    <div class="mb-3 flex items-end justify-between">
      <p class="text-[40px] font-bold leading-tight text-amber-100">ダメージが減る順番</p>
      <p class="text-[18px] text-white/60">
        敵の{{ KIND_JA[kind] }}の一撃 <b class="text-[26px]" :style="{ color }">{{ Math.round(hit) }}</b>
        <span v-if="red" class="ml-2 rounded bg-red-600/80 px-2 py-0.5 text-[16px] font-bold text-white">赤い技</span>
        <span v-if="lvl" class="ml-2">敵 Lv{{ lvl }}・命中力 {{ acc }}</span>
      </p>
    </div>
    <div class="space-y-[7px]">
      <div
        v-for="(l, i) in layers"
        :key="l.key"
        class="grid grid-cols-[150px_1fr_300px] items-center gap-4 rounded-xl border px-4 py-[7px] transition-opacity"
        :class="l.skipped || (stopAt >= 0 && i > stopAt) ? 'border-white/5 bg-black/30 opacity-40' : 'border-white/15 bg-black/55'"
        :style="anim.play && p(i) === 0 ? { opacity: 0 } : undefined"
      >
        <p class="text-[26px] font-bold" :class="l.key === 'life' ? 'text-red-300' : l.key === 'es' ? 'text-sky-300' : 'text-amber-50'">{{ l.ja }}</p>
        <div class="relative h-9 overflow-hidden rounded-lg bg-white/5">
          <!-- 前の長さ (薄く) と後の長さ (濃く)。進みで前 → 後に縮む -->
          <div class="absolute inset-y-0 left-0 rounded-lg opacity-25" :style="{ width: width(l.before), background: color }" />
          <div
            class="absolute inset-y-0 left-0 rounded-lg"
            :style="{ width: width(l.before + (l.after - l.before) * p(i)), background: l.key === 'es' ? '#5aa9e6' : l.key === 'life' ? '#d94c4c' : color }"
          />
          <span v-if="hl && !l.skipped" class="absolute inset-y-0 right-3 flex items-center text-[22px] font-bold tabular-nums drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)]">
            {{ Math.round(l.after) }}
          </span>
          <span v-if="l.stopped && p(i) > 0.6" class="stage-pop absolute inset-0 grid place-items-center text-[30px] font-black text-emerald-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            {{ STAMP[l.key] ?? "" }}
          </span>
        </div>
        <p class="text-[19px] leading-tight text-white/75">{{ stopAt >= 0 && i > stopAt ? "—" : l.note }}</p>
      </div>
    </div>
  </div>
</template>
