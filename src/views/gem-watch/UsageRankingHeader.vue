<!--
  UsageRankingHeader.vue — 使用率ランキングの見出しと説明 (中身は文だけ)
  GemBreak.vue から切り出し (2026-09-26)。見た目・文言は変えていない。
-->
<template>
  <header class="mb-3">
    <h3 class="font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] text-[13px]">使用率ランキング (poe.ninja)</h3>
    <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">
      上位プレイヤーが「レベル 21 / 品質 23% / 完成品」のジェムを実際に何人使っているかの人数ランキング。
      <span class="text-[var(--exile-color-text-primary)]">気になるジェムの「監視へ +」で、上の監視リストに入れられます (7 ジェムまで)。</span>
      行を押すと内訳 (何レベル / 何 % で使われているか) が出ます。
    </p>
    <!-- 細かい話はたたんでおく (2026-09-19 オーナー「分かりづらい、簡潔に」) -->
    <details class="mt-1">
      <summary class="text-[11px] text-[var(--exile-color-text-tertiary)] cursor-pointer select-none hover:text-[var(--exile-color-text-secondary)]">
        数え方と取得のしくみ
      </summary>
      <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-1">
        poe.ninja の全体集計にはジェムのレベル・品質が無いので、選んだアセンダンシーの上位キャラを直接読んで数えます
        (1 アセンダンシー = 人数 + 2 リクエスト。見たキャラは保存するので 2 回目以降は数分)。
        装備やアセンダンシーの「+1 to Level of Skills」は差し引き、コラプト済みのジェムだけを 21 / 23% として数えます。
        上位プレイヤーMOD一覧と同じ poe.ninja を叩くので、そちらの取得が終わった直後に相乗りして取り直します
        (間隔は設定の「自動再取得」、既定 3 日)。
      </p>
    </details>
  </header>
</template>
