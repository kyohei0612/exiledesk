<!--
  StageFlowEditor.vue — シミュレーションの 6 パターンを「流れ」で組む (2026-10-08、Craft of Exile の Simulator と同じ形)。
  オーナー「Craft of Exile の Simulator 視覚的にめっちゃ好み、全てが回ってる感じ」「起こりうる状況を全てユーザーが選ぶ、それがシミュレーション」
  「カレンシーを決める所は文字じゃなくてアイコン、エンジンを使って」。

  手 = 打つ物 1 つ (お告げ込み。棚と同じ札 StagePatternStepPicker で選ぶ)。打った後は「行き先」を上から見て、条件が全部合った最初の所へ
  (手 / 完成 / 新しいベースで最初から)。どれにも合わなければ もう一度 / 最初から / 終わり。計算は recipe-sim.ts の runFlow。
  左は流れの図 (手は上から自動で並べる。矢印に回した数、よく通る道は太く、前の手に戻る矢印は赤)、右は選んだ手の設定
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { craftStage, iconOf, nameOf } from "../../state/craft-stage";
import { patternSets, setByKey, type FlowDef, type FlowStepDef, type PatternSet } from "../../services/craft-stage/pattern";
import type { FlowCond, FlowRoute } from "../../services/craft-stage/recipe-sim";
import { fillModText } from "../../services/htc/mod-text";
import { tierDisplayRanges } from "../../services/mods/stat-scale";
import StagePatternStepPicker from "./StagePatternStepPicker.vue";

const props = defineProps<{
  flow: FlowDef;
  /** 回した結果 (手ごとの 1 人あたりの来た回数・行き先ごとの通った回数) と人数 */
  stats?: { visits: number[]; routes: number[][]; runs: number } | null;
  locked?: boolean;
}>();
const emit = defineEmits<{ change: [flow: FlowDef] }>();
const s = craftStage;

const sets = computed<PatternSet[]>(() => (s.item.value ? patternSets(s.item.value.cls).filter((x) => x.kind !== "rune") : []));
const steps = computed(() => props.flow.steps);
const sel = ref<number | null>(steps.value.length ? 0 : null);

function update(fn: (list: FlowStepDef[]) => FlowStepDef[]): void {
  emit("change", { ...props.flow, steps: fn(props.flow.steps.map((x) => ({ ...x, routes: x.routes.map((r) => ({ ...r, conds: r.conds.map((c) => ({ ...c })) })) }))) });
}
function addStep(): void {
  const n = steps.value.length;
  update((l) => {
    // 前の手の「どれにも合わない」を新しい手へ繋ぐのではなく、行き先を 1 つ足しておく (全部揃った → 完成 が既定)
    return [...l, { set: "", routes: [{ conds: [{ k: "all" }], to: "done" }], onNone: "loop" }];
  });
  sel.value = n;
}
function removeStep(i: number): void {
  update((l) => l.filter((_, k) => k !== i).map((x) => ({ ...x, routes: x.routes.filter((r) => r.to !== i).map((r) => ({ ...r, to: typeof r.to === "number" && r.to > i ? r.to - 1 : r.to })) })));
  sel.value = steps.value.length > 1 ? Math.max(0, i - 1) : null;
}
const patchStep = (i: number, p: Partial<FlowStepDef>): void => update((l) => l.map((x, k) => (k === i ? { ...x, ...p } : x)));
const patchRoute = (i: number, r: number, p: Partial<FlowRoute>): void => update((l) => l.map((x, k) => (k === i ? { ...x, routes: x.routes.map((y, j) => (j === r ? { ...y, ...p } : y)) } : x)));
function moveRoute(i: number, r: number, d: -1 | 1): void {
  update((l) => l.map((x, k) => { if (k !== i) return x; const rs = [...x.routes]; const j = r + d; if (j < 0 || j >= rs.length) return x; [rs[r], rs[j]] = [rs[j]!, rs[r]!]; return { ...x, routes: rs }; }));
}
const addRoute = (i: number): void => update((l) => l.map((x, k) => (k === i ? { ...x, routes: [...x.routes, { conds: [{ k: "hits", op: ">=", n: 1 }], to: Math.min(i + 1, l.length - 1) }] } : x)));
const removeRoute = (i: number, r: number): void => update((l) => l.map((x, k) => (k === i ? { ...x, routes: x.routes.filter((_, j) => j !== r) } : x)));
function setCond(i: number, r: number, c: number, cond: FlowCond | null): void {
  const cur = steps.value[i]?.routes[r];
  if (!cur) return;
  const conds = cond ? cur.conds.map((x, k) => (k === c ? cond : x)) : cur.conds.filter((_, k) => k !== c);
  patchRoute(i, r, { conds });
}
const addCond = (i: number, r: number): void => { const cur = steps.value[i]?.routes[r]; if (cur) patchRoute(i, r, { conds: [...cur.conds, { k: "junk", side: "prefix", op: ">=", n: 1 }] }); };

