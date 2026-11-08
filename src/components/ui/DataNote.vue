<!--
  DataNote.vue — 「この数字はゲームの公表ではなく、サイトが借りた・決めた・推定した物」の札 (U-46、2026-11-08 オーナー「注意書きはE」= 青の情報の札)。
  札: i の丸 + 短い文。detail を渡すと押して出どころの詳しい文を開く (スマホはホバーが無い)。hint だけならホバーの文。
  mark: 文の頭に置く i の丸だけ (説明の窓の中の行・小さな札)。決まりの見分けは data-note.ts。
-->
<script setup lang="ts">
import { ref } from "vue";
import { tr } from "../../i18n/lang";
import { SITE_DATA_HINT } from "./data-note";

const props = defineProps<{ text?: string; detail?: string; hint?: string; mark?: boolean; small?: boolean }>();
const open = ref(false);
const title = (): string => props.detail ?? props.hint ?? SITE_DATA_HINT();
</script>

<template>
  <span v-if="mark" data-site-note class="inline-grid size-3.5 shrink-0 place-items-center rounded-full bg-sky-300 align-[-2px] text-[10px] font-bold not-italic leading-none text-black" :title="title()" :aria-label="tr('サイトが決めた値', 'Site-chosen value')">i</span>
  <template v-else>
    <component
      :is="detail ? 'button' : 'span'"
      :type="detail ? 'button' : undefined"
      data-site-note
      class="inline-flex items-center gap-1.5 rounded-md bg-sky-400/15 text-left font-normal text-sky-100 ring-1 ring-sky-300/60"
      :class="small ? 'gap-1 whitespace-nowrap px-1 py-px text-[10px] leading-none' : 'px-2 py-0.5 text-[12px]'"
      :aria-expanded="detail ? open : undefined"
      :title="title()"
      @click.stop="detail && (open = !open)"
    >
      <span class="grid shrink-0 place-items-center rounded-full bg-sky-300 font-bold leading-none text-black" :class="small ? 'size-3 text-[9px]' : 'size-4 text-[11px]'">i</span>{{ text }}
    </component>
    <p v-if="detail && open" data-site-note-more class="mb-3 basis-full rounded-md bg-sky-400/10 px-3 py-2 text-[12px] font-normal leading-relaxed text-sky-50/90">{{ detail }}</p>
  </template>
</template>
