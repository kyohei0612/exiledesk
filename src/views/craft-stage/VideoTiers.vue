<!--
  VideoTiers.vue — 動画用の段の表 (POE2Tube 要望 ⑪-1、2026-09-29)

  URL: ?video=1&layout=clip&view=tiers&base=<英語のベース名>&mod=<MOD の id か系統>&ilvl=N
  手で打つ画面の MOD 一覧 (StageModList) の段の表を 1 画面で大きく。T1〜Tn の数値の幅・必要アイテムレベル・出やすさの棒。
  ilvl を渡したら、その ilvl で出うる一番上の段を金で強調し、それより上 (まだ出ない段) は薄く。
  出やすさ = その MOD が付いた時にどの段になるか (出うる段の重みの割合)。下 15% (612px より下) は空ける。
  画面に「アイテムレベル」の文字を出す (POE2Tube の撮影の準備判定)。
-->
<script setup lang="ts">
import { computed } from "vue";
import { craftStage } from "../../state/craft-stage";
import { freshItem } from "../../services/craft-stage/run-plan";
import { modListFor, shownTags, TAG_STYLE } from "../../services/craft-stage/mod-list";
import { baseArt } from "../../services/craft-stage/base-art";

const props = defineProps<{ base: string; mod: string; ilvl: number | null }>();

const view = computed(() => {
  const data = craftStage.data.value;
  if (!data) return null;
  try {
    const item = freshItem(data, props.base, props.ilvl ?? 100);
    const rows = modListFor(data, item);
    const m = props.mod;
    const row = rows.find((r) => r.id === m) ?? rows.find((r) => r.id.endsWith(`/${m}`)) ?? rows.find((r) => r.family === m && r.group === "normal") ?? rows.find((r) => r.family === m);
    if (!row) return { error: `このベースに ${m} の MOD が無い`, item };
    const lv = props.ilvl ?? Infinity;
    const open = row.tiers.filter((t) => t.ilvl <= lv);
    const total = open.reduce((a, t) => a + t.weight, 0);
    const top = open[0]?.rank ?? null;
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
/** 段の数で行の高さを決める (下 15% を空けて収める) */
const rowH = computed(() => {
  const v = view.value;
  const n = v && "tiers" in v && v.tiers ? v.tiers.length : 1;
  return Math.min(46, Math.floor((612 - 150) / Math.max(1, n)));
});
</script>

<template>
  <div class="absolute inset-x-0 top-0 flex h-[612px] flex-col items-center px-16 pt-6 text-white">
    <p v-if="!view" class="mt-40 text-2xl opacity-60">データを読んでいます…</p>
    <p v-else-if="'error' in view" class="mt-40 text-2xl text-rose-300">{{ view.error }}</p>
    <template v-else>
      <!-- 見出し: ベースと MOD -->
      <div class="mb-4 flex w-full items-center gap-5">
        <img v-if="baseArt(base)" :src="baseArt(base)!" alt="" class="h-[84px] w-[84px] object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]" />
        <div class="min-w-0 flex-1">
          <p class="text-[20px] text-white/70">{{ view.item.baseJa }}<span class="ml-4 text-amber-200">アイテムレベル {{ ilvl ?? "指定なし" }}</span></p>
          <p class="mt-1 text-[32px] font-bold leading-tight text-[#c8c8ff]">{{ view.row.template }}</p>
          <p class="mt-1 flex gap-1.5">
            <span class="rounded px-2 py-0.5 text-[14px]" :class="view.row.side === 'prefix' ? 'bg-sky-500/25 text-sky-100' : 'bg-violet-500/25 text-violet-100'">{{ view.row.side === "prefix" ? "プレフィックス" : "サフィックス" }}</span>
            <span v-for="t in shownTags(view.row.tags)" :key="t" class="rounded px-2 py-0.5 text-[14px]" :class="TAG_STYLE[t]!.cls">{{ TAG_STYLE[t]!.ja }}</span>
          </p>
        </div>
      </div>
      <!-- 段の表 -->
      <div class="w-full overflow-hidden rounded-2xl border border-white/15 bg-black/55">
        <div class="grid grid-cols-[70px_1fr_220px_260px] gap-4 border-b border-white/15 px-5 py-2 text-[15px] text-white/60">
          <span>段</span><span>数値</span><span>必要アイテムレベル</span><span>出やすさ</span>
        </div>
        <div
          v-for="t in view.tiers"
          :key="t.rank"
          class="relative grid grid-cols-[70px_1fr_220px_260px] items-center gap-4 border-b border-white/5 px-5"
          :class="[t.top ? 'bg-amber-400/15 ring-2 ring-inset ring-amber-300/80' : '', t.open ? '' : 'opacity-30']"
          :style="{ height: `${rowH}px` }"
        >
          <b class="text-[22px]" :class="t.top ? 'text-amber-200' : 'text-white/85'">{{ t.rank }}</b>
          <span class="truncate text-[22px] text-[#c8c8ff]">{{ t.text }}</span>
          <span class="text-[20px] tabular-nums">Lv {{ t.ilvl }}</span>
          <span class="flex items-center gap-3">
            <span class="h-3 flex-1 overflow-hidden rounded-full bg-white/10"><span class="block h-full rounded-full" :class="t.top ? 'bg-amber-300' : 'bg-[#8888ff]'" :style="{ width: `${t.bar * 100}%` }" /></span>
            <span class="w-16 text-right text-[18px] tabular-nums">{{ pct(t.share) }}</span>
          </span>
        </div>
      </div>
      <p v-if="ilvl" class="mt-2 w-full text-right text-[15px] text-white/60">金の段 = アイテムレベル {{ ilvl }} で出る一番上の段。薄い段はまだ出ない。出やすさは、この MOD が付いた時にどの段になるか</p>
    </template>
  </div>
</template>
