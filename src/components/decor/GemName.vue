<!--
  GemName.vue — ジェム名 (下線つき)。カーソルでジェムのカードを開く (2026-09-26)
  ユニーク / カレンシーと同じ重なり ([[hover-stack.ts]])。表の中の名前はこれを使う。
-->
<script setup lang="ts">
import { hoverStack } from "../../state/hover-stack";
import { toCss } from "../../utils/zoom";

const props = defineProps<{ en: string; label: string }>();
function open(ev: MouseEvent): void {
  hoverStack.openRoot({ kind: "gem", en: props.en }, toCss(ev.clientX), toCss(ev.clientY));
}
</script>

<template>
  <span class="underline decoration-dotted decoration-[var(--exile-color-text-tertiary)] underline-offset-4 cursor-help" @mouseenter="open" @mouseleave="hoverStack.leave()">{{ label }}</span>
</template>
