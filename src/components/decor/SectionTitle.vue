<!--
  SectionTitle.vue — カードの見出し (2026-09-27)

  オーナー 2026-09-27「全体的に全タブの UI この感じに合わせようか。とくに天秤関連は全般この形が美しいな」。
  クラフト計算機の見出しと同じ: 番号の丸 (手順の順番。n を渡した時だけ) + 太字。右側は slot="right"
-->
<script setup lang="ts">
defineProps<{ n?: number | string }>();
</script>

<template>
  <div class="mb-2 flex flex-wrap items-center gap-2">
    <span v-if="n != null" class="rounded-full bg-amber-500/80 px-2 py-0.5 text-[11px] font-bold text-black">{{ n }}</span>
    <h2 class="text-sm font-bold text-amber-100"><slot /></h2>
    <div v-if="$slots.right" class="ml-auto flex flex-wrap items-center gap-2"><slot name="right" /></div>
  </div>
</template>
