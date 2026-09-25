<script setup lang="ts">
/**
 * TreeBranch.vue — ツリーの枝 1 本 (手のカード + ○ の子を下へ、× の子を右へ) (2026-09-24)
 *
 * オーナー:「ツリーの枝は作って良さそう UI、UX 的に」「進むにつれてツリーがデカくなるイメージ」。
 * 子は最初にたどり着いた枝だけに置き、戻る所 (既にある手)・完成・自動・未設定は札で出す ([[useCraftTree.ts]] の layout)。
 */
import { computed } from "vue";
import TreeNodeCard from "./TreeNodeCard.vue";
import { CERTAIN } from "../../services/htc/sim-route";
import type { useCraftTree } from "./useCraftTree";
import type { useHtcCraft } from "./useHtcCraft";

defineOptions({ name: "TreeBranch" });
const props = defineProps<{ c: ReturnType<typeof useHtcCraft>; t: ReturnType<typeof useCraftTree>; id: string }>();
const emit = defineEmits<{ (e: "focus", id: string): void; (e: "select", id: string): void }>();
const node = computed(() => props.t.nodes.value.find((n) => n.id === props.id)!);
const hitChild = computed(() => props.t.childOf(props.id, "onHit"));
const missChild = computed(() => props.t.childOf(props.id, "onMiss"));
/** 子として置かない行き先の札 */
/** 確定の手 (外れない) は × が要らない */
const certain = computed(() => !!node.value?.action && (CERTAIN.has(node.value.action.kind) || node.value.targets.length === 0));
function chip(g: string | null | undefined, miss = false): string {
  if (g == null) return miss && certain.value ? "外れない手" : "行き先を決める";
  if (g === props.id) return "↻ もう一度打つ";
  if (g === "done") return "完成";
  if (g === "auto") return "自動で戻る";
  return `↩ STEP ${props.t.indexOf(g) + 1} へ`;
}
</script>

<template>
  <!-- ○ の本線はまっすぐ縦に (下にずらさない)、× の枝だけ右へ。2026-09-24: ○ のたびに右へずれて線が何本も並んでいた -->
  <div v-if="node" class="flex flex-col">
    <div class="flex items-start gap-3">
      <div class="w-[31rem] shrink-0">
        <TreeNodeCard :c="c" :t="t" :node="node" :index="t.indexOf(id)" @focus="(x) => emit('focus', x)" @select="(x) => emit('select', x)" />
      </div>
      <!-- × の枝 (右へ) -->
      <div class="mt-4 shrink-0 border-t-2 border-rose-500/60 pt-1">
        <span class="text-xs font-bold text-rose-300">×</span>
        <TreeBranch v-if="missChild" :c="c" :t="t" :id="missChild" class="mt-1" @focus="(x) => emit('focus', x)" @select="(x) => emit('select', x)" />
        <span v-else class="ml-2 rounded border border-rose-500/40 px-1 text-xs" :class="node.onMiss ? '' : 'opacity-50'">{{ chip(node.onMiss, true) }}</span>
      </div>
    </div>
    <!-- ○ の本線 (下へ) -->
    <div class="flex items-center gap-2 py-1 pl-6 text-xs">
      <span class="h-4 border-l-2 border-emerald-500/60" />
      <span class="font-bold text-emerald-300">○</span>
      <span v-if="!hitChild" class="rounded border border-emerald-500/40 px-1" :class="node.onHit ? '' : 'opacity-50'">{{ chip(node.onHit) }}</span>
    </div>
    <TreeBranch v-if="hitChild" :c="c" :t="t" :id="hitChild" @focus="(x) => emit('focus', x)" @select="(x) => emit('select', x)" />
  </div>
</template>
