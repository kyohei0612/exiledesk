<!--
  ScreenHeader.vue — 画面の見出し (2026-09-21)

  オーナー指示:「UI とか UX 周り確認しながら統一感持たせて。アドニアがいい例。
  更新指示と手動更新指示あるでしょ」。

  アドニアの賭けの形に揃える。上から順に:
    1. 見出し (h1)
    2. 何をする画面かの説明
    3. **どこの数字をいつ取った物か** (自動更新の表示。source スロット)
    4. 表示通貨などの操作 (controls スロット)
  右上には**手動更新**のボタン (actions スロット)。RefreshButton を使う。

  画面ごとに書き分けていたので、字の大きさ・色・並び・区切りがばらけていた
  (カレンシーランキングだけ h2 24px + 絵文字 + 塗りつぶしボタン、
   ジェムコラプトだけ通貨の選択が取得時刻より上、など)。
-->
<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    /** 取れなかった時に赤字で出す一言 (空なら出さない) */
    error?: string | null;
  }>(),
  { error: null },
);
</script>

<template>
  <header class="mb-3">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div class="min-w-0">
        <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">{{ title }}</h1>
        <p v-if="$slots.default" class="text-xs text-[var(--exile-color-text-secondary)] mt-1"><slot /></p>
        <!-- 自動で入る数字の出どころと取得時刻 -->
        <p v-if="$slots.source" class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-0.5">
          <slot name="source" />
          <span v-if="error" class="text-amber-300">— {{ error }}</span>
        </p>
        <!-- 長い注意書き。出どころの行とは分ける -->
        <p v-if="$slots.note" class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-1"><slot name="note" /></p>
      </div>
      <!-- 手動更新など、この画面の操作 -->
      <div v-if="$slots.actions" class="flex items-center gap-2 flex-wrap shrink-0">
        <slot name="actions" />
      </div>
    </div>
    <div v-if="$slots.controls" class="mt-1 flex items-center gap-4 flex-wrap text-[11px] text-[var(--exile-color-text-secondary)]">
      <slot name="controls" />
    </div>
  </header>
</template>
