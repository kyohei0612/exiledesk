<!--
  TreeTierBulk.vue — 完成形のカードの「ティア調整」で開く「狙うMODの一括ティア調整」(S-10f、スイッチ tierDown)。
  11-13 オーナー「ティア調整ボタンで、狙いモッド全て表示してティアをそこで選ばせる…プルダウンで⚪︎ティア以上ってやればおけ」:
  完成形の狙いを 1 行ずつ並べ、行ごとのプルダウンで「T○ 以上」を選ぶ (今の段と、それより下だけ。上げは無し)。✦ の行は選ばせず一言だけ。
  「決める」で選んだ行を全部下げる (木の当たりの箱の段・残す MOD の段も一緒、1 つ戻すで戻せる)。今のオーブで出ない手は下げた後に TreeOrbAsk が聞く。
  100 人回した後は、行ごとに「その行だけ選んだ段まで下げた木」を同じ種・同じ値段で 100 人回した完成率を順に数えて出す
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

const emit = defineEmits<{ close: []; lowered: [modIds: string[]] }>();
const t = useTree();
const box = ref<HTMLElement | null>(null);
useDismiss(() => true, [box], () => emit("close"));

interface Line { goal: Aim; head: string; locked: boolean; tiers: { tier: number; text: string; ilvl: number }[] }
/** 狙いごとの行 (この MOD の段だけ。今の段から下へ) */
const lines = computed<Line[]>(() => {
  const data = s.data.value;
  if (!data) return [];
  return t.goals.value.map((goal) => {
    const is = (id: string | undefined): boolean => !!id && isAimMod(data, goal, id);
    const row = t.rows.value.find((r) => is(r.id) || r.tiers.some((x) => is(x.modId)));
    const all = (row?.tiers ?? []).filter((x) => !x.modId || is(x.modId));
    const now = all.find((x) => x.tier === goal.tier);
    return { goal, head: now?.text ?? row?.text ?? t.aimLabel(goal), locked: !canLowerGoal(data, t.doc.value, goal), tiers: all.filter((x) => x.tier >= goal.tier).sort((a, z) => a.tier - z.tier) };
  });
});
/** 行ごとに選んだ段 (狙いの順。初めは今の段) */
const picked = ref<number[]>([]);
watch(lines, (ls) => { picked.value = ls.map((l) => l.goal.tier); }, { immediate: true });
const changed = computed(() => lines.value.filter((l, i) => !l.locked && (picked.value[i] ?? l.goal.tier) > l.goal.tier).length);

/** 完成率 (鍵 = "now" か "行:段")。無い = まだ数えていない */
const rates = ref<Record<string, number | null>>({});
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
/** 数える物を順に 1 つずつ (今 → 選んだ行) */
let busy = false;
async function count(): Promise<void> {
  const data = s.data.value;
  if (busy || !data || !t.runReady.value) return;
  busy = true;
  try {
    const base = t.doc.value;
    for (;;) {
      const want = ["now", ...lines.value.flatMap((l, i) => (!l.locked && (picked.value[i] ?? 0) > l.goal.tier ? [`${i}:${picked.value[i]}`] : []))].find((k) => !(k in rates.value));
      if (!want || !alive || t.doc.value !== base) return;
      let d = base;
      if (want !== "now") {
        const [i, tier] = want.split(":").map(Number) as [number, number];
        const goal = lines.value[i]!.goal;
        d = JSON.parse(JSON.stringify(base)) as TreeDoc;
        lowerGoalTier(data, d, goal, { modId: goal.modId, tier });
      }
      const r = await rateOf(d);
      if (!alive || t.doc.value !== base) return;
      rates.value = { ...rates.value, [want]: r };
    }
  } finally { busy = false; }
}
watch([picked, () => t.runReady.value], () => void count(), { immediate: true, deep: true });

