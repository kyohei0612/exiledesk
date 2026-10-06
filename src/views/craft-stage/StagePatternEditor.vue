<!--
  StagePatternEditor.vue — シミュレーションの「6 パターン」: 1 手ずつ並べる (2026-10-06 オーナー「パターン作ってほしい、簡単に操作できる UI で 1 手ずつ。
  プルダウンはセットで選択させたい」)。1 手 = セット (打つ物 + お告げ) / 付ける物 (5 順番計画の順) / 外れた時。
  それまでの手で打てない物・付けられない物は、プルダウンの中で理由つきで選べなくする (オーナー「ルーン嵌めてないのにコルの MOD とか、
  エッセンス 2 回目とか、選択できずにグレーアウト、理由も」)。決まりは services/craft-stage/pattern.ts
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { craftStage, nameOf } from "../../state/craft-stage";
import { checkMiss, checkRune, checkSet, checkTarget, MISS_JA, noMiss, patternSets, setByKey, stateBefore, type CheckCtx, type MissRule, type Pattern, type PatternSet, type PatternStep } from "../../services/craft-stage/pattern";
import { jaOfOmen } from "../../services/htc/labels";
import { RUNES } from "../../services/craft-stage/stage-runes";
import { fillHashes, jaOfMod } from "../../services/htc/mod-text";
import { tierDisplayRanges } from "../../services/mods/stat-scale";

const props = defineProps<{
  /** 始めの状態 (フラクチャー済みのレアか白) */
  start: CheckCtx["start"];
  /** 5 順番計画の並び ("mod:<id>" / "rune:<英語名>") */
  order: readonly string[];
  /** 決めた後は変えられない */
  locked: boolean;
}>();
const s = craftStage;
const active = ref(0);
const sets = computed<PatternSet[]>(() => (s.item.value ? patternSets(s.item.value.cls) : []));
const ctx = computed<CheckCtx | null>(() => {
  const d = s.data.value, it = s.item.value;
  if (!d || !it) return null;
  return { data: d, cls: it.cls, targets: s.simTargets.value, sets: sets.value, runeJa: (en) => RUNES[en]?.ja ?? en, start: props.start };
});
const pat = computed<Pattern>(() => s.simPatterns.value[Math.min(active.value, s.simPatterns.value.length - 1)]!);

function setPattern(fn: (p: Pattern) => Pattern): void {
  const k = Math.min(active.value, s.simPatterns.value.length - 1);
  s.simPatterns.value = s.simPatterns.value.map((p, i) => (i === k ? fn(p) : p));
}
const setSteps = (fn: (steps: PatternStep[]) => PatternStep[]): void => setPattern((p) => ({ ...p, steps: fn([...p.steps]) }));

/** セットの名前 (打つ物 + お告げ) */
function setLabel(x: PatternSet): string {
  const head = x.kind === "essence" ? "エッセンス (マジックに)" : x.kind === "essence_perfect" ? "パーフェクトエッセンス" : x.kind === "rune" ? "ルーンを差す" : nameOf(x.currency);
  return [head, ...x.omens.map((o) => jaOfOmen(o) ?? o)].join(" + ");
}
const groups = computed(() => {
  const out: Array<{ name: string; items: PatternSet[] }> = [];
  for (const x of sets.value) {
    const g = out.find((y) => y.name === x.group);
    if (g) g.items.push(x); else out.push({ name: x.group, items: [x] });
  }
  return out;
});

/** 付ける物の名前 */
function modLabel(modId: string): string {
  const d = s.data.value;
  const t = s.simTargets.value.find((x) => x.modId === modId);
  const m = d?.mods.get(modId);
  if (!m || !t) return modId;
  const tier = m.tiers[t.minTierIndex];
  const text = fillHashes(jaOfMod(m), tier ? tierDisplayRanges(tier) : []).replace(/\n/g, " / ");
  const alts = t.alts?.length ? ` (ほか ${t.alts.length} つのどれか)` : "";
  return `${text} T${m.tiers.length - t.minTierIndex} 以上${alts}`;
}
const runeLabel = (en: string): string => RUNES[en]?.ja ?? en;

