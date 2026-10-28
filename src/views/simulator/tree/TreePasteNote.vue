<!--
  TreePasteNote.vue — 貼り付けで取り込んだ結果 (完成の MOD のページの上、tree-paste.ts の pasteNote)。
  何を入れたかを 1 行、読めなかった行・狙いにできなかった MOD は捨てずに理由つきで (既定は閉じる)。× で閉じる。
  合算の行の分け方が何通りも残る時だけ「仮の読み ▸」: 候補の一覧から 1 押しで切り替え、狙いが入れ替わる (10-25 オーナー、読み方はジン部長の parseItemText の readings)
  スマホは「取り込んだ … 狙い n つ (ここで直せる)」の文を出さず、読めなかった行 (と読み方の候補) がある時だけ 1 行。全部読めたら札ごと出さない
  (10-26 夜オーナー「スマホ版だし不要かな。読めなかった、だけでいいかな。1 行で、展開で文字量が多いとね」)
-->
<script setup lang="ts">
import { ref } from "vue";
import { tr } from "../../../i18n/lang";
import { TIER } from "../../../state/for-share/tier-word";
import { pasteNote, pickReading, readingLabel } from "./tree-paste";
import { usePhone } from "../../../utils/use-phone";

const phone = usePhone();

const open = ref(false);
const readOpen = ref(false);
</script>

<template>
  <div v-if="pasteNote && (!phone || pasteNote.bad.length || pasteNote.readings)" data-tree-paste-note class="mx-3 mb-2 rounded-lg border border-emerald-400/40 bg-emerald-950/40 px-3 py-1.5 text-[12px]">
    <p class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span v-if="!phone" class="min-w-0 flex-1 basis-48 truncate max-md:overflow-visible max-md:whitespace-normal max-md:break-words text-emerald-100">{{ pasteNote.emu ? tr(`エミュレーターから取り込んだ: ${pasteNote.base} · 狙い ${pasteNote.aims} つ (ここで直せる)`, `Imported from the emulator: ${pasteNote.base} · ${pasteNote.aims} target(s) (edit them here)`) : tr(`貼り付けから取り込んだ: ${pasteNote.base} · 狙い ${pasteNote.aims} つ (ここで直せる)`, `Imported from paste: ${pasteNote.base} · ${pasteNote.aims} target(s) (edit them here)`) }}</span>
      <button v-if="pasteNote.readings" type="button" data-tree-paste-readings class="shrink-0 rounded border border-amber-300/60 px-1.5 text-amber-100 hover:bg-white/10" :aria-expanded="readOpen" :title="tr(`1 行に足された数値の分け方が何通りもあるので、${TIER}を仮に決めた。押すとほかの読み方に替えられる`, 'A summed line can be split several ways, so the tiers are a guess. Click to pick another reading')" @click="readOpen = !readOpen">{{ tr(`仮の読み (${pasteNote.readings.length} 通り)`, `Guessed reading (${pasteNote.readings.length})`) }} {{ readOpen ? "▾" : "▸" }}</button>
      <button v-if="pasteNote.bad.length" type="button" data-tree-paste-bad class="shrink-0 rounded px-1.5 text-amber-200 hover:bg-white/10" :aria-expanded="open" @click="open = !open">{{ pasteNote.emu ? tr(`狙いにできなかった MOD ${pasteNote.bad.length}`, `${pasteNote.bad.length} mod(s) not used`) : tr(`読めなかった行 ${pasteNote.bad.length}`, `${pasteNote.bad.length} line(s) not used`) }} {{ open ? "▾" : "▸" }}</button>
      <button type="button" class="shrink-0 rounded px-1 opacity-60 hover:bg-white/10 hover:opacity-100" :aria-label="tr('閉じる', 'Close')" @click="pasteNote = null">×</button>
    </p>
    <!-- 段が仮の MOD (1 行に足された値の割り方が決まらず、単体の MOD を高い段に置いた。読み方の候補が無い時もここで分かる) -->
    <p v-if="pasteNote.guess.length" data-tree-paste-guess class="mt-1 min-w-0 truncate max-md:overflow-visible max-md:whitespace-normal max-md:break-words text-amber-200/90" :title="pasteNote.guess.join('\n')">{{ tr(`${TIER}は目安 (1 行に足された値から): ${pasteNote.guess.join("・")}`, `Tiers are a guess (from a summed line): ${pasteNote.guess.join(", ")}`) }}</p>
    <!-- 候補 (1 押しで切り替え。見出しはほかの読み方と違う MOD だけ、? = 段は目安) -->
    <div v-if="readOpen && pasteNote.readings" data-tree-paste-reading-list class="mt-1 flex flex-col gap-1">
      <button v-for="(_, i) in pasteNote.readings" :key="i" type="button" data-tree-paste-reading :data-i="i" class="min-w-0 rounded-md border px-2 py-1 text-left" :class="i === pasteNote.pick ? 'border-amber-300/80 bg-amber-500/15 text-amber-50' : 'border-white/10 text-[#d8ccb4] hover:bg-white/[0.06]'" :aria-pressed="i === pasteNote.pick" @click="pickReading(i)">
        <span class="mr-1.5 text-[11px] opacity-70">{{ i === 0 ? tr("仮:", "Guess:") : tr(`候補 ${i}:`, `Option ${i}:`) }}</span>{{ readingLabel(i) }}
      </button>
    </div>
    <ul v-if="open" data-tree-paste-bad-list class="mt-1 flex flex-col gap-0.5">
      <li v-for="(b, i) in pasteNote.bad" :key="i" class="min-w-0 break-words"><span class="text-[#e6dcc6]">{{ b.line }}</span> <span class="text-amber-200/80">— {{ b.why }}</span></li>
    </ul>
  </div>
</template>
