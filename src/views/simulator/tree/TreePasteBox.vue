<!--
  TreePasteBox.vue — ベース選び (sim-base) の一覧の上の「アイテムを貼り付けて取り込む」(2026-10-25 オーナー「ベース一覧の所に分かりやすく出したいけどね」)。
  PC: 欄に貼る (Ctrl+V) と、その場で取り込む。スマホ: ボタン 1 つでクリップボードから (読めない端末は欄が出る)。
  読みと取り込み・完成の MOD のページへ移るのは tree-paste.ts (エンジンの parseItemText)。枠の外の Ctrl+V も同じ所が受ける (usePasteAnywhere)
-->
<script setup lang="ts">
import { ref } from "vue";
import Icon from "../../../components/ui/Icon.vue";
import HelpTip from "../../../components/ui/HelpTip.vue";
import { usePhone } from "../../../utils/use-phone";
import { tr } from "../../../i18n/lang";
import { pasteWhy, requestPaste } from "./tree-paste";

const phone = usePhone();
const text = ref("");
/** スマホでクリップボードが読めなかった時は欄を出す */
const showArea = ref(false);
function run(v: string): void { if (requestPaste(v) && !pasteWhy.value) text.value = ""; }
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
  <!-- PC は 1 行 (題・? の説明・欄・取り込む)。アミュレットの段が 1660×860 で画面の下の外だった、10-26 モンキー 7 の 20。スマホはボタン 1 つで今のまま -->
  <div data-tree-paste class="rounded-xl border border-amber-300/50 bg-gradient-to-b from-[#2a2014] to-[#16110a] px-3 py-2 text-[13px]">
    <div class="flex min-w-0 items-center gap-2 max-md:flex-wrap">
      <p class="flex shrink-0 items-center gap-1.5 font-bold text-amber-100"><Icon name="copy" class="size-4" />{{ tr("アイテムを貼り付けて取り込む", "Import an item by pasting") }}<HelpTip :text="tr('トレード・poe.ninja・ゲームの Ctrl+C の文を貼ると、ベースと付いている MOD (完成の狙い) が入ります (シミュのどの画面で Ctrl+V しても同じ)', 'Paste text from the trade site, poe.ninja or in-game Ctrl+C: the base and its mods (as final targets) are filled in (Ctrl+V works on any simulator screen)')" /></p>
      <button v-if="phone && !showArea" type="button" data-tree-paste-clip class="g-btn min-h-11 w-full" @click="fromClipboard">{{ tr("コピーした文を貼り付けて取り込む", "Paste the copied text and import") }}</button>
      <template v-else>
        <textarea v-model="text" data-tree-paste-area rows="1" spellcheck="false" class="h-9 min-w-0 flex-1 resize-none rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-[12px] outline-none placeholder:opacity-50 focus:border-amber-400/60 max-md:basis-full" :placeholder="tr('ここに貼る (Ctrl+V) と取り込む', 'Paste here (Ctrl+V) to import')" @paste="onPaste" />
        <button type="button" data-tree-paste-go class="g-btn sm shrink-0" :disabled="!text.trim()" @click="run(text)">{{ tr("取り込む", "Import") }}</button>
      </template>
    </div>
    <p v-if="pasteWhy" data-tree-paste-why class="mt-1.5 text-[12px] text-rose-200">{{ tr(`取り込めなかった: ${pasteWhy}`, `Couldn't import: ${pasteWhy}`) }}</p>
  </div>
</template>
