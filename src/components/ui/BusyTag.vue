<!--
  BusyTag.vue — 読み込み中の小さな札 (くるくる + 一言 + 進み n/m)。全部の画面の共通 (2026-10-22 オーナー「待ち時間のローディング画面を出さないと
  バグってるのか分からない」「画面を覆う物ではなく読み込みながら徐々に出す」)。題の横など邪魔にならない所に置き、終わったら v-if で消す。
  使い方: <BusyTag v-if="busy" :text="tr('計算中', 'Calculating')" :n="done" :of="total" />  (n / of は任意。文は呼ぶ側で日英を渡す)
  重い計算はメインの処理で一気に回すとくるくるも止まるので、呼ぶ側は区切って await で画面を返す (route-race.ts の breathe と同じ)
-->
<script setup lang="ts">
defineProps<{ text: string; n?: number; of?: number }>();
</script>

<template>
  <span data-busy-tag role="status" aria-live="polite" class="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-400/30 bg-black/40 px-2 py-0.5 text-[12px] font-normal tracking-normal text-amber-100/90 [text-shadow:none]">
    <span class="size-3 shrink-0 animate-spin rounded-full border-2 border-amber-300/30 border-t-amber-300" aria-hidden="true" />
    <span class="whitespace-nowrap tabular-nums">{{ text }}<template v-if="of"> {{ n ?? 0 }}/{{ of }}</template></span>
  </span>
</template>
