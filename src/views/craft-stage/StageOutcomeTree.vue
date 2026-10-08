<!--
  StageOutcomeTree.vue — 1 つの手の「打った結果」を全部並べ、結果ごとに次の行動を選ぶ (2026-10-08 オーナー「打った結果全てにどういう行動をとるかを
  選択肢に出せばいい。偉大左を打ったら狙い以外 2 / 当たり 1 狙い以外 1 / 当たり 2。狙い以外 2 に消去、消去が狙い以外に刺さったら完全高貴、当たりに刺さったら…」
  「1 つの結果に対してどんどん進んでいって最後まで設定していく。ただ繰り返してしまうのが欠点だから調整」)。

  状態は狙いの側の「当たり h・狙い以外 j」(空きは枠 − h − j)。同じ状態は 1 回だけ決める (2 回目からは「上で決めた」で繋ぐ = 繰り返しにならない)。
  計算は recipe-sim の policy (状態のキー `${h}-${j}` → 打つ物 / 次の手 / 最初から / N 手目)
-->
<script setup lang="ts">
import { computed } from "vue";
import { iconOf, nameOf } from "../../state/craft-stage";
import { setByKey, type PatternSet, type PolicyAct } from "../../services/craft-stage/pattern";

const props = defineProps<{
  /** この手の打つ物 */
  set: PatternSet;
  /** 狙いの側 */
  side: "prefix" | "suffix";
  /** 側の枠 (3) */
  limit: number;
  /** この側で揃える当たりの数 (揃ったらこの手は終わり) */
  need: number;
  /** 打つ前の当たり・狙い以外 */
  h0: number;
  j0: number;
  policy: Record<string, PolicyAct>;
  /** 選べる打つ物 (全部のセット) */
  sets: readonly PatternSet[];
  /** 戻り先の手 (番号と名前) */
  steps: Array<{ n: number; label: string }>;
  locked?: boolean;
}>();
const emit = defineEmits<{ change: [policy: Record<string, PolicyAct>] }>();

const SIDE_JA = computed(() => (props.side === "prefix" ? "プレ" : "サフィ"));
const sideOmen = (kind: "exalt" | "annul" | "chaos"): string => (kind === "exalt" ? (props.side === "prefix" ? "OmenofSinistralExaltation" : "OmenofDextralExaltation") : kind === "annul" ? (props.side === "prefix" ? "OmenofSinistralAnnulment" : "OmenofDextralAnnulment") : props.side === "prefix" ? "OmenofSinistralErasure" : "OmenofDextralErasure");
/** よく使う打つ物 (側のお告げ付き) */
const choices = computed(() => {
  const find = (kind: string, currency: string, omens: string[]): PatternSet | undefined => props.sets.find((x) => x.kind === kind && x.currency === currency && x.omens.length === omens.length && omens.every((o) => x.omens.includes(o)));
  const L = props.side === "prefix" ? "左" : "右";
  return [
    { s: find("exalt", "exalt_perfect", [sideOmen("exalt"), "OmenofGreaterExaltation"]), label: `完全高貴 偉大 ${L}` },
    { s: find("exalt", "exalt_perfect", [sideOmen("exalt")]), label: `完全高貴 ${L}` },
    { s: find("exalt", "exalt", [sideOmen("exalt")]), label: `高貴 ${L}` },
    { s: find("annul", "annul", [sideOmen("annul")]), label: `消去 ${L}` },
    { s: find("annul", "annul", []), label: "消去" },
    { s: find("chaos", "chaos", [sideOmen("chaos")]), label: `カオス ${L}` },
    { s: find("chaos", "chaos", []), label: "カオス" },
  ].filter((x): x is { s: PatternSet; label: string } => !!x.s);
});
const labelOf = (key: string): string => choices.value.find((c) => c.s.key === key)?.label ?? (() => { const x = setByKey(props.sets, key); return x ? nameOf(x.currency) : key; })();

