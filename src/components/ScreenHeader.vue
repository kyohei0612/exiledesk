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
/**
 * 2026-10-03: 画面名は上の帯 (components/ui/TabBar.vue) に 1 回だけ出す決まりにしたので、title は省けるようにした。
 * 帯のある画面 (ヴァールの天秤の中の 4 画面、取引履歴 など) は title を渡さず、説明・出どころ・操作だけをここで出す
 */
withDefaults(
  defineProps<{
    /** 画面名。上の帯に出している画面は省く (h1 を二重に出さない) */
    title?: string;
    /** 取れなかった時に赤字で出す一言 (空なら出さない) */
    error?: string | null;
  }>(),
  { title: undefined, error: null },
);
</script>

<template>
  <header class="mb-3">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <!-- 左は伸び縮みする列にして、説明が長くても右の操作 (手動更新) が同じ行に残るように (2026-10-03。title が無いと説明が横いっぱいに伸びて操作が下に落ちていた) -->
      <div class="min-w-0 flex-1 basis-[32rem]">
        <h1 v-if="title" class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">{{ title }}</h1>
        <p v-if="$slots.default" class="text-[12px] text-[var(--exile-color-text-secondary)]" :class="title ? 'mt-1' : ''"><slot /></p>
        <!-- 自動で入る数字の出どころと取得時刻 -->
        <p v-if="$slots.source" class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-0.5">
          <slot name="source" />
          <span v-if="error" class="text-amber-300">— {{ error }}</span>
        </p>
        <!-- 長い注意書き。出どころの行とは分ける -->
        <!-- 長い注意書きは既定で閉じる (2026-10-10 取引履歴の見直し。オーナー「説明・内訳は既定で閉じ、要る時に開く」) -->
        <details v-if="$slots.note" class="mt-1">
          <summary class="text-[11px] text-[var(--exile-color-text-tertiary)] cursor-pointer select-none hover:text-[var(--exile-color-text-secondary)]">詳しく</summary>
          <p class="text-[11px] leading-relaxed text-[var(--exile-color-text-tertiary)] mt-1"><slot name="note" /></p>
        </details>
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
