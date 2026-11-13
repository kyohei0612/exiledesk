<!--
  TreeTierPick.vue — 完成形のカードの段の札を押した時の段の一覧 (S-10f、スイッチ tierDown、見本 sim-lead27-tier-mock.png)。
  その MOD の付きうる段を全部並べ、今の段より下から下限を選ぶ (上げは無し = 上の段は灰色)。✦ の MOD は一覧を出さず一言だけ。
  100 人回した後は、段ごとに「下げると X%」(その段まで下げた木 (オーブは今のまま) を同じ種・同じ値段で 100 人回した完成率) を順に数えて出す。下げるのは 1 つ戻すで戻せる
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { tr } from "../../../i18n/lang";
import { useTree } from "./use-tree";
import { craftStage as s } from "../../../state/craft-stage";
import { useDismiss } from "../../../utils/use-dismiss";
import type { Aim, TreeDoc } from "../../../services/simulator/tree/tree-model";
import { canLowerGoal, isAimMod, lowerGoalTier } from "../../../services/simulator/tree/tree-tier-down";
import { runTreeSteps } from "../../../services/simulator/tree/tree-run";
import { withTreeTune } from "../../../services/simulator/tree/tree-tune";
import { capDivOf, runPrice } from "../../../services/simulator/tree/run-price";
import { RUN_N } from "./use-tree-run";

const props = defineProps<{ goal: Aim; x: number; y: number }>();
const emit = defineEmits<{ close: []; lowered: [modId: string] }>();
const t = useTree();
const box = ref<HTMLElement | null>(null);
useDismiss(() => true, [box], () => emit("close"));

const isGoal = (modId: string | undefined): boolean => !!modId && !!s.data.value && isAimMod(s.data.value, props.goal, modId);
const row = computed(() => t.rows.value.find((r) => isGoal(r.id) || r.tiers.some((x) => isGoal(x.modId))) ?? null);
/** この MOD の段 (束ねた行は同じ MOD の段だけ)。T1 が上 */
const tiers = computed(() => (row.value?.tiers ?? []).filter((x) => !x.modId || isGoal(x.modId)));
const now = computed(() => tiers.value.find((x) => x.tier === props.goal.tier) ?? null);
const head = computed(() => now.value?.text ?? row.value?.text ?? props.goal.modId);
const locked = computed(() => !s.data.value || !canLowerGoal(s.data.value, t.doc.value, props.goal));
const aimOf = (tier: number): Aim => ({ modId: props.goal.modId, tier });

/** 段 → 完成率 (0〜1)。回した後だけ、今の段から下へ順に数える (無い = まだ) */
const rates = ref<Record<number, number | null>>({});
let alive = true;
onBeforeUnmount(() => { alive = false; });
/** 木 d を 100 人回した完成率 (帯の 100 人回しと同じ種 1・同じ値段・同じ打ち止め)。間に画面を返す */
async function rateOf(d: TreeDoc): Promise<number | null> {
  const data = s.data.value;
  if (!data) return null;
  const price = runPrice(t.treePrice);
  const g = runTreeSteps(data, d, { n: RUN_N, seed: 1, price, capDiv: capDivOf(price), startCost: t.startPrice(), every: RUN_N, slice: 30 });
  let t0 = performance.now();
  for (;;) {
    const r = withTreeTune(d, () => g.next());
    if (r.done) return r.value.finished / (r.value.n || 1);
    if (!alive) return null;
    if (performance.now() - t0 > 30) { await new Promise((res) => setTimeout(res, 0)); t0 = performance.now(); if (!alive) return null; }
  }
}
async function countAll(): Promise<void> {
  const data = s.data.value;
  if (!data || locked.value || !t.runReady.value) return;
  const base = t.doc.value;
  for (const x of tiers.value.filter((x) => x.tier >= props.goal.tier)) {
    let d = base;
    if (x.tier > props.goal.tier) { d = JSON.parse(JSON.stringify(base)) as TreeDoc; lowerGoalTier(data, d, props.goal, aimOf(x.tier)); }
    const r = await rateOf(d);
    if (!alive || t.doc.value !== base) return;
    rates.value = { ...rates.value, [x.tier]: r };
  }
}
watch(() => props.goal, () => { rates.value = {}; void countAll(); }, { immediate: true });