/** 打つ物 x を (h, j) で打った時の結果 (同じ状態はまとめる) */
function outcomes(x: PatternSet, h: number, j: number): Array<{ label: string; h: number; j: number; stuck?: boolean }> {
  const L = props.limit, f = L - h - j;
  const out: Array<{ label: string; h: number; j: number; stuck?: boolean }> = [];
  const push = (label: string, h2: number, j2: number): void => { if (!out.some((o) => o.h === h2 && o.j === j2)) out.push({ label, h: Math.max(0, h2), j: Math.max(0, j2) }); };
  // 狙いの側だけ見る。反対の側の出来事 (反対側に付いた・消えた) は狙いの側が変わらないので出さない (次の手で考える。
  // 2026-10-08 オーナー「反対側云々は付いてから次の手で考えること、表示する必要なくね」)
  const diff = (h2: number, j2: number): string => [h2 > h ? `狙い +${h2 - h}` : h2 < h ? `狙い −${h - h2}` : "", j2 > j ? `狙い以外 +${j2 - j}` : j2 < j ? `狙い以外 −${j - j2}` : ""].filter(Boolean).join("・");
  if (x.kind === "exalt") {
    if (f <= 0) return [{ label: `${SIDE_JA.value}が満杯で付かない`, h, j, stuck: true }];
    const k = Math.min(x.omens.includes("OmenofGreaterExaltation") ? 2 : 1, f);
    for (let a = k; a >= 0; a--) push(k === 2 ? (a === 2 ? "狙い 2" : a === 1 ? "狙い 1・狙い以外 1" : "狙い以外 2") : a === 1 ? "狙い" : "狙い以外", h + a, j + k - a);
  } else if (x.kind === "annul") {
    if (h + j === 0) return [{ label: "消せる物が無い", h, j, stuck: true }];
    if (j > 0) push("狙い以外が消えた", h, j - 1);
    if (h > 0) push("狙いが消えた", h - 1, j);
  } else if (x.kind === "chaos") {
    // 1 つ消して 1 つ付く。狙いの側の 狙い・狙い以外 が変わる形だけ
    const rem: Array<[number, number]> = [[0, 0]];
    if (j > 0) rem.push([0, -1]);
    if (h > 0) rem.push([-1, 0]);
    for (const [dh, dj] of rem) for (const [ah, aj] of [[1, 0], [0, 1], [0, 0]] as const) {
      const h2 = h + dh + ah, j2 = j + dj + aj;
      if ((h2 === h && j2 === j) || h2 + j2 > L) continue;
      push(diff(h2, j2), h2, j2);
    }
  }
  return out.filter((o) => o.h + o.j <= L);
}

/** 木を上から並べた行 (同じ状態は最初の 1 回だけ広げる) */
interface Row { depth: number; label: string; h: number; j: number; key: string; done: boolean; stuck: boolean; first: boolean; via: string }
const rows = computed((): Row[] => {
  const out: Row[] = [];
  const seen = new Set<string>();
  const walk = (x: PatternSet, h: number, j: number, depth: number, via: string): void => {
    if (depth > 8) return;
    for (const o of outcomes(x, h, j)) {
      const key = `${o.h}-${o.j}`;
      const done = o.h >= props.need;
      const first = !done && !seen.has(key);
      out.push({ depth, label: o.label, h: o.h, j: o.j, key, done, stuck: !!o.stuck, first, via });
      if (!first) continue;
      seen.add(key);
      const act = props.policy[key];
      const nx = act?.set ? setByKey(props.sets, act.set) : undefined;
      if (nx) walk(nx, o.h, o.j, depth + 1, labelOf(nx.key));
    }
  };
  walk(props.set, props.h0, props.j0, 0, "");
  return out;
});
function setAct(key: string, act: PolicyAct | null): void {
  const next = { ...props.policy };
  if (act) next[key] = act; else delete next[key];
  emit("change", next);
}
const actText = (a: PolicyAct | undefined): string => (!a ? "" : a.set ? labelOf(a.set) : a.then === "next" ? "次の手へ" : a.then === "restart" ? "最初から" : a.then === "goto" ? `${(a.goto ?? 0) + 1} 手目へ` : "");
const stateText = (h: number, j: number): string => `${SIDE_JA.value}: 狙い ${h} · 狙い以外 ${j} · 空き ${Math.max(0, props.limit - h - j)}`;
</script>