const pct = (r: number | null | undefined): string => (r == null ? "…" : `${Math.round(r * 100)}%`);
function apply(): void {
  const data = s.data.value;
  if (!data || !changed.value) return;
  const goals = lines.value.map((l, i) => ({ l, tier: picked.value[i] ?? l.goal.tier })).filter((x) => !x.l.locked && x.tier > x.l.goal.tier);
  t.edit((d) => { for (const x of goals) lowerGoalTier(data, d, x.l.goal, { modId: x.l.goal.modId, tier: x.tier }); });
  emit("lowered", goals.map((x) => x.l.goal.modId));
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[79] bg-black/40" aria-hidden="true" />
    <div ref="box" data-tree-tier-bulk role="dialog" :aria-label="tr('狙うMODの一括ティア調整', 'Adjust target mod tiers')"
      class="fixed left-1/2 top-[12vh] z-[80] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-[#c9a45c]/70 bg-[#17120a] p-3 text-[13px] shadow-[0_8px_24px_rgba(0,0,0,0.75)]">
      <div class="mb-2 flex items-baseline gap-2">
        <p class="flex-1 text-[15px] font-bold text-[#f2d27a]">{{ tr("狙うMODの一括ティア調整", "Adjust target mod tiers") }}</p>
        <span v-if="t.runReady.value" data-tree-tier-now class="text-[12px] tabular-nums text-white/70">{{ tr("今の完成率", "Now") }} <b class="text-[#f2d27a]">{{ pct(rates.now) }}</b></span>
        <button type="button" class="rounded px-1.5 text-white/60 hover:bg-white/10 hover:text-white" :title="tr('閉じる', 'Close')" @click="emit('close')">×</button>
      </div>
      <div class="max-h-[60vh] overflow-y-auto">
        <div v-for="(l, i) in lines" :key="l.goal.modId + ':' + i" data-tree-tier-line :data-mod="l.goal.modId" class="flex items-center gap-2 border-t border-white/[0.07] py-1.5">
          <span class="min-w-0 flex-1 truncate text-white/85" :title="l.head"><span v-if="l.goal.fractured" class="mr-1 text-[#9fd3ff]">✦</span>{{ l.head }}</span>
          <span v-if="l.locked" data-tree-tier-locked class="shrink-0 text-[12px] text-white/50">{{ tr(`T${l.goal.tier} 以上のまま (フラクチャーの候補は下げない)`, `Stays T${l.goal.tier}+ (fracture candidate)`) }}</span>
          <template v-else>
            <select v-model.number="picked[i]" data-tree-tier-select :aria-label="tr(`${l.head} の段`, `${l.head} tier`)"
              class="w-[9.5rem] shrink-0 rounded border border-[#c9a45c]/50 bg-[#0f0b06] px-1 py-0.5 text-[12px] tabular-nums text-[#f2d27a]">
              <option v-for="x in l.tiers" :key="x.tier" :value="x.tier">{{ tr(`T${x.tier} 以上`, `T${x.tier}+`) }}{{ x.tier === l.goal.tier ? tr(" (今)", " (now)") : "" }} · Lv{{ x.ilvl }}</option>
            </select>
            <span class="w-[6.5rem] shrink-0 text-right text-[12px] tabular-nums" :class="(picked[i] ?? 0) > l.goal.tier ? 'text-emerald-300' : 'text-white/35'">
              <template v-if="(picked[i] ?? 0) <= l.goal.tier">{{ tr("そのまま", "Unchanged") }}</template>
              <template v-else-if="t.runReady.value">{{ tr("下げると", "Lower:") }} {{ pct(rates[`${i}:${picked[i]}`]) }}</template>
              <template v-else>{{ tr("下げる", "Lower") }}</template>
            </span>
          </template>
        </div>
      </div>
      <p class="mt-2 text-[12px] leading-snug text-white/55">{{ tr("選べるのは今の段と、それより下だけ。% は 100 人回した後に、その行だけ下げた時の完成率を出す。決めると木の当たりの箱の段も下がる。今のオーブでその段が出ない手は、決めた後に替えるかを聞く (1 つ戻すで戻せる)", "Only the current tier or lower can be chosen. After running 100, each row shows the completion rate if only that row is lowered. Applying also lowers the hit boxes in the tree. If an orb can't roll the new tier you'll be asked whether to switch it (Undo restores it)") }}</p>
      <div class="mt-2 flex justify-end gap-2">
        <button type="button" class="g-btn sm" @click="emit('close')">{{ tr("やめる", "Cancel") }}</button>
        <button type="button" data-tree-tier-apply class="g-btn sm" :disabled="!changed" @click="apply">{{ changed ? tr(`${changed} つ下げる`, `Lower ${changed}`) : tr("下げる物なし", "Nothing to lower") }}</button>
      </div>
    </div>
  </Teleport>
</template>
