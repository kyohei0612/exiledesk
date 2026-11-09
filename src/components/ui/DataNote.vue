<!--
  DataNote.vue — 「この数字はゲームの公表ではなく、サイトが借りた・決めた・推定した物」の札 (U-18、2026-11-08 オーナー「注意書きはE」= 青の情報の札)。
  札: i の丸 + 短い文。detail を渡すと押して出どころの詳しい文を開く (スマホはホバーが無い)。hint だけならホバーの文。
  mark: 文の頭に置く i の丸だけ (説明の窓の中の行・小さな札)。決まりの見分けは data-note.ts。
  説明は「・」の縦の箇条書き (行の並びで渡す。1 本の文字列なら 1 行)。PC は乗せると小窓で、押すと札の下に開く (11-09 オーナー「区切った方が良いね　・　で縦にホバー時の説明」)。
  小窓は乗せた時に測って画面の中に収める: 下にはみ出すなら札の上へ返し、左右にはみ出すなら横にずらす (11-09 猿の 1660「下の方の節の小窓が画面の下にはみ出す」)。
-->
<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { tr } from "../../i18n/lang";
import { SITE_DATA_HINT, type NoteLines } from "./data-note";

/** tip = 乗せた時の小窓の寄せ (既定は札の左端から。真ん中に置いた札は center、右寄せの札は right) */
const props = defineProps<{ text?: string; detail?: NoteLines; hint?: NoteLines; mark?: boolean; small?: boolean; tip?: "left" | "center" | "right" }>();
const TIP_AT = { left: "left-0", center: "left-1/2 -translate-x-1/2", right: "right-0" } as const;
const open = ref(false);
/** 小窓の置き場 (乗せた時に決める): up = 札の上に返す、dx = 横のずらし (px) */
const tipEl = ref<HTMLElement | null>(null);
const up = ref(false);
const dx = ref(0);
const EDGE = 8;
/** 押して開いた説明は見えるまで送る (画面の下の札でも 1 行だけにならない) */
const moreEl = ref<HTMLElement | null>(null);
async function toggle() {
  open.value = !open.value;
  if (!open.value) return;
  await nextTick();
  moreEl.value?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
function placeTip(e: MouseEvent) {
  const el = tipEl.value;
  if (!el || !el.offsetParent) return; // スマホなど小窓を出さない幅
  const at = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const vw = document.documentElement.clientWidth;
  const below = vh - at.bottom;
  up.value = at.bottom + 4 + r.height > vh - EDGE && at.top > below;
  const left = r.left - dx.value;
  dx.value = left + r.width > vw - EDGE ? Math.max(EDGE - left, vw - EDGE - left - r.width) : left < EDGE ? EDGE - left : 0;
}
const lines = computed((): readonly string[] => {
  const v = props.detail ?? props.hint ?? SITE_DATA_HINT();
  return typeof v === "string" ? [v] : v;
});
/** 読み上げ向けの説明。ブラウザの title は付けない (青の小窓と二重に出る、11-09 オーナー「ホバーで古い詳細がシンプルな枠で出ちゃう」) */
const said = computed(() => lines.value.join("。"));
</script>

<template>
  <span class="group/note relative inline-flex" :class="mark ? 'shrink-0' : 'max-w-full'" @mouseenter="placeTip">
    <span v-if="mark" data-site-note class="inline-grid size-3.5 shrink-0 cursor-help place-items-center rounded-full bg-sky-300 align-[-2px] text-[10px] font-bold not-italic leading-none text-black" role="img" :aria-label="`${tr('サイトが決めた値', 'Site-chosen value')}: ${said}`">i</span>
    <component
      :is="detail ? 'button' : 'span'"
      v-else
      :type="detail ? 'button' : undefined"
      data-site-note
      class="inline-flex items-center gap-1.5 rounded-md bg-sky-400/15 text-left font-normal text-sky-100 ring-1 ring-sky-300/60"
      :class="small ? 'gap-1 whitespace-nowrap px-1 py-px text-[10px] leading-none' : 'px-2 py-0.5 text-[12px]'"
      :aria-expanded="detail ? open : undefined"
      @click.stop="detail && toggle()"
    >
      <span class="grid shrink-0 place-items-center rounded-full bg-sky-300 font-bold leading-none text-black" :class="small ? 'size-3 text-[9px]' : 'size-4 text-[11px]'" aria-hidden="true">i</span>{{ text }}<span v-if="!detail || !open" class="sr-only">: {{ said }}</span>
    </component>
    <!-- PC: 乗せると「・」の縦の小窓 (押して開いている時は出さない。画面の外にはみ出す時は上・横へ = placeTip) -->
    <ul v-if="!open" ref="tipEl" data-site-note-tip :class="[TIP_AT[tip ?? 'left'], up ? 'bottom-full mb-1' : 'top-full mt-1']" :style="dx ? { transform: `translateX(${dx}px)` } : undefined" class="pointer-events-none absolute z-40 hidden w-max max-w-[22rem] rounded-md bg-sky-950 px-3 py-2 text-left text-[12px] font-normal leading-relaxed text-sky-50 shadow-lg ring-1 ring-sky-300/50 md:group-hover/note:block">
      <li v-for="(l, i) in lines" :key="i" class="flex gap-1"><span class="text-sky-300">・</span><span>{{ l }}</span></li>
    </ul>
  </span>
  <ul v-if="detail && open" ref="moreEl" data-site-note-more class="mb-3 basis-full rounded-md bg-sky-400/10 px-3 py-2 text-[12px] font-normal leading-relaxed text-sky-50/90">
    <li v-for="(l, i) in lines" :key="i" class="flex gap-1"><span class="text-sky-300">・</span><span>{{ l }}</span></li>
  </ul>
</template>
