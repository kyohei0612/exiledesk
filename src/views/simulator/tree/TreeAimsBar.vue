<!--
  TreeAimsBar.vue — ツリーの上の帯: 欲しい MOD (このツリーで使っている当たりの札) の一覧と、ツリー全体のメモ (2026-10-22 オーナー)。
  札 = MOD + 段以上 + プレ / サフィ。完成の箱 (本命 / 妥協) に着く道で使っている札には印。押すとその札を使っている箱が光る (もう一度押すと消える)。
  メモは既定で閉じる (文字は最低限)。書き終えて欄を離れた時に保存 (1 つ戻すが 1 文字ずつにならないよう)
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Icon from "../../../components/ui/Icon.vue";
import { aimKey, setNote, type Aim, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { useTree } from "./use-tree";
import { tr } from "../../../i18n/lang";

const glow = defineModel<string | null>("glow", { default: null });
const t = useTree();

/** 完成の箱に着く道の札 (始まりからその箱まで通った当たりの箱の札) */
function pathAims(d: TreeDoc, id: string): Set<string> {
  const out = new Set<string>();
  for (let b: TreeDoc["boxes"][string] | undefined = d.boxes[id]; b; b = b.parent ? d.boxes[b.parent] : undefined) if (b.out === "hit" && b.aim) out.add(aimKey(b.aim));
  return out;
}
const chips = computed(() => {
  const d = t.doc.value;
  const done = Object.values(d.boxes).filter((b) => b.done);
  const main = new Set(done.filter((b) => b.done === "main").flatMap((b) => [...pathAims(d, b.id)]));
  const comp = new Set(done.filter((b) => b.done === "compromise").flatMap((b) => [...pathAims(d, b.id)]));
  const by = new Map<string, { aim: Aim; n: number }>();
  for (const b of Object.values(d.boxes)) if (b.out === "hit" && b.aim) { const k = aimKey(b.aim); const c = by.get(k); if (c) c.n++; else by.set(k, { aim: b.aim, n: 1 }); }
  return [...by.entries()].map(([k, v]) => ({ k, label: t.aimLabel(v.aim), n: v.n, main: main.has(k), comp: comp.has(k) }));
});

const memoOpen = ref(false);
const memo = ref(t.doc.value.note ?? "");
watch(() => t.doc.value.note, (v) => { memo.value = v ?? ""; });
function saveMemo(): void { if ((t.doc.value.note ?? "") !== memo.value) t.edit((d) => setNote(d, null, memo.value)); }
</script>

<template>
  <div data-tree-aims class="flex flex-col gap-1.5">
    <div class="flex flex-wrap items-center gap-1.5 text-[12px]">
      <span class="text-[var(--exile-color-text-secondary)]">{{ tr("欲しい MOD", "Wanted mods") }}:</span>
      <button v-for="c in chips" :key="c.k" type="button" data-tree-aim-chip class="inline-flex h-7 max-w-[300px] items-center gap-1 rounded-md border px-2"
        :class="glow === c.k ? 'border-amber-300 bg-amber-500/25 text-amber-50' : 'border-amber-500/40 bg-white/[0.04] text-[#c8c8ff] hover:border-amber-300/80'"
        :aria-pressed="glow === c.k" :title="tr(`この札を使っている箱 ${c.n} 個を光らせる`, `Highlight the ${c.n} boxes using this`)" @click="glow = glow === c.k ? null : c.k">
        <span class="min-w-0 truncate">{{ c.label }}</span>
        <span v-if="c.main" class="shrink-0 rounded-sm bg-amber-400/30 px-1 text-[10px] font-bold text-amber-100">{{ tr("本命", "Main") }}</span>
        <span v-if="c.comp" class="shrink-0 rounded-sm bg-slate-400/30 px-1 text-[10px] font-bold text-slate-100">{{ tr("妥協", "Comp.") }}</span>
      </button>
      <span v-if="!chips.length" class="opacity-50">{{ tr("当たりの箱で MOD を選ぶとここに並ぶ", "Pick mods in hit boxes to list them here") }}</span>
      <button type="button" data-tree-memo class="ml-auto inline-flex h-7 items-center gap-1 rounded-md border border-white/15 px-2 hover:border-amber-300/70" :aria-expanded="memoOpen" @click="memoOpen = !memoOpen">
        <Icon name="pencil" class="size-3.5" />{{ tr("メモ", "Notes") }}<span v-if="t.doc.value.note" class="size-1.5 rounded-full bg-amber-400" />
      </button>
    </div>
    <textarea v-if="memoOpen" v-model="memo" data-tree-memo-text rows="3" class="w-full rounded-md border border-white/15 bg-black/40 px-2 py-1 text-[13px] outline-none focus:border-amber-400/60" :placeholder="tr('このツリーのメモ (狙い・相場・決めた事など)', 'Notes for this tree (goals, prices, decisions…)')" @blur="saveMemo" />
  </div>
</template>