const pct = (r: number | null | undefined): string => (r == null ? "…" : `${Math.round(r * 100)}%`);
function pick(tier: number): void {
  const data = s.data.value;
  if (!data || tier <= props.goal.tier) return;
  t.edit((d) => { lowerGoalTier(data, d, props.goal, aimOf(tier)); });
  emit("lowered", props.goal.modId);
  emit("close");
}
/** 押した札の左に出す (画面からはみ出さない) */
const W = 340;
const pos = computed(() => ({ left: `${Math.max(8, props.x - W - 12)}px`, top: `${Math.max(8, Math.min(props.y - 20, window.innerHeight - 400))}px`, width: `${W}px` }));
</script>

<template>
  <Teleport to="body">
    <div ref="box" data-tree-tier-pick class="fixed z-[80] rounded-lg border border-[#c9a45c]/70 bg-[#17120a] p-2 text-[12px] shadow-[0_8px_24px_rgba(0,0,0,0.75)]" :style="pos">
      <p class="mb-1 font-bold text-[#f2d27a]">{{ tr(`${head} の段 (下限を選ぶ)`, `${head}: minimum tier`) }}</p>
      <p v-if="locked" data-tree-tier-locked class="px-1 py-1 text-white/70">{{ tr("フラクチャーの候補は段を変えない", "Fracture candidates keep their tier") }}</p>
      <template v-else>
        <button v-for="x in tiers" :key="x.tier" type="button" :data-tree-tier="x.tier" :disabled="x.tier <= goal.tier"
          class="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left"
          :class="x.tier === goal.tier ? 'bg-[#c9a45c]/25 text-[#f2d27a]' : x.tier < goal.tier ? 'cursor-default text-white/30' : 'text-white/85 hover:bg-white/[0.07]'"
          @click="pick(x.tier)">
          <span class="w-6 shrink-0 font-bold tabular-nums">T{{ x.tier }}</span>
          <span class="min-w-0 flex-1 truncate">{{ x.text }}</span>
          <span class="w-10 shrink-0 text-right text-[11px] tabular-nums opacity-60">Lv{{ x.ilvl }}</span>
          <span class="w-[5.5rem] shrink-0 text-right text-[11px] tabular-nums" :class="x.tier < goal.tier ? '' : x.tier === goal.tier ? 'font-bold text-[#f2d27a]' : 'text-emerald-300'">
            <template v-if="x.tier < goal.tier">{{ tr("上げは無し", "No raising") }}</template>
            <template v-else-if="x.tier === goal.tier">{{ tr("今", "Now") }}{{ t.runReady.value ? ` ${pct(rates[x.tier])}` : "" }}</template>
            <template v-else-if="t.runReady.value">{{ tr("下げると", "Lower:") }} {{ pct(rates[x.tier]) }}</template>
            <template v-else>{{ tr("下げる", "Lower") }}</template>
          </span>
        </button>
        <p class="mt-1 px-1 text-[11px] leading-snug text-white/55">{{ tr("上 (灰色) は選べない。% は 100 人回した後だけ出す。下げると木の当たりの箱の段も下がる。今のオーブでその段が出ない手は、下げた後に替えるかを聞く (1 つ戻すで戻せる)", "Higher tiers (grey) can't be picked. % shows only after running 100. Lowering also lowers the hit boxes in the tree. If an orb in the tree cannot roll that tier, you will be asked whether to switch it (Undo restores it)") }}</p>
      </template>
    </div>
  </Teleport>
</template>
