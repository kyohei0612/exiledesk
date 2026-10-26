<!--
  PhoneMemo.vue — スマホ版のツリーのメモ (PC の TreeMemoFloat と同じ TreeDoc.note、文だけ。10-26 夜オーナーの「メモは文だけ」c18faf59)。
  書いてあれば全文を出す (省略しない、決まり 10)。✎ で書く欄を開く、打つたびに覚える (PC と同じ setTreeNote、1 つ戻すには入れない)
-->
<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { useTree } from "../tree/use-tree";
import { tr } from "../../../i18n/lang";

const editing = defineModel<boolean>("editing", { default: false });
const t = useTree();
const text = ref(t.doc.value.note ?? "");
// 別の木を開いた・1 つ戻した時は今の木のメモへ (書いている間は打った字を残す)
watch(() => t.doc.value.note, (n) => { if (!editing.value) text.value = n ?? ""; });
const area = ref<HTMLTextAreaElement | null>(null);
watch(editing, async (on) => { if (on) { text.value = t.doc.value.note ?? ""; await nextTick(); area.value?.focus(); } else t.setTreeNote(text.value.trim() ? text.value : ""); });
</script>

<template>
  <div v-if="editing" data-phone-memo-edit class="flex min-w-0 flex-col gap-2 rounded-xl border border-amber-300/40 bg-[#1a140d] px-3 py-2">
    <p class="text-[12px] font-bold text-[#f2d27a]">{{ tr("ツリーのメモ", "Tree note") }}</p>
    <textarea ref="area" v-model="text" data-phone-memo-text rows="4" class="w-full rounded-md border border-white/15 bg-black/40 px-2 py-1.5 leading-relaxed outline-none focus:border-amber-400/60" :placeholder="tr('例: 予算 50 神まで / 先にスピリット', 'e.g. Budget 50 div / spirit first')" @input="t.setTreeNote(text)" />
    <button type="button" data-phone-memo-done class="g-btn !min-h-10 self-end px-4" @click="editing = false">{{ tr("閉じる", "Close") }}</button>
  </div>
  <button v-else-if="t.doc.value.note" type="button" data-phone-memo class="min-h-10 w-full rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-left text-[13px]" @click="editing = true">
    <span class="block text-[11px] font-bold text-[#c9b48a]">{{ tr("ツリーのメモ ✎", "Tree note ✎") }}</span>
    <span class="block whitespace-pre-wrap break-words text-[#e8d8c8]">{{ t.doc.value.note }}</span>
  </button>
</template>