/** 手の名前 (打つ物 + お告げ) とアイコン */
const setOf = (i: number): PatternSet | undefined => setByKey(sets.value, steps.value[i]?.set ?? "");
const iconsOf = (i: number): string[] => { const x = setOf(i); return x ? [x.currency, ...x.omens].filter((k) => k && iconOf(k)) : []; };
const titleOf = (i: number): string => { const x = setOf(i); return x ? (x.currency ? nameOf(x.currency) : x.kind === "essence_perfect" ? "パーフェクトエッセンス" : x.kind) : "打つ物を選ぶ"; };

/** 狙いの短い名前 (条件の「○○ が付いた」) */
const targetOpts = computed(() => {
  const d = s.data.value;
  return s.simTargets.value.flatMap((t) => [t, ...(t.alts ?? [])]).filter((t, k, a) => a.findIndex((x) => x.modId === t.modId) === k).map((t) => {
    const m = d?.mods.get(t.modId);
    const tier = m?.tiers[t.minTierIndex];
    const text = m ? fillModText(m, tier ? tierDisplayRanges(tier) : []).replace(/\n/g, " / ") : t.modId;
    return { id: t.modId, label: `${text.length > 22 ? `${text.slice(0, 22)}…` : text} T${m ? m.tiers.length - t.minTierIndex : "?"}+` };
  });
});
const OPS = [[">=", "以上"], ["=", "ちょうど"], ["<=", "以下"]] as const;
const SIDES = [["prefix", "左 (プレ)"], ["suffix", "右 (サフィ)"]] as const;
/** 条件の短い文 (図の矢印に出す) */
function condText(c: FlowCond): string {
  const op = (o: string): string => (o === ">=" ? "以上" : o === "<=" ? "以下" : "");
  switch (c.k) {
    case "all": return "全部揃った";
    case "hits": return `狙い ${c.n}${op(c.op)}`;
    case "has": return `${targetOpts.value.find((t) => t.id === c.id)?.label ?? c.id} ${c.not ? "無し" : "有り"}`;
    case "junk": return `${c.side === "prefix" ? "左" : c.side === "suffix" ? "右" : ""}ハズレ ${c.n}${op(c.op)}`;
    case "free": return `${c.side === "prefix" ? "左" : "右"}空き ${c.n}${op(c.op)}`;
    case "mods": return `MOD ${c.n}${op(c.op)}`;
    case "rarity": return c.r === "magic" ? "マジック" : c.r === "rare" ? "レア" : "ノーマル";
  }
}
const routeText = (r: FlowRoute): string => (r.conds.length ? r.conds.map(condText).join(" · ") : "いつでも");