interface Row {
  step: PatternStep;
  set: PatternSet | undefined;
  setOpts: Array<{ name: string; items: Array<{ x: PatternSet; why: string | null }> }>;
  targetOpts: Array<{ key: string; label: string; why: string | null }>;
  missOpts: Array<{ rule: MissRule; why: string | null }>;
  /** 今の選び方で打てない理由 (前の手を変えた時に出る) */
  bad: string | null;
}
const rows = computed<Row[]>(() => {
  const c = ctx.value;
  if (!c) return [];
  return pat.value.steps.map((step, i) => {
    const st = stateBefore(c, pat.value.steps, i);
    const set = setByKey(sets.value, step.set);
    const setOpts = groups.value.map((g) => ({ name: g.name, items: g.items.map((x) => ({ x, why: checkSet(c, st, x) })) }));
    const isRune = set?.kind === "rune";
    const targetOpts = !set || set.kind === "annul" ? [] : props.order
      .filter((k) => (isRune ? k.startsWith("rune:") : k.startsWith("mod:")))
      .map((k) => {
        const id = k.slice(k.indexOf(":") + 1);
        if (isRune) return { key: id, label: runeLabel(id), why: checkRune(c, st, id) };
        const t = c.targets.find((x) => x.modId === id);
        return { key: id, label: modLabel(id), why: t ? checkTarget(c, st, set, t) : "狙う MOD に無い" };
      });
    const missOpts = (Object.keys(MISS_JA) as MissRule[]).map((rule) => ({ rule, why: set ? checkMiss(set, rule) : null }));
    const setWhy = set ? checkSet(c, st, set) : "セットを選ぶ";
    const tWhy = step.target ? targetOpts.find((o) => o.key === step.target)?.why ?? null : set && set.kind !== "annul" ? "付ける物を選ぶ" : null;
    return { step, set, setOpts, targetOpts, missOpts, bad: setWhy ?? tWhy };
  });
});

function addStep(): void {
  const c = ctx.value;
  if (!c) return;
  const st = stateBefore(c, pat.value.steps, pat.value.steps.length);
  const first = sets.value.find((x) => !checkSet(c, st, x));
  setSteps((list) => [...list, { set: first?.key ?? sets.value[0]?.key ?? "", target: null, onMiss: missFor(first, "annul_redo") }]);
}
function patch(i: number, p: Partial<PatternStep>): void {
  setSteps((list) => list.map((x, k) => (k === i ? { ...x, ...p } : x)));
}
/** そのセットで選べる外れた時の決まり (今のが選べなければ、選べる最初の物) */
function missFor(set: PatternSet | undefined, cur: MissRule): MissRule {
  if (!set || !checkMiss(set, cur)) return cur;
  return (["annul_redo", "next", "redo", "restart"] as MissRule[]).find((r) => !checkMiss(set, r)) ?? "next";
}
function onSet(i: number, key: string): void {
  // セットを変えたら付ける物は選び直し (打ち方で付けられる物が違う)。外れた時は選べる物に寄せる
  const set = setByKey(sets.value, key);
  const cur = pat.value.steps[i]!;
  const miss = missFor(set, cur.onMiss);
  patch(i, { set: key, target: null, onMiss: miss });
}
function move(i: number, d: -1 | 1): void {
  setSteps((list) => { const j = i + d; [list[i], list[j]] = [list[j]!, list[i]!]; return list; });
}
const remove = (i: number): void => setSteps((list) => list.filter((_, k) => k !== i));

function addPattern(copy: boolean): void {
  const n = s.simPatterns.value.length + 1;
  s.simPatterns.value = [...s.simPatterns.value, { name: `パターン ${n}`, steps: copy ? pat.value.steps.map((x) => ({ ...x })) : [] }];
  active.value = s.simPatterns.value.length - 1;
}
function removePattern(): void {
  if (s.simPatterns.value.length <= 1) return;
  const k = Math.min(active.value, s.simPatterns.value.length - 1);
  s.simPatterns.value = s.simPatterns.value.filter((_, i) => i !== k).map((p, i) => ({ ...p, name: `パターン ${i + 1}` }));
  active.value = Math.max(0, k - 1);
}
defineExpose({ rows });
</script>

