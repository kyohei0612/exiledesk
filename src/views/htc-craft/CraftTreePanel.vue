<script setup lang="ts">
/**
 * CraftTreePanel.vue — 作り方のツリーと、予算を入れて回した結果 (2026-09-24)
 *
 * オーナー:「ツリー上、シミュレーター方式。完成までの道のりを○×で進める。進むにつれてツリーがデカくなる。
 * 最終的に予算入力してシミュレーターかけて確率と予算内にできるか表示する」。中身は [[useCraftTree.ts]]。
 */
import { nextTick } from "vue";
import TreeNodeCard from "./TreeNodeCard.vue";
import { useCraftTree } from "./useCraftTree";
import type { useHtcCraft } from "./useHtcCraft";

const props = defineProps<{ c: ReturnType<typeof useHtcCraft> }>();
const c = props.c;
const t = useCraftTree(c);
const pct = (p: number): string => `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`;
/** 新しい手を足したらそこへ */
async function focus(id: string): Promise<void> {
  await nextTick();
  document.getElementById(`node-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
</script>

<template>
  <div class="text-sm">
    <p class="mb-2 text-xs opacity-60">
      手を上から組みます。各手で打つ物と○の条件、○ / × の行き先を選びます (最初は何も入っていません)。
      打つ物は、その手に来た時の指輪で打てる物だけ出ます。手 1 は ○ と × の両方の行き先が要ります。
    </p>
    <div class="space-y-2">
      <TreeNodeCard v-for="(n, i) in t.nodes.value" :key="n.id" :c="c" :t="t" :node="n" :index="i" @focus="focus" />
    </div>

    <!-- 予算を入れて回す -->
    <div class="mt-3 rounded border border-amber-500/40 bg-black/20 p-2 text-xs">
      <div class="flex flex-wrap items-center gap-2">
        予算 <input v-model.number="t.budgetDivine.value" type="number" min="1" step="50" class="num w-20" /> 神
        <button type="button" class="rounded bg-amber-600/80 px-3 py-1 font-bold disabled:opacity-40" :disabled="t.running.value || !!t.blocked.value" @click="t.run()">
          {{ t.running.value ? `回しています… ${t.progress.value?.[0] ?? 0} / ${t.progress.value?.[1] ?? 0}` : "シミュレーション (2,000 回)" }}
        </button>
        <span v-if="t.blocked.value" class="text-rose-300">{{ t.blocked.value }}</span>
      </div>
      <template v-if="t.result.value">
        <p class="mt-2">
          完成する <b class="text-emerald-300">{{ pct(t.result.value.pDone) }}</b>
          / 予算 {{ t.budgetDivine.value }} 神以内で完成 <b class="text-amber-300">{{ pct(t.result.value.pBudget ?? 0) }}</b>
        </p>
        <p v-if="t.result.value.pDone > 0">
          完成した時の費用: 平均 <b>{{ c.money(t.result.value.expected) }}</b>
          / 半分 {{ c.money(t.result.value.p50) }} / 8 割 {{ c.money(t.result.value.p80) }} / 9 割 {{ c.money(t.result.value.p90) }}
        </p>
        <p class="mt-1 opacity-70">
          手ごと (1 回あたり): <span v-for="(p, i) in t.result.value.perNode" :key="p.id" class="mr-2">手 {{ i + 1 }} {{ p.tries.toFixed(1) }} 回 / {{ c.money(p.cost) }}</span>
        </p>
        <p v-for="s in t.result.value.stops" :key="s.reason" class="text-rose-300">止まった {{ pct(s.p) }}: {{ s.reason }}</p>
      </template>
    </div>
  </div>
</template>
