<!--
  TreePasteBox.vue — ベース選び (sim-base) の一覧の上の「アイテムを貼り付けて取り込む」(2026-10-25 オーナー「ベース一覧の所に分かりやすく出したいけどね」)。
  PC: 欄に貼る (Ctrl+V) と、その場で取り込む。スマホ: ボタン 1 つでクリップボードから (読めない端末は欄が出る)。
  読みと取り込みは tree-paste.ts (エンジンの parseItemText)。取り込めたら done (完成の MOD のページへ、読めなかった行はそちらで見せる)
-->
<script setup lang="ts">
import { ref } from "vue";
import Icon from "../../../components/ui/Icon.vue";
import { usePhone } from "../../../utils/use-phone";
import { track } from "../../../utils/track";
import { tr } from "../../../i18n/lang";
import { importPaste } from "./tree-paste";

const emit = defineEmits<{ done: [] }>();
const phone = usePhone();
const text = ref("");
const why = ref<string | null>(null);
/** スマホでクリップボードが読めなかった時は欄を出す */
const showArea = ref(false);
function run(v: string): void {
  if (!v.trim()) return;
  const r = importPaste(v);
  if (!r.ok) { why.value = r.why; return; }
  why.value = null; text.value = "";
  track("sim:paste");
  emit("done");
}
/** 欄に貼った = その場で取り込む (貼った後の文で) */
function onPaste(e: ClipboardEvent): void {
  const v = e.clipboardData?.getData("text") ?? "";
  if (v.trim()) { e.preventDefault(); text.value = v; run(v); }
}
async function fromClipboard(): Promise<void> {
  try { const v = await navigator.clipboard.readText(); if (v.trim()) { run(v); return; } } catch { /* 読めない端末は欄へ */ }
  showArea.value = true;
}
</script>

<template>
  <div data-tree-paste class="rounded-xl border border-amber-300/50 bg-gradient-to-b from-[#2a2014] to-[#16110a] px-3 py-2.5 text-[13px]">
    <p class="flex items-center gap-2 font-bold text-amber-100"><Icon name="copy" class="size-4" />{{ tr("アイテムを貼り付けて取り込む", "Import an item by pasting") }}</p>
    <p class="mt-0.5 text-[12px] text-[#c8bca4]">{{ tr("トレード・poe.ninja・ゲームの Ctrl+C の文を貼ると、ベースと付いている MOD (完成の狙い) が入ります", "Paste text from the trade site, poe.ninja or in-game Ctrl+C: the base and its mods (as final targets) are filled in") }}</p>
    <button v-if="phone && !showArea" type="button" data-tree-paste-clip class="g-btn mt-2 min-h-11 w-full" @click="fromClipboard">{{ tr("コピーした文を貼り付けて取り込む", "Paste the copied text and import") }}</button>
    <div v-else class="mt-2 flex items-stretch gap-2">
      <textarea v-model="text" data-tree-paste-area rows="2" spellcheck="false" class="min-w-0 flex-1 resize-y rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-[12px] outline-none placeholder:opacity-50 focus:border-amber-400/60" :placeholder="tr('ここに貼る (Ctrl+V) と取り込む', 'Paste here (Ctrl+V) to import')" @paste="onPaste" />
      <button type="button" data-tree-paste-go class="g-btn sm shrink-0" :disabled="!text.trim()" @click="run(text)">{{ tr("取り込む", "Import") }}</button>
    </div>
    <p v-if="why" data-tree-paste-why class="mt-1.5 text-[12px] text-rose-200">{{ tr(`取り込めなかった: ${why}`, `Couldn't import: ${why}`) }}</p>
  </div>
</template>