/** 図: 手は上から自動で並べる。矢印は 次の手 = 真下 / 前の手 = 左の赤 / 先の手 = 右 / 完成 = 右の箱 / 最初から = 左の印 */
const NODE_W = 196, NODE_H = 58, GAP = 34, X = 46;
const yOf = (i: number): number => 16 + i * (NODE_H + GAP);
const DONE = computed(() => ({ x: X + NODE_W + 70, y: yOf(Math.max(0, steps.value.length - 1)) }));
const total = (avg: number | undefined): number => Math.round((avg ?? 0) * (props.stats?.runs ?? 0));
const fmt = (n: number): string => (n >= 10_000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);
const edges = computed(() => {
  const out: Array<{ d: string; tone: "down" | "back" | "fwd" | "done" | "start" | "loop"; w: number; label: string; lx: number; ly: number }> = [];
  const maxCount = Math.max(1, ...(props.stats?.routes.flat() ?? [1]).map((x) => x * (props.stats?.runs ?? 1)));
  let back = 0, fwd = 0;
  steps.value.forEach((st, i) => {
    const y0 = yOf(i);
    const counts = props.stats?.routes[i];
    st.routes.forEach((r, k) => {
      const n = total(counts?.[k]);
      const w = props.stats ? 1.2 + 4 * Math.sqrt(n / maxCount) : 1.6;
      const label = props.stats ? fmt(n) : routeText(r);
      if (r.to === "done") {
        const dy = DONE.value.y + NODE_H / 2;
        out.push({ d: `M${X + NODE_W} ${y0 + NODE_H / 2} C ${X + NODE_W + 40} ${y0 + NODE_H / 2}, ${DONE.value.x - 30} ${dy}, ${DONE.value.x} ${dy}`, tone: "done", w, label, lx: X + NODE_W + 6, ly: y0 + NODE_H / 2 - 4 });
      } else if (r.to === "start") {
        out.push({ d: `M${X} ${y0 + NODE_H / 2} L ${X - 18} ${y0 + NODE_H / 2}`, tone: "start", w, label: `⟲ ${label}`, lx: 2, ly: y0 + NODE_H / 2 - 6 });
      } else if (r.to === i + 1) {
        out.push({ d: `M${X + NODE_W / 2 + k * 8} ${y0 + NODE_H} L ${X + NODE_W / 2 + k * 8} ${yOf(i + 1)}`, tone: "down", w, label, lx: X + NODE_W / 2 + 8 + k * 8, ly: y0 + NODE_H + GAP / 2 + 4 });
      } else if (r.to === i) {
        out.push({ d: `M${X + NODE_W} ${y0 + 12} C ${X + NODE_W + 28} ${y0 + 4}, ${X + NODE_W + 28} ${y0 + 40}, ${X + NODE_W} ${y0 + 34}`, tone: "loop", w, label: `↺ ${label}`, lx: X + NODE_W + 30, ly: y0 + 26 });
      } else if (r.to < i) {
        const off = 10 + (back++ % 4) * 7;
        const y1 = yOf(r.to) + NODE_H / 2;
        out.push({ d: `M${X} ${y0 + NODE_H / 2 + 6} C ${X - off - 14} ${y0 + NODE_H / 2 + 6}, ${X - off - 14} ${y1}, ${X} ${y1}`, tone: "back", w, label, lx: Math.max(0, X - off - 30), ly: (y0 + y1) / 2 + NODE_H / 2 });
      } else {
        const off = 10 + (fwd++ % 4) * 7;
        const y1 = yOf(r.to) + 10;
        out.push({ d: `M${X + NODE_W} ${y0 + NODE_H - 10} C ${X + NODE_W + off + 14} ${y0 + NODE_H}, ${X + NODE_W + off + 14} ${y1}, ${X + NODE_W} ${y1}`, tone: "fwd", w, label, lx: X + NODE_W + off + 10, ly: (y0 + y1) / 2 + 20 });
      }
    });
    // どれにも合わない
    const none = total(counts?.[st.routes.length]);
    if (props.stats && none > 0) {
      if (st.onNone === "loop") out.push({ d: `M${X + NODE_W} ${y0 + 12} C ${X + NODE_W + 28} ${y0 + 4}, ${X + NODE_W + 28} ${y0 + 40}, ${X + NODE_W} ${y0 + 34}`, tone: "loop", w: 1.2 + 4 * Math.sqrt(none / maxCount), label: `↺ ${fmt(none)}`, lx: X + NODE_W + 30, ly: y0 + 26 });
      else if (st.onNone === "restart") out.push({ d: `M${X} ${y0 + NODE_H / 2} L ${X - 18} ${y0 + NODE_H / 2}`, tone: "start", w: 2, label: `⟲ ${fmt(none)}`, lx: 2, ly: y0 + NODE_H / 2 - 6 });
    }
  });
  return out;
});
const TONE: Record<string, string> = { down: "#9a948a", fwd: "#9a948a", back: "#e24b4a", done: "#639922", start: "#e2884a", loop: "#7f77dd" };
const svgH = computed(() => Math.max(120, yOf(steps.value.length) + 10));
const doneCount = computed(() => total(props.stats ? props.stats.routes.reduce((a, rs, i) => a + rs.reduce((b, n, k) => b + (steps.value[i]?.routes[k]?.to === "done" ? n : 0), 0), 0) : 0));
</script>