<template>
  <div class="text-[11px]">
    <!-- パターンのタブ -->
    <div class="mb-1.5 flex flex-wrap items-center gap-1">
      <button v-for="(p, i) in s.simPatterns.value" :key="i" type="button" class="rounded-full px-2.5 py-0.5" :class="i === Math.min(active, s.simPatterns.value.length - 1) ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60' : 'border border-white/15 opacity-70 hover:opacity-100'" @click="active = i">{{ p.name }} <span class="opacity-60">({{ p.steps.length }} 手)</span></button>
      <template v-if="!locked">
        <button type="button" class="rounded border border-white/15 px-1.5 opacity-70 hover:opacity-100" title="空のパターンを足す" @click="addPattern(false)">＋</button>
        <button type="button" class="rounded border border-white/15 px-1.5 opacity-70 hover:opacity-100" title="このパターンを写して足す (少しだけ変えて比べる時に)" @click="addPattern(true)">⧉</button>
        <button type="button" class="rounded border border-white/15 px-1.5 opacity-70 hover:opacity-100 disabled:opacity-30" :disabled="s.simPatterns.value.length <= 1" :title="s.simPatterns.value.length <= 1 ? 'パターンが 1 つの時は消せない' : 'このパターンを消す'" @click="removePattern">×</button>
      </template>
    </div>

    <p v-if="!rows.length" class="py-1 opacity-50">まだ手がありません。「＋ 手を足す」から 1 手ずつ</p>
    <table v-else class="w-full table-fixed">
      <colgroup><col class="w-14" /><col class="w-[19rem]" /><col /><col class="w-64" /><col class="w-8" /></colgroup>
      <tbody>
        <tr v-for="(r, i) in rows" :key="i" class="border-t border-white/5 align-top">
          <td class="py-1">
            <span class="mr-1 font-bold text-amber-200">{{ i + 1 }}</span>
            <template v-if="!locked">
              <button type="button" class="px-0.5 opacity-60 hover:opacity-100 disabled:opacity-20" :disabled="i === 0" title="上へ" @click="move(i, -1)">▲</button>
              <button type="button" class="px-0.5 opacity-60 hover:opacity-100 disabled:opacity-20" :disabled="i === rows.length - 1" title="下へ" @click="move(i, 1)">▼</button>
            </template>
          </td>
          <td class="py-1 pr-1">
            <!-- セット (打つ物 + お告げ)。打てない物は理由つきで選べない -->
            <select class="w-full rounded border border-white/15 bg-black/40 px-1 py-0.5" :value="r.step.set" :disabled="locked" @change="onSet(i, ($event.target as HTMLSelectElement).value)">
              <optgroup v-for="g in r.setOpts" :key="g.name" :label="g.name">
                <option v-for="o in g.items" :key="o.x.key" :value="o.x.key" :disabled="!!o.why" :title="o.why ?? undefined">{{ setLabel(o.x) }}{{ o.why ? ` — ${o.why}` : "" }}</option>
              </optgroup>
            </select>
          </td>
          <td class="py-1 pr-1">
            <!-- 付ける物 (5 順番計画の順)。付けられない物は理由つきで選べない -->
            <span v-if="r.set?.kind === 'annul'" class="opacity-50">(消す物は選べない。外れを消す手)</span>
            <select v-else class="w-full rounded border border-white/15 bg-black/40 px-1 py-0.5" :value="r.step.target ?? ''" :disabled="locked" @change="patch(i, { target: ($event.target as HTMLSelectElement).value || null })">
              <option value="" disabled>{{ r.set?.kind === "rune" ? "差すルーンを選ぶ" : "付ける MOD を選ぶ" }}</option>
              <option v-for="o in r.targetOpts" :key="o.key" :value="o.key" :disabled="!!o.why" :title="o.why ?? undefined">{{ o.label }}{{ o.why ? ` — ${o.why}` : "" }}</option>
            </select>
            <p v-if="r.bad" class="mt-0.5 text-rose-300">{{ r.bad }}</p>
          </td>
          <td class="py-1 pr-1">
            <template v-if="!noMiss(r.set)">
              <span class="mr-1 whitespace-nowrap opacity-60">外れたら</span>
              <select class="w-44 rounded border border-white/15 bg-black/40 px-1 py-0.5" :value="r.step.onMiss" :disabled="locked" @change="patch(i, { onMiss: ($event.target as HTMLSelectElement).value as MissRule })">
                <option v-for="o in r.missOpts" :key="o.rule" :value="o.rule" :disabled="!!o.why" :title="o.why ?? undefined">{{ MISS_JA[o.rule] }}{{ o.why ? ` — ${o.why}` : "" }}</option>
              </select>
            </template>
          </td>
          <td class="py-1 text-right">
            <button v-if="!locked" type="button" class="opacity-50 hover:text-rose-300 hover:opacity-100" title="この手を消す" @click="remove(i)">×</button>
          </td>
        </tr>
      </tbody>
    </table>
    <button v-if="!locked" type="button" class="mt-1 rounded border border-amber-400/50 px-2 py-0.5 text-amber-200 hover:bg-amber-500/15" @click="addStep">＋ 手を足す</button>
  </div>
</template>
