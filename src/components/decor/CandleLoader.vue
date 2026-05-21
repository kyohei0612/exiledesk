<!--
  placeholder, Phase A.5b 暫定実装。
  visual-concept §5.5 / §5.8 / §9.3 deco-loader-candle:
    24×32 蝋燭 SVG（火の雫 + 軸 2 パス）、accent.focus 系で着色。
    AI 応答中のみ表示し、800ms 周期で ±2deg 揺れ（transform のみ・GPU 合成）。
    §4.6 周期アニメ禁止の例外項目（クラフト相談 AI ローダーに限定）。
    `filter` は使わない（§9.5 パフォーマンスガード）。
  本格意匠は creative 部署で別 PR 仕上げ予定。
-->
<script setup lang="ts">
// props 無し。配置側で absolute 制御。SVG inline で外部依存ゼロ。
</script>

<template>
  <span
    class="exile-candle-loader inline-block"
    aria-label="読み込み中"
    role="status"
  >
    <svg
      width="24"
      height="32"
      viewBox="0 0 24 32"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <!-- 蝋本体（軸） -->
      <rect
        x="9"
        y="14"
        width="6"
        height="16"
        rx="1"
        fill="var(--exile-color-text-secondary)"
      />
      <!-- 芯 -->
      <path
        d="M12 14 V10"
        stroke="var(--exile-color-text-tertiary)"
        stroke-width="1"
        stroke-linecap="round"
      />
      <!-- 火の雫（外炎） -->
      <path
        class="exile-candle-flame"
        d="M12 2 C9 6 8 8 8 10 C8 12 10 13 12 13 C14 13 16 12 16 10 C16 8 15 6 12 2 Z"
        fill="var(--exile-color-accent-focus)"
      />
      <!-- 内炎（高輝度コア） -->
      <path
        class="exile-candle-flame"
        d="M12 6 C10.5 8 10 9 10 10 C10 11 11 11.5 12 11.5 C13 11.5 14 11 14 10 C14 9 13.5 8 12 6 Z"
        fill="var(--exile-color-signal-warn)"
      />
    </svg>
  </span>
</template>

<style scoped>
/* 火の雫だけ揺らす（軸は静止）。transform のみで GPU 合成、filter 不使用。
   §9.5: transform / opacity のみ許容。 */
.exile-candle-flame {
  transform-origin: 12px 13px;
  animation: exile-candle-sway 800ms ease-in-out infinite alternate;
}

@keyframes exile-candle-sway {
  0%   { transform: rotate(-2deg); }
  100% { transform: rotate( 2deg); }
}

/* reduced-motion: 揺らぎ停止（中央維持）。§6.6 規定。 */
@media (prefers-reduced-motion: reduce) {
  .exile-candle-flame {
    animation: none;
    transform: rotate(0deg);
  }
}
</style>
