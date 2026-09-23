<script setup lang="ts">
/**
 * CraftTreePanel.vue — 作り方のツリーと、予算を入れて回した結果 (2026-09-24)
 *
 * オーナー:「ツリー上、シミュレーター方式。完成までの道のりを○×で進める。進むにつれてツリーがデカくなる。
 * 最終的に予算入力してシミュレーターかけて確率と予算内にできるか表示する」。中身は [[useCraftTree.ts]]。
 */
import { nextTick } from "vue";
import TreeBranch from "./TreeBranch.vue";
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
    <!-- 作り方の設定 (ツリーの上。オーナー 2026-09-24:「成功確率は 8 割になるまで試行とか、ツリーの上部に必要な設定」) -->
    <div class="mb-2 flex flex-wrap items-center gap-3 rounded bg-white/5 p-2 text-xs">
      <b class="opacity-70">作り方の設定</b>
      <label>予算 <input v-model.number="t.budgetDivine.value" type="number" min="1" step="50" class="num w-20" /> 神</label>
      <label>目標の成功確率 <input v-model.number="t.targetPct.value" type="number" min="1" max="100" step="5" class="num w-14" /> %</label>
      <label>回す回数 <input v-model.number="t.runs.value" type="number" min="100" step="500" class="num w-20" /> 回</label>
    </div>
    <p class="mb-2 text-xs opacity-60">
      手を組みます。各手で打つ物と○の条件、○ / × の行き先を選びます (最初は何も入っていません)。○ は下へ、× は右へ枝が伸びます。
      打つ物は、その手に来た時の指輪で打てる物だけ出ます。手 1 は ○ と × の両方の行き先が要ります。
    </p>
    <!-- 枝の図: ○ は下へ、× は右へ。横に広がるので横にスクロール -->
    <div class="overflow-x-auto pb-2">
      <TreeBranch v-if="t.nodes.value[0]" :c="c" :t="t" :id="t.nodes.value[0].id" @focus="focus" />
    </div>
    <!-- どこからも来ない手 (行き先から外した手など) -->
    <div v-if="t.unplaced.value.length" class="mt-2 space-y-2">
      <p class="text-xs opacity-60">つながっていない手 (どの ○ / × からも来ない)</p>
      <TreeNodeCard v-for="n in t.unplaced.value" :key="n.id" :c="c" :t="t" :node="n" :index="t.indexOf(n.id)" @focus="focus" />
    </div>

    <!-- 回した結果 -->
    <div class="mt-3 rounded border border-amber-500/40 bg-black/20 p-2 text-xs">
      <button type="button" class="rounded bg-amber-600/80 px-3 py-1 font-bold disabled:opacity-40" :disabled="t.running.value || !!t.blocked.value" @click="t.run()">
        {{ t.running.value ? `回しています… ${t.progress.value?.[0] ?? 0} / ${t.progress.value?.[1] ?? 0}` : `シミュレーション (${t.runs.value.toLocaleString()} 回)` }}
      </button>
      <span v-if="t.blocked.value" class="ml-2 text-rose-300">{{ t.blocked.value }}</span>
      <template v-if="t.result.value">
        <p class="mt-2">
          完成する <b class="text-emerald-300">{{ pct(t.result.value.pDone) }}</b>
          / 予算 {{ t.budgetDivine.value }} 神以内で完成 <b class="text-amber-300">{{ pct(t.result.value.pBudget ?? 0) }}</b>
        </p>
        <p>
          目標 {{ t.targetPct.value }}% で完成させるには
          <b class="text-amber-300">{{ t.needForTarget.value != null ? c.money(t.needForTarget.value) : "届かない (完成する確率が足りない)" }}</b>
          を用意
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
