<!-- placeholder, Phase A.7 で本格実装。visual-concept §5.5 / §9.3 deco-corner-l: 6×6 L 字、border.brass 1px、静的 SVG。 -->
<script setup lang="ts">
// props 無し。配置側で absolute 制御。SVG inline で外部依存ゼロ。
</script>

<template>
  <span
    class="inline-block"
    aria-hidden="true"
  >
    <svg
      width="6"
      height="6"
      viewBox="0 0 6 6"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M0 6 V0 H6"
        fill="none"
        stroke="var(--exile-color-border-brass)"
        stroke-width="1"
      />
    </svg>
  </span>
</template>
