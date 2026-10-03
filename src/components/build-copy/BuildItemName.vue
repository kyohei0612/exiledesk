<!--
  BuildItemName.vue — 装備の名前 (下線つき)。カーソルでゲームのアイテム画面そっくりのカード (BuildItemHoverCard、kind "build") を開く (2026-10-03)
  GemName.vue のアイテム版。重なりの決まりは [[hover-stack.ts]]。火力チェックの 装備 / 相手との差 で使う
-->
<script setup lang="ts">
import { hoverStack } from "../../state/hover-stack";
import { toCss } from "../../utils/zoom";
import type { BuildItem } from "../../services/build-copy/pob";

const props = defineProps<{ item: BuildItem; label: string }>();
function open(ev: MouseEvent): void {
  hoverStack.openRoot({ kind: "build", item: props.item }, toCss(ev.clientX), toCss(ev.clientY));
}
</script>

<template>
  <span class="underline decoration-dotted decoration-[var(--exile-color-text-tertiary)] underline-offset-4 cursor-help" @mouseenter="open" @mouseleave="hoverStack.leave()">{{ label }}</span>
</template>