<template>
  <div class="text-[12px]">
    <p class="mb-1 font-bold text-sky-100">打った結果ごとに、次にすること <span class="font-normal opacity-60">(同じ形になったら最初に決めた物を使う)</span></p>
    <p class="mb-1.5 text-[11px] opacity-60">打つ前: {{ stateText(h0, j0) }} → {{ labelOf(set.key) }}</p>
    <div class="flex flex-col gap-1">
      <div v-for="(r, k) in rows" :key="k" class="rounded-md border px-2 py-1" :class="r.done ? 'border-emerald-400/40 bg-emerald-950/20' : r.first ? 'border-white/15 bg-black/30' : 'border-dashed border-white/10 opacity-70'" :style="{ marginLeft: `${r.depth * 18}px` }">
        <div class="flex flex-wrap items-center gap-1.5">
          <span v-if="r.via" class="text-[10px] opacity-50">{{ r.via }} →</span>
          <b :class="r.done ? 'text-emerald-200' : r.stuck ? 'text-rose-300' : ''">{{ r.label }}</b>
          <span class="text-[10px] opacity-60">({{ stateText(r.h, r.j) }})</span>
          <span v-if="r.done" class="ml-auto text-emerald-200">✓ 揃った → 次の手</span>
          <span v-else-if="!r.first" class="ml-auto text-[11px] text-sky-200/80">↑ 上で決めた: {{ actText(policy[r.key]) || "上の決まり" }}</span>
        </div>
        <div v-if="r.first && !r.done && !locked" class="mt-1 flex flex-wrap items-center gap-1">
          <button v-for="c in choices" :key="c.s.key" type="button" class="flex items-center gap-1 rounded-lg border px-1.5 py-0.5 max-md:min-h-10" :class="policy[r.key]?.set === c.s.key ? 'border-sky-300 bg-sky-500/20 text-sky-50' : 'border-white/15 hover:border-white/40'" @click="setAct(r.key, { set: c.s.key })">
            <img v-for="ic in [c.s.currency, ...c.s.omens].filter((i) => iconOf(i))" :key="ic" :src="iconOf(ic)" alt="" class="h-4 w-4 object-contain" />{{ c.label }}
          </button>
          <button type="button" class="rounded-lg border px-1.5 py-0.5 max-md:min-h-10" :class="policy[r.key]?.then === 'next' ? 'border-sky-300 bg-sky-500/20 text-sky-50' : 'border-white/15'" @click="setAct(r.key, { then: 'next' })">→ 次の手</button>
          <button type="button" class="rounded-lg border px-1.5 py-0.5 max-md:min-h-10" :class="policy[r.key]?.then === 'restart' ? 'border-orange-300 bg-orange-500/20 text-orange-50' : 'border-white/15'" @click="setAct(r.key, { then: 'restart' })">⟲ 最初から</button>
          <select class="rounded border border-white/15 bg-black/40 px-1 py-0.5" :class="policy[r.key]?.then === 'goto' ? 'border-sky-300' : ''" :value="policy[r.key]?.then === 'goto' ? String(policy[r.key]!.goto) : ''" @change="($event.target as HTMLSelectElement).value !== '' && setAct(r.key, { then: 'goto', goto: Number(($event.target as HTMLSelectElement).value) })">
            <option value="">↑ 前の手へ</option>
            <option v-for="s2 in steps" :key="s2.n" :value="String(s2.n)">{{ s2.n + 1 }} {{ s2.label }}</option>
          </select>
          <button v-if="policy[r.key]" type="button" class="rounded px-1 text-[11px] opacity-60 hover:opacity-100" title="決めた物を外す (上の決まりに戻す)" @click="setAct(r.key, null)">戻す</button>
          <span v-else class="text-[10px] opacity-40">未設定 (上の決まり)</span>
        </div>
      </div>
    </div>
  </div>
</template>
