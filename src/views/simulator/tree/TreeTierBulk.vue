<!--
  TreeTierBulk.vue — 完成形のカードの「ティア調整」で開く「狙うMODの一括ティア調整」(S-10f、スイッチ tierDown)。
  11-13 オーナー「ティア調整ボタンで、狙いモッド全て表示してティアをそこで選ばせる…プルダウンで⚪︎ティア以上ってやればおけ」:
  完成形の狙いを 1 行ずつ並べ、行ごとのプルダウンで「T○ 以上」を選ぶ (今の段と、それより下だけ。上げは無し)。✦ の行も選べる。
  開くのは完成形のカードのボタンだけ (2 完成の MOD の画面の右のカードと木の右のカード)。どこから開いても同じ窓 (11-13 オーナー「完成イメージカードだけでええんやないおくの」)。
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
import { fixedAfter, isAimMod, lowerGoalTier, lowerPlainTier, pinPlainTier } from "../../../services/simulator/tree/tree-tier-down";
import { flag } from "../../../web/release-flags";
import { sideOfMod } from "../../../services/craft-stage/engine";
import { runTreeSteps } from "../../../services/simulator/tree/tree-run";
import { withTreeTune } from "../../../services/simulator/tree/tree-tune";
import { capDivOf, runPrice } from "../../../services/simulator/tree/run-price";
import { RUN_N } from "./use-tree-run";

/** frac = 2 完成の MOD の画面から開いた (重ねる高さとオーブの注意書きだけが違う。✦ の行はどちらでも選べ、決めた段がフラクチャーの候補の下限、S-10f) */
defineProps<{ frac?: boolean }>();
const emit = defineEmits<{ close: []; lowered: [modIds: string[]] }>();
const t = useTree();
const box = ref<HTMLElement | null>(null);
useDismiss(() => true, [box], () => emit("close"));

/** plain = ✦ の印の狙いの普通側の行 (S-10g、fracDual)、base = その行の今の段 */
interface Line { goal: Aim; head: string; locked: boolean; plain: boolean; base: number; tiers: { tier: number; text: string; ilvl: number }[] }
/** 2 つ持ち (S-10g): ✦ の印が 2 つ以上の時、✦ の狙いを ✦ 側 / 普通側の 2 行に (どこから開いても) */
const DUAL = flag("fracDual");
const dualOn = computed(() => DUAL && t.goals.value.filter((a) => a.fractured).length >= 2);
/** 狙いごとの行 (この MOD の段だけ。今の段から下へ) */
const lines = computed<Line[]>(() => {
  const data = s.data.value;
  if (!data) return [];
  // 並び (11-13 オーナー「どーしてもプレサフィごちゃるね並び何でやろ」): 上からプレ (✦ を先) → サフィ、組の中は完成形のカードの順。前は狙いを設定した順のまま
  const card = [...(t.goalItem.value?.item.prefixes ?? []), ...(t.goalItem.value?.item.suffixes ?? [])];
  const at = (g: Aim): number => { const i = card.findIndex((m) => isAimMod(data, g, m.modId)); return i < 0 ? 999 : i; };
  const rank = (g: Aim): number => (sideOfMod(data, g.modId) === "prefix" ? 0 : 2) + (g.fractured ? 0 : 1);
  return [...t.goals.value].sort((a, z) => rank(a) - rank(z) || at(a) - at(z)).flatMap((goal) => {
    const is = (id: string | undefined): boolean => !!id && isAimMod(data, goal, id);
    const row = t.rows.value.find((r) => is(r.id) || r.tiers.some((x) => is(x.modId)));
    const all = (row?.tiers ?? []).filter((x) => !x.modId || is(x.modId));
    const now = all.find((x) => x.tier === goal.tier);
    const mk = (plain: boolean): Line => { const base = plain ? goal.plainTier ?? goal.tier : goal.tier; return { goal, plain, base, head: now?.text ?? row?.text ?? t.aimLabel(goal), locked: false, tiers: all.filter((x) => x.tier >= base).sort((a, z) => a.tier - z.tier) }; };
    return dualOn.value && goal.fractured ? [mk(false), mk(true)] : [mk(false)];
  });
});
/** 行ごとに選んだ段 (狙いの順。初めは今の段) */
const picked = ref<number[]>([]);
watch(lines, (ls) => { picked.value = ls.map((l) => l.base); }, { immediate: true });
const changed = computed(() => lines.value.filter((l, i) => !l.locked && (picked.value[i] ?? l.base) > l.base).length);
/**
 * 1 行を木 d に当てる。置いた当たりの箱・残す MOD の段も一緒に下げる (11-13 オーナー「一括やから変えるで」)。
 * 2 つ持ちの ✦ の MOD は、✦ 側 = 固定の前の箱だけ (普通側を今の段に留めてから)・普通側 = 固定の後の箱だけ (after = 書き換える前に作った fixedAfter)
 */
