<!--
  GemName.vue — ジェム名 (下線つき)。カーソルでジェムのカードを開く (2026-09-26)
  ユニーク / カレンシーと同じ重なり ([[hover-stack.ts]])。表の中の名前はこれを使う。
-->
<script setup lang="ts">
import { inject } from "vue";
import { hoverStack } from "../../state/hover-stack";
import { toCss } from "../../utils/zoom";

const props = defineProps<{ en: string; label: string }>();
/** カードの中 (GameItemCard が段の番号を渡す) では、そのカードの上の段に開く (ベースのカードの「スキルを付与」など。2026-10-10) */
const layerKey = inject<number | null>("hoverLayerKey", null);
function open(ev: MouseEvent): void {
  if (layerKey == null) { hoverStack.openRoot({ kind: "gem", en: props.en }, toCss(ev.clientX), toCss(ev.clientY)); return; }
  const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
  hoverStack.openChild(layerKey, { kind: "gem", en: props.en }, toCss(r.right) - 8, toCss(r.top + r.height / 2));
}
</script>

<template>
  <span class="g-hover-name" @mouseenter="open" @mouseleave="hoverStack.leave()">{{ label }}</span>
</template>