<template>
  <div class="flex gap-3 text-[12px] max-md:flex-col">
    <!-- 左: 流れの図 -->
    <div class="min-w-0 shrink-0 overflow-auto rounded-lg bg-black/30 p-2 max-md:w-full" style="width: 380px; max-height: max(420px, calc(100vh - 430px))">
      <svg :viewBox="`0 0 360 ${svgH}`" :width="360" :height="svgH" class="max-md:w-full">
        <defs>
          <marker v-for="(c, k) in TONE" :id="`fa-${k}`" :key="k" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" :fill="c" /></marker>
        </defs>
        <path v-for="(e, k) in edges" :key="'e' + k" :d="e.d" fill="none" :stroke="TONE[e.tone]" :stroke-width="e.w" :marker-end="`url(#fa-${e.tone})`" :opacity="e.tone === 'back' ? 0.85 : 0.9" />
        <text v-for="(e, k) in edges" :key="'t' + k" :x="e.lx" :y="e.ly" font-size="10" :fill="TONE[e.tone]" class="select-none">{{ e.label.length > 18 ? e.label.slice(0, 18) + "…" : e.label }}</text>
        <!-- 手のカード -->
        <g v-for="(_st, i) in steps" :key="'n' + i" class="cursor-pointer" @click="sel = i">
          <rect :x="X" :y="yOf(i)" :width="NODE_W" :height="NODE_H" rx="8" :fill="sel === i ? '#3a2c10' : '#1c1915'" :stroke="sel === i ? '#f59e0b' : '#5a5348'" :stroke-width="sel === i ? 2 : 1" />
          <text :x="X + 8" :y="yOf(i) + 17" font-size="12" fill="#fde68a" font-weight="bold">{{ i + 1 }}</text>
          <image v-for="(ic, j) in iconsOf(i)" :key="ic" :href="iconOf(ic)" :x="X + 22 + j * 22" :y="yOf(i) + 4" width="20" height="20" />
          <text :x="X + 8" :y="yOf(i) + 38" font-size="11" fill="#e7e5e4">{{ titleOf(i).length > 16 ? titleOf(i).slice(0, 16) + "…" : titleOf(i) }}</text>
          <text v-if="stats" :x="X + 8" :y="yOf(i) + 52" font-size="10" fill="#86efac">✓ {{ fmt(total(stats.visits[i])) }}</text>
        </g>
        <!-- 完成 -->
        <g v-if="steps.length">
          <rect :x="DONE.x" :y="DONE.y" width="74" :height="NODE_H" rx="8" fill="#14240e" stroke="#639922" />
          <text :x="DONE.x + 8" :y="DONE.y + 22" font-size="12" fill="#bbf7d0">🚩 完成</text>
          <text v-if="stats" :x="DONE.x + 8" :y="DONE.y + 42" font-size="11" fill="#86efac">{{ fmt(doneCount) }}</text>
        </g>
      </svg>
      <button v-if="!locked" type="button" class="mt-1 w-full rounded-md border border-dashed border-amber-400/50 py-1 text-amber-200 hover:bg-amber-500/10 max-md:min-h-11" @click="addStep">＋ 手を足す</button>
    </div>

    <!-- 右: 選んだ手 -->
    <div v-if="sel != null && steps[sel]" class="min-w-0 flex-1 rounded-lg bg-black/25 px-3 py-2">
      <div class="mb-2 flex items-center gap-2 border-b border-white/10 pb-2">
        <b class="text-[14px] text-amber-200">{{ sel + 1 }} 手目</b>
        <img v-for="ic in iconsOf(sel)" :key="ic" :src="iconOf(ic)" alt="" class="h-6 w-6 object-contain" />
        <span class="opacity-80">{{ titleOf(sel) }}</span>
        <button v-if="!locked" type="button" class="ml-auto rounded-lg border border-rose-400/50 px-2 py-0.5 text-rose-200 max-md:min-h-10" @click="removeStep(sel)">この手を消す</button>
      </div>
      <!-- 打つ物 (棚と同じ札) -->
      <p class="mb-1 text-[11px] opacity-60">① 打つ物</p>
      <StagePatternStepPicker :key="'f' + sel" :sets="sets" :why="() => null" :current="steps[sel]!.set" soft inline @pick="(k) => patchStep(sel!, { set: k })" />
      <!-- 行き先 -->
      <p class="mb-1 mt-3 text-[11px] opacity-60">② 打った後 (上から見て、条件が全部合った最初の所へ)</p>
      <div class="flex flex-col gap-1.5">
        <div v-for="(r, k) in steps[sel]!.routes" :key="k" class="rounded-lg border border-white/10 bg-black/30 p-2">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="w-4 text-center font-bold text-amber-200">{{ k + 1 }}</span>
            <template v-for="(c, j) in r.conds" :key="j">
              <span v-if="j > 0" class="opacity-50">かつ</span>
              <span class="inline-flex flex-wrap items-center gap-1 rounded-md border border-sky-400/40 bg-sky-950/30 px-1.5 py-0.5">
                <select class="rounded bg-black/40 px-0.5" :value="c.k" @change="(ev) => { const k2 = (ev.target as HTMLSelectElement).value; setCond(sel!, k, j, k2 === 'all' ? { k: 'all' } : k2 === 'hits' ? { k: 'hits', op: '>=', n: 1 } : k2 === 'has' ? { k: 'has', id: targetOpts[0]?.id ?? '' } : k2 === 'junk' ? { k: 'junk', side: 'prefix', op: '>=', n: 1 } : k2 === 'free' ? { k: 'free', side: 'prefix', op: '>=', n: 1 } : k2 === 'mods' ? { k: 'mods', op: '>=', n: 6 } : { k: 'rarity', r: 'rare' }); }">
                  <option value="all">全部揃った</option>
                  <option value="hits">狙いの数</option>
                  <option value="has">○○ が付いた</option>
                  <option value="junk">ハズレの数</option>
                  <option value="free">空きの数</option>
                  <option value="mods">MOD の数</option>
                  <option value="rarity">レアリティ</option>
                </select>
                <template v-if="c.k === 'junk' || c.k === 'free'">
                  <select class="rounded bg-black/40 px-0.5" :value="c.side" @change="setCond(sel!, k, j, { ...c, side: ($event.target as HTMLSelectElement).value as 'prefix' })"><option v-for="o in SIDES" :key="o[0]" :value="o[0]">{{ o[1] }}</option><option v-if="c.k === 'junk'" value="any">どちらか</option></select>
                </template>
                <select v-if="c.k === 'has'" class="max-w-[12rem] rounded bg-black/40 px-0.5" :value="c.id" @change="setCond(sel!, k, j, { ...c, id: ($event.target as HTMLSelectElement).value })"><option v-for="t in targetOpts" :key="t.id" :value="t.id">{{ t.label }}</option></select>
                <select v-if="c.k === 'has'" class="rounded bg-black/40 px-0.5" :value="c.not ? '1' : ''" @change="setCond(sel!, k, j, { ...c, not: ($event.target as HTMLSelectElement).value === '1' })"><option value="">有り</option><option value="1">無し</option></select>
                <template v-if="c.k === 'hits' || c.k === 'junk' || c.k === 'free' || c.k === 'mods'">
                  <input type="number" min="0" max="12" class="w-10 rounded bg-black/40 px-1 text-center" :value="c.n" @change="setCond(sel!, k, j, { ...c, n: Number(($event.target as HTMLInputElement).value) || 0 })" />
                  <select class="rounded bg-black/40 px-0.5" :value="c.op" @change="setCond(sel!, k, j, { ...c, op: ($event.target as HTMLSelectElement).value as '>=' })"><option v-for="o in OPS" :key="o[0]" :value="o[0]">{{ o[1] }}</option></select>
                </template>
                <select v-if="c.k === 'rarity'" class="rounded bg-black/40 px-0.5" :value="c.r" @change="setCond(sel!, k, j, { ...c, r: ($event.target as HTMLSelectElement).value as 'rare' })"><option value="magic">マジック</option><option value="rare">レア</option><option value="normal">ノーマル</option></select>
                <button type="button" class="px-0.5 opacity-50 hover:text-rose-300 hover:opacity-100" title="この条件を外す" @click="setCond(sel!, k, j, null)">×</button>
              </span>
            </template>
            <button type="button" class="rounded border border-white/15 px-1.5 py-0.5 text-[11px] opacity-70 hover:opacity-100" @click="addCond(sel!, k)">＋ 条件</button>
            <span v-if="!r.conds.length" class="opacity-50">いつでも</span>
          </div>
          <div class="mt-1.5 flex flex-wrap items-center gap-1.5 pl-5">
            <span class="opacity-60">→</span>
            <button type="button" class="rounded-lg border px-2 py-0.5 max-md:min-h-10" :class="r.to === 'done' ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100' : 'border-white/15'" @click="patchRoute(sel!, k, { to: 'done' })">🚩 完成</button>
            <button type="button" class="rounded-lg border px-2 py-0.5 max-md:min-h-10" :class="r.to === 'start' ? 'border-orange-400 bg-orange-500/20 text-orange-100' : 'border-white/15'" @click="patchRoute(sel!, k, { to: 'start' })">⟲ 最初から</button>
            <select class="rounded border border-white/15 bg-black/40 px-1 py-0.5" :class="typeof r.to === 'number' ? 'border-amber-400 text-amber-100' : ''" :value="typeof r.to === 'number' ? String(r.to) : ''" @change="($event.target as HTMLSelectElement).value !== '' && patchRoute(sel!, k, { to: Number(($event.target as HTMLSelectElement).value) })">
              <option value="">手へ…</option>
              <option v-for="(_x, n) in steps" :key="n" :value="String(n)">{{ n + 1 }} {{ titleOf(n) }}{{ n === sel ? " (この手をもう一度)" : "" }}</option>
            </select>
            <span v-if="stats" class="ml-2 text-[11px] text-sky-200/80">{{ fmt(total(stats.routes[sel]?.[k])) }} 回</span>
            <span class="ml-auto flex gap-1">
              <button type="button" class="rounded border border-white/15 px-1 opacity-60 disabled:opacity-20" :disabled="k === 0" @click="moveRoute(sel!, k, -1)">▲</button>
              <button type="button" class="rounded border border-white/15 px-1 opacity-60 disabled:opacity-20" :disabled="k === steps[sel]!.routes.length - 1" @click="moveRoute(sel!, k, 1)">▼</button>
              <button type="button" class="rounded px-1 opacity-50 hover:text-rose-300 hover:opacity-100" title="この行き先を消す" @click="removeRoute(sel!, k)">×</button>
            </span>
          </div>
        </div>
        <button type="button" class="self-start rounded-lg border border-dashed border-sky-400/50 px-2 py-1 text-sky-100 max-md:min-h-10" @click="addRoute(sel!)">＋ 行き先を足す</button>
        <!-- どれにも合わない -->
        <div class="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-white/20 p-2">
          <span class="opacity-70">どれにも合わない →</span>
          <button v-for="o in ([['loop', '↺ もう一度'], ['restart', '⟲ 最初から'], ['end', '終わり']] as const)" :key="o[0]" type="button" class="rounded-lg border px-2 py-0.5 max-md:min-h-10" :class="steps[sel]!.onNone === o[0] ? 'border-violet-400 bg-violet-500/20 text-violet-100' : 'border-white/15'" @click="patchStep(sel!, { onNone: o[0] })">{{ o[1] }}</button>
          <span v-if="stats" class="ml-2 text-[11px] text-sky-200/80">{{ fmt(total(stats.routes[sel]?.[steps[sel]!.routes.length])) }} 回</span>
        </div>
      </div>
    </div>
    <div v-else class="grid flex-1 place-items-center rounded-lg bg-black/25 py-10 text-center opacity-60">
      <p>{{ steps.length ? "左の手を押すと、ここで決める" : "「＋ 手を足す」で 1 手目から" }}</p>
    </div>
  </div>
</template>
