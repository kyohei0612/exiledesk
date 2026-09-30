<!--
  VideoTiers.vue — 動画用の段の表 (POE2Tube 要望 ⑪-1、2026-09-29)

  URL: ?video=1&layout=clip&view=tiers&base=<英語のベース名>&mod=<MOD の id か系統>&ilvl=N
  手で打つ画面の MOD 一覧 (StageModList) の段の表を 1 画面で大きく。T1〜Tn の数値の幅・必要アイテムレベル・出やすさの棒。
  ilvl を渡したら、その ilvl で出うる一番上の段を金で強調し、それより上 (まだ出ない段) は薄く。
  出やすさ = その MOD が付いた時にどの段になるか (出うる段の重みの割合)。下 15% (612px より下) は空ける。
  画面に「アイテムレベル」の文字を出す (POE2Tube の撮影の準備判定)。
  2026-09-29 要望 ⑫「撮影画面いっぱいに大きく (1080p で 32px 以上)」: 行の高さを段の数で決め、文字も行の高さに合わせて大きく。
-->
<script setup lang="ts">
import { computed } from "vue";
import { craftStage } from "../../state/craft-stage";
import { freshItem } from "../../services/craft-stage/run-plan";
import { modListFor, shownTags, TAG_STYLE } from "../../services/craft-stage/mod-list";
import { baseArt } from "../../services/craft-stage/base-art";

/** hl = false: 答えの金の段を出さない (POE2Tube 要望 ⑯ &hl=0。質問の行で表だけ見せ、答えの行で金の段を「パッ」と出す) */
const props = withDefaults(defineProps<{ base: string; mod: string; ilvl: number | null; hl?: boolean }>(), { hl: true });

const view = computed(() => {
  const data = craftStage.data.value;
  if (!data) return null;
  try {
    const item = freshItem(data, props.base, props.ilvl ?? 100);
    const rows = modListFor(data, item);
    const m = props.mod;
    const row = rows.find((r) => r.id === m) ?? rows.find((r) => r.id.endsWith(`/${m}`)) ?? rows.find((r) => r.family === m && r.group === "normal") ?? rows.find((r) => r.family === m);
    if (!row) return { error: `このベースに ${m} の MOD が無い`, item };
    // hl = false の時は全部の段を同じ見た目に (薄い段も付けない)。出やすさも全部の段の中で
    const lv = props.hl ? (props.ilvl ?? Infinity) : Infinity;
    const open = row.tiers.filter((t) => t.ilvl <= lv);
    const total = open.reduce((a, t) => a + t.weight, 0);
    const top = props.hl ? (open[0]?.rank ?? null) : null;
    const maxW = Math.max(1, ...row.tiers.map((t) => t.weight));
    return {
      item, row,
      tiers: row.tiers.map((t) => ({ ...t, open: t.ilvl <= lv, top: t.rank === top, share: t.ilvl <= lv && total ? t.weight / total : 0, bar: t.weight / maxW })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), item: null };
  }
});
const pct = (x: number): string => (x >= 0.1 ? `${Math.round(x * 100)}%` : x > 0 ? `${(x * 100).toFixed(1)}%` : "—");
/**
 * 段の数で行の高さを決める。612px (下 15% より上) から 上の余白 16・見出し 132・表の頭 46・下の注 26 を除いた残りを段で割る
 */
const rowH = computed(() => {
  const v = view.value;
  const n = v && "tiers" in v && v.tiers ? v.tiers.length : 1;
  return Math.min(64, Math.floor((612 - 16 - 132 - 46 - 26) / Math.max(1, n)));
});
/** 行の文字の大きさ (行の高さに合わせる。1280 の枠で 30px = 1080p で約 40px) */
const rowFont = computed(() => Math.max(18, Math.min(30, Math.round(rowH.value * 0.6))));
</script>

<template>
  <div class="absolute inset-x-0 top-0 flex h-[612px] flex-col items-center px-8 pt-4 text-white">
    <p v-if="!view" class="mt-40 text-2xl opacity-60">データを読んでいます…</p>
    <p v-else-if="'error' in view" class="mt-40 text-2xl text-rose-300">{{ view.error }}</p>
    <template v-else>
      <!-- 見出し: ベースと MOD -->
      <div class="mb-2 flex h-[124px] w-full items-center gap-5">
        <img v-if="baseArt(base)" :src="baseArt(base)!" alt="" class="h-[108px] w-[108px] object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]" />
        <div class="min-w-0 flex-1">
          <p class="text-[26px] text-white/75">{{ view.item.baseJa }}<span class="ml-5 font-bold text-amber-200">アイテムレベル {{ ilvl ?? "指定なし" }}</span></p>
          <p class="truncate text-[42px] font-bold leading-tight text-[#c8c8ff]">{{ view.row.template }}</p>
          <p class="mt-1 flex gap-2">
            <span class="rounded-md px-2.5 py-0.5 text-[18px]" :class="view.row.side === 'prefix' ? 'bg-sky-500/25 text-sky-100' : 'bg-violet-500/25 text-violet-100'">{{ view.row.side === "prefix" ? "プレフィックス" : "サフィックス" }}</span>
            <span v-for="t in shownTags(view.row.tags)" :key="t" class="rounded-md px-2.5 py-0.5 text-[18px]" :class="TAG_STYLE[t]!.cls">{{ TAG_STYLE[t]!.ja }}</span>
          </p>
        </div>
      </div>
      <!-- 段の表 -->
      <div class="w-full overflow-hidden rounded-2xl border border-white/15 bg-black/55">
        <div class="grid h-[44px] grid-cols-[90px_1fr_240px_300px] items-center gap-4 border-b border-white/15 px-6 text-[19px] text-white/60">
          <span>ティア</span><span>数値</span><span>必要アイテムレベル</span><span>出やすさ</span>
        </div>
        <div
          v-for="t in view.tiers"
          :key="t.rank"
          class="relative grid grid-cols-[90px_1fr_240px_300px] items-center gap-4 border-b border-white/5 px-6"
          :class="[t.top ? 'bg-amber-400/15 ring-[3px] ring-inset ring-amber-300/85' : '', t.open ? '' : 'opacity-30']"
          :style="{ height: `${rowH}px`, fontSize: `${rowFont}px` }"
        >
          <b :class="t.top ? 'text-amber-200' : 'text-white/85'">{{ t.rank }}</b>
          <span class="truncate text-[#c8c8ff]">{{ t.text }}</span>
          <span class="tabular-nums">Lv {{ t.ilvl }}</span>
          <span class="flex items-center gap-3">
            <span class="h-4 flex-1 overflow-hidden rounded-full bg-white/10"><span class="block h-full rounded-full" :class="t.top ? 'bg-amber-300' : 'bg-rarity-magic'" :style="{ width: `${t.bar * 100}%` }" /></span>
            <span class="w-20 text-right tabular-nums">{{ pct(t.share) }}</span>
          </span>
        </div>
      </div>
      <p v-if="ilvl && hl" class="mt-2 w-full text-right text-[16px] text-white/60">金のティア = アイテムレベル {{ ilvl }} で出る一番上のティア。薄いティアはまだ出ない。出やすさは、この MOD が付いた時にどのティアになるか</p>
    </template>
  </div>
</template>
