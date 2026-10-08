<!--
  Icon.vue — 線のアイコン (2026-10-09 UI 作り直し)

  ▶ ▼ ↶ ↗ 🔒 などの文字記号は、フォントで太さ・高さが変わって並ぶと浮く (UI レビュー「文字記号をアイコンに」)。
  使う物だけ lucide (https://lucide.dev、ISC License、Copyright (c) Lucide Contributors) の線を写した。ライブラリは足さない。
  使い方: <Icon name="play" class="size-4" />。色は文字色 (currentColor)
-->
<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ name: string; stroke?: number }>();
const PATHS: Record<string, readonly string[]> = {
  play: ["M6 3l14 9-14 9V3z"],
  "chevron-down": ["M6 9l6 6 6-6"],
  "chevron-up": ["M18 15l-6-6-6 6"],
  "chevron-right": ["M9 18l6-6-6-6"],
  undo: ["M9 14 4 9l5-5", "M4 9h10.5a5.5 5.5 0 0 1 0 11H11"],
  external: ["M15 3h6v6", "M10 14 21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"],
  lock: ["M7 11V7a5 5 0 0 1 10 0v4", "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z"],
  help: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3", "M12 17h.01"],
  check: ["M20 6 9 17l-5-5"],
  x: ["M18 6 6 18", "M6 6l12 12"],
  plus: ["M12 5v14", "M5 12h14"],
  copy: ["M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z", "M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"],
  image: ["M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z", "M21 15l-3.09-3.09a2 2 0 0 0-2.82 0L6 21"],
  rotate: ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5"],
  "corner-up-left": ["M9 14 4 9l5-5", "M20 20v-7a4 4 0 0 0-4-4H4"],
  "arrow-right": ["M5 12h14", "M12 5l7 7-7 7"],
  trash: ["M3 6h18", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M21 21l-4.3-4.3"],
  layers: ["M12 2 2 7l10 5 10-5-10-5z", "M2 17l10 5 10-5", "M2 12l10 5 10-5"],
  target: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z", "M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"],
  sparkles: ["M9.94 14.06 8.5 19l-1.44-4.94L2 12.5l5.06-1.56L8.5 6l1.44 4.94L15 12.5z", "M18 3v4", "M20 5h-4"],
};
const d = computed(() => PATHS[props.name] ?? []);
</script>

<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="stroke ?? 2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="inline-block shrink-0">
    <path v-for="(p, i) in d" :key="i" :d="p" />
  </svg>
</template>
