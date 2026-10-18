<!--
  GuideVideoCard.vue — 使い方・コツのページの一番上: 使い方の動画 (POE2Tube の本編) へのリンク (2026-10-18)。
  埋め込まずに、押したら YouTube へ飛ぶ (オーナー「埋め込んだらあかん」「YouTube は遷移で YouTube に飛ばすでおk」)。スマホは youtu.be なので YouTube のアプリで開く
-->
<script setup lang="ts">
import { tr } from "../../i18n/lang";

const VIDEO_ID = "L_2lhU8Hy_U";
const URL_ = `https://youtu.be/${VIDEO_ID}`;
</script>

<template>
  <a data-guide-video :href="URL_" target="_blank" rel="noopener noreferrer"
    class="g-plain mb-4 flex min-w-0 items-center gap-4 rounded-lg border border-white/10 bg-black/30 p-3 transition hover:border-white/25 max-md:flex-col max-md:items-stretch">
    <span class="relative w-[200px] shrink-0 overflow-hidden rounded-md bg-black max-md:w-full">
      <img :src="`https://i.ytimg.com/vi/${VIDEO_ID}/mqdefault.jpg`" alt="" class="block aspect-video w-full object-cover" loading="lazy" draggable="false" />
      <span class="absolute inset-0 grid place-items-center" aria-hidden="true">
        <span class="grid size-12 place-items-center rounded-full bg-black/70 text-[20px] text-white">▶</span>
      </span>
    </span>
    <span class="flex min-w-0 flex-col gap-1">
      <span class="font-display text-[18px] tracking-wider text-[var(--exile-color-text-title)]">{{ tr("使い方の動画", "How-to video") }}</span>
      <span class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr("ExileDesk の使い方を動画で紹介しています", "A video walkthrough of ExileDesk (in Japanese)") }}</span>
      <span class="text-[12px] font-bold text-[var(--exile-color-accent-focus)]">{{ tr("YouTube で見る ↗", "Watch on YouTube ↗") }}</span>
    </span>
  </a>
</template>
