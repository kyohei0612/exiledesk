<script setup lang="ts">
/**
 * TreeBranch.vue — ツリーの枝 1 本 (手のカード + ○ の子を下へ、× の子を右へ) (2026-09-24)
 *
 * オーナー:「ツリーの枝は作って良さそう UI、UX 的に」「進むにつれてツリーがデカくなるイメージ」。
 * 子は最初にたどり着いた枝だけに置き、戻る所 (既にある手)・完成・自動・未設定は札で出す ([[useCraftTree.ts]] の layout)。
 */
import { computed } from "vue";
import TreeNodeCard from "./TreeNodeCard.vue";
import type { useCraftTree } from "./useCraftTree";
import type { useHtcCraft } from "./useHtcCraft";

defineOptions({ name: "TreeBranch" });
const props = defineProps<{ c: ReturnType<typeof useHtcCraft>; t: ReturnType<typeof useCraftTree>; id: string }>();
const emit = defineEmits<{ (e: "focus", id: string): void }>();
const node = computed(() => props.t.nodes.value.find((n) => n.id === props.id)!);
const hitChild = computed(() => props.t.childOf(props.id, "onHit"));
const missChild = computed(() => props.t.childOf(props.id, "onMiss"));
/** 子として置かない行き先の札 */
function chip(g: string | null | undefined): string {
  if (g == null) return "未設定";
  if (g === "done") return "完成";
  if (g === "auto") return "自動 (消えた物を見て戻る)";
  return `↩ 手 ${props.t.indexOf(g) + 1} へ`;
}
</script>

<template>
  <!-- ○ の本線はまっすぐ縦に (下にずらさない)、× の枝だけ右へ。2026-09-24: ○ のたびに右へずれて線が何本も並んでいた -->
  <div v-if="node" class="flex flex-col">
    <div class="flex items-start gap-3">
      <div class="w-[31rem] shrink-0">
        <TreeNodeCard :c="c" :t="t" :node="node" :index="t.indexOf(id)" @focus="(x) => emit('focus', x)" />
      </div>
      <!-- × の枝 (右へ) -->
      <div class="mt-4 shrink-0 border-t-2 border-rose-500/60 pt-1">
        <span class="text-xs font-bold text-rose-300">×</span>
        <TreeBranch v-if="missChild" :c="c" :t="t" :id="missChild" class="mt-1" @focus="(x) => emit('focus', x)" />
        <span v-else class="ml-2 rounded border border-rose-500/40 px-1 text-xs" :class="node.onMiss ? '' : 'opacity-50'">{{ chip(node.onMiss) }}</span>
      </div>
    </div>
    <!-- ○ の本線 (下へ) -->
    <div class="flex items-center gap-2 py-1 pl-6 text-xs">
      <span class="h-4 border-l-2 border-emerald-500/60" />
      <span class="font-bold text-emerald-300">○</span>
      <span v-if="!hitChild" class="rounded border border-emerald-500/40 px-1" :class="node.onHit ? '' : 'opacity-50'">{{ chip(node.onHit) }}</span>
    </div>
    <TreeBranch v-if="hitChild" :c="c" :t="t" :id="hitChild" @focus="(x) => emit('focus', x)" />
  </div>
</template>
