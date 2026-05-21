<!-- placeholder, Phase A.7 で本格実装。visual-concept §5.5 / §9.3 deco-seal-hot: 16×16 円 + 小さな十字、accent.hot 単色、静止・点滅禁止。 -->
<script setup lang="ts">
// props 無し。配置側で absolute 制御。SVG inline で外部依存ゼロ。
</script>

<template>
  <span
    class="inline-block"
    aria-hidden="true"
    :title="'ホット度 50%↑ 封蝋'"
  >
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="8" cy="8" r="7" fill="var(--exile-color-accent-hot)" />
      <path
        d="M8 4 V12 M4 8 H12"
        stroke="var(--exile-color-bg-canvas)"
        stroke-width="1.2"
        stroke-linecap="round"
      />
    </svg>
  </span>
</template>
