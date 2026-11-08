<!--
  DataNote.vue — 「この数字はゲームの公表ではなく、サイトが借りた・決めた・推定した物」の札 (U-18、2026-11-08 オーナー「注意書きはE」= 青の情報の札)。
  札: i の丸 + 短い文。detail を渡すと押して出どころの詳しい文を開く (スマホはホバーが無い)。hint だけならホバーの文。
  mark: 文の頭に置く i の丸だけ (説明の窓の中の行・小さな札)。決まりの見分けは data-note.ts。
  説明は「・」の縦の箇条書き (行の並びで渡す。1 本の文字列なら 1 行)。PC は乗せると小窓で、押すと札の下に開く (11-09 オーナー「区切った方が良いね　・　で縦にホバー時の説明」)。
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { tr } from "../../i18n/lang";
import { SITE_DATA_HINT, type NoteLines } from "./data-note";

const props = defineProps<{ text?: string; detail?: NoteLines; hint?: NoteLines; mark?: boolean; small?: boolean }>();
const open = ref(false);
const lines = computed((): readonly string[] => {
  const v = props.detail ?? props.hint ?? SITE_DATA_HINT();
  return typeof v === "string" ? [v] : v;
});
/** ホバーの小窓が出せない所 (スマホ・読み上げ) 向けの title も縦に */
const title = computed(() => lines.value.map((l) => `・${l}`).join("\n"));
</script>

<template>
  <span class="group/note relative inline-flex" :class="mark ? 'shrink-0' : 'max-w-full'">
    <span v-if="mark" data-site-note class="inline-grid size-3.5 shrink-0 cursor-help place-items-center rounded-full bg-sky-300 align-[-2px] text-[10px] font-bold not-italic leading-none text-black" :title="title" :aria-label="tr('サイトが決めた値', 'Site-chosen value')">i</span>
    <component
      :is="detail ? 'button' : 'span'"
      v-else
      :type="detail ? 'button' : undefined"
      data-site-note
      class="inline-flex items-center gap-1.5 rounded-md bg-sky-400/15 text-left font-normal text-sky-100 ring-1 ring-sky-300/60"
      :class="small ? 'gap-1 whitespace-nowrap px-1 py-px text-[10px] leading-none' : 'px-2 py-0.5 text-[12px]'"
      :aria-expanded="detail ? open : undefined"
      :title="title"
      @click.stop="detail && (open = !open)"
    >
      <span class="grid shrink-0 place-items-center rounded-full bg-sky-300 font-bold leading-none text-black" :class="small ? 'size-3 text-[9px]' : 'size-4 text-[11px]'">i</span>{{ text }}
    </component>
    <!-- PC: 乗せると「・」の縦の小窓 (押して開いている時は出さない) -->
    <ul v-if="!open" data-site-note-tip class="pointer-events-none absolute left-0 top-full z-40 mt-1 hidden w-max max-w-[22rem] rounded-md bg-sky-950 px-3 py-2 text-left text-[12px] font-normal leading-relaxed text-sky-50 shadow-lg ring-1 ring-sky-300/50 md:group-hover/note:block">
      <li v-for="(l, i) in lines" :key="i" class="flex gap-1"><span class="text-sky-300">・</span><span>{{ l }}</span></li>
    </ul>
  </span>
  <ul v-if="detail && open" data-site-note-more class="mb-3 basis-full rounded-md bg-sky-400/10 px-3 py-2 text-[12px] font-normal leading-relaxed text-sky-50/90">
    <li v-for="(l, i) in lines" :key="i" class="flex gap-1"><span class="text-sky-300">・</span><span>{{ l }}</span></li>
  </ul>
</template>
