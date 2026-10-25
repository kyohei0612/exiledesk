<!--
  TreePasteNote.vue — 貼り付けで取り込んだ結果 (完成の MOD のページの上、tree-paste.ts の pasteNote)。
  何を入れたかを 1 行、読めなかった行・狙いにできなかった MOD は捨てずに理由つきで (既定は閉じる)。× で閉じる
-->
<script setup lang="ts">
import { ref } from "vue";
import { tr } from "../../../i18n/lang";
import { pasteNote } from "./tree-paste";

const open = ref(false);
</script>

<template>
  <div v-if="pasteNote" data-tree-paste-note class="mx-3 mb-2 rounded-lg border border-emerald-400/40 bg-emerald-950/40 px-3 py-1.5 text-[12px]">
    <p class="flex min-w-0 items-center gap-2">
      <span class="min-w-0 flex-1 truncate text-emerald-100">{{ tr(`貼り付けから取り込んだ: ${pasteNote.base} · 狙い ${pasteNote.aims} つ (ここで直せる)`, `Imported from paste: ${pasteNote.base} · ${pasteNote.aims} target(s) (edit them here)`) }}</span>
      <button v-if="pasteNote.bad.length" type="button" data-tree-paste-bad class="shrink-0 rounded px-1.5 text-amber-200 hover:bg-white/10" :aria-expanded="open" @click="open = !open">{{ tr(`読めなかった行 ${pasteNote.bad.length}`, `${pasteNote.bad.length} line(s) not used`) }} {{ open ? "▾" : "▸" }}</button>
      <button type="button" class="shrink-0 rounded px-1 opacity-60 hover:bg-white/10 hover:opacity-100" :aria-label="tr('閉じる', 'Close')" @click="pasteNote = null">×</button>
    </p>
    <ul v-if="open" data-tree-paste-bad-list class="mt-1 flex flex-col gap-0.5">
      <li v-for="(b, i) in pasteNote.bad" :key="i" class="min-w-0 break-words"><span class="text-[#e6dcc6]">{{ b.line }}</span> <span class="text-amber-200/80">— {{ b.why }}</span></li>
    </ul>
  </div>
</template>