function lowerLine(data: NonNullable<typeof s.data.value>, d: TreeDoc, l: Line, tier: number, after: (boxId: string) => boolean): void {
  const dual = dualOn.value && !!l.goal.fractured;
  if (l.plain) { lowerPlainTier(data, d, l.goal, tier, after); return; }
  if (dual) pinPlainTier(data, d, l.goal);
  lowerGoalTier(data, d, l.goal, { modId: l.goal.modId, tier }, true, dual ? (id) => !after(id) : undefined);
}

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
      const want = ["now", ...lines.value.flatMap((l, i) => (!l.locked && (picked.value[i] ?? 0) > l.base ? [`${i}:${picked.value[i]}`] : []))].find((k) => !(k in rates.value));
      if (!want || !alive || t.doc.value !== base) return;
      let d = base;
      if (want !== "now") {
        const [i, tier] = want.split(":").map(Number) as [number, number];
        d = JSON.parse(JSON.stringify(base)) as TreeDoc;
        lowerLine(data, d, lines.value[i]!, tier, fixedAfter(data, d));
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
  const goals = lines.value.map((l, i) => ({ l, tier: picked.value[i] ?? l.base })).filter((x) => !x.l.locked && x.tier > x.l.base);
  // ✦ 側を先に (同じ MOD の普通側は後から plainTier を書く)
  t.edit((d) => { const after = fixedAfter(data, d); for (const x of [...goals.filter((g) => !g.l.plain), ...goals.filter((g) => g.l.plain)]) lowerLine(data, d, x.l, x.tier, after); });
  emit("lowered", goals.filter((x) => !x.l.plain).map((x) => x.l.goal.modId));
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <!-- 2 完成の MOD の画面 (ModalShell z-310) の上にも出す -->
    <div class="fixed inset-0 bg-black/40" :class="frac ? 'z-[320]' : 'z-[79]'" aria-hidden="true" />
    <div ref="box" data-tree-tier-bulk role="dialog" :aria-label="tr('狙うMODの一括ティア調整', 'Adjust target mod tiers')" :class="frac ? 'z-[321]' : 'z-[80]'"
      class="fixed left-1/2 top-[12vh] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-[#c9a45c]/70 bg-[#17120a] p-3 text-[13px] shadow-[0_8px_24px_rgba(0,0,0,0.75)]">
      <div class="mb-2 flex items-baseline gap-2">
        <p class="flex-1 text-[15px] font-bold text-[#f2d27a]">{{ tr("狙うMODの一括ティア調整", "Adjust target mod tiers") }}</p>
        <span v-if="t.runReady.value" data-tree-tier-now class="text-[12px] tabular-nums text-white/70">{{ tr("今の完成率", "Now") }} <b class="text-[#f2d27a]">{{ pct(rates.now) }}</b></span>
        <button type="button" class="rounded px-1.5 text-white/60 hover:bg-white/10 hover:text-white" :title="tr('閉じる', 'Close')" @click="emit('close')">×</button>
      </div>
      <div class="max-h-[60vh] overflow-y-auto">
        <div v-for="(l, i) in lines" :key="l.goal.modId + ':' + i" data-tree-tier-line :data-mod="l.goal.modId" :data-plain="l.plain ? '' : undefined" class="flex items-center gap-2 border-t border-white/[0.07] py-1.5">
          <span class="min-w-0 flex-1 truncate text-white/85" :title="l.head"><span v-if="l.goal.fractured && !l.plain" class="mr-1 text-[#9fd3ff]">✦</span><span v-if="dualOn && l.goal.fractured" data-tree-tier-side class="mr-1 rounded-sm px-1 text-[11px]" :class="l.plain ? 'bg-white/10 text-white/70' : 'bg-[#9fd3ff]/15 text-[#9fd3ff]'">{{ l.plain ? tr("フラクチャーしない時", "If not fractured") : tr("フラクチャー時", "If fractured") }}</span>{{ l.head }}</span>
          <span v-if="l.locked" data-tree-tier-locked class="shrink-0 text-[12px] text-white/50">{{ tr(`T${l.goal.tier} 以上のまま (フラクチャーの候補は 2 完成の MOD で決める)`, `Stays T${l.goal.tier}+ (set fracture candidates in step 2)`) }}</span>
          <template v-else>
            <select v-model.number="picked[i]" data-tree-tier-select :aria-label="tr(`${l.head} の段`, `${l.head} tier`)"
              class="w-[9.5rem] shrink-0 rounded border border-[#c9a45c]/50 bg-[#0f0b06] px-1 py-0.5 text-[12px] tabular-nums text-[#f2d27a]">
              <option v-for="x in l.tiers" :key="x.tier" :value="x.tier">{{ tr(`T${x.tier} 以上`, `T${x.tier}+`) }}{{ x.tier === l.base ? tr(" (今)", " (now)") : "" }} · Lv{{ x.ilvl }}</option>
            </select>
            <span class="w-[6.5rem] shrink-0 text-right text-[12px] tabular-nums" :class="(picked[i] ?? 0) > l.base ? 'text-emerald-300' : 'text-white/35'">
              <template v-if="(picked[i] ?? 0) <= l.base">{{ tr("そのまま", "Unchanged") }}</template>
              <template v-else-if="t.runReady.value">{{ tr("下げると", "Lower:") }} {{ pct(rates[`${i}:${picked[i]}`]) }}</template>
              <template v-else>{{ tr("下げる", "Lower") }}</template>
            </span>
          </template>
        </div>
      </div>
      <!-- 説明は初め閉じた「詳細ルール」の箇条書き (11-13 オーナー「ティア調整表の↓閉じてておけ、長ったらしい説明詳細ルールみたいなタイトルでいいから」) -->
      <details data-tree-tier-rules class="mt-2 text-[12px] leading-snug text-white/55">
        <summary class="cursor-pointer select-none text-white/70">{{ tr("詳細ルール", "Rules") }}</summary>
        <ul class="mt-1 list-disc space-y-0.5 pl-5">
          <li>{{ tr("選べるのは今の段と、それより下だけ", "Only the current tier or lower") }}</li>
          <li>{{ tr("% = 100 人回した後、その行だけ下げた時の完成率", "% = completion rate if only that row is lowered (after running 100)") }}</li>
          <li>{{ tr("決めると木の当たりの箱の段も下がる (1 つ戻すで戻せる)", "Applying also lowers the hit boxes in the tree (Undo restores)") }}</li>
          <li>{{ tr("今のオーブでその段が出ない手は、決めた後に替えるかを聞く", "If an orb can't roll the new tier, you'll be asked whether to switch it") }}</li>
          <li v-if="t.goals.value.some((a) => a.fractured)">{{ tr("フラクチャーの候補 (✦) も選べる。決めた段が付けたい MOD の下限", "Fracture candidates (✦) can be set too; the tier is their minimum") }}</li>
          <li v-if="dualOn">{{ tr("✦ の MOD は 2 行: フラクチャー時 = 固定される段 (固定の前に狙う段)・フラクチャーしない時 = 固定されずに残った時に要る段", "✦ mods have two rows: if fractured = tier to fix (aimed before fracturing); if not fractured = tier needed if it stays unfixed") }}</li>
        </ul>
      </details>
      <div class="mt-2 flex justify-end gap-2">
        <button type="button" class="g-btn sm" @click="emit('close')">{{ tr("やめる", "Cancel") }}</button>
        <button type="button" data-tree-tier-apply class="g-btn sm" :disabled="!changed" @click="apply">{{ tr("決定", "Confirm") }}</button>
      </div>
    </div>
  </Teleport>
</template>
