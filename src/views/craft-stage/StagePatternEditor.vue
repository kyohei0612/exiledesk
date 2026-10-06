<!--
  StagePatternEditor.vue — シミュレーションの「6 パターン」: 1 手ずつ並べる (2026-10-06 オーナー「パターン作ってほしい、簡単に操作できる UI で 1 手ずつ。
  プルダウンはセットで選択させたい」)。1 手 = セット (打つ物 + お告げ) / 付ける物 (5 順番計画の順) / 外れた時。
  それまでの手で打てない物・付けられない物は、プルダウンの中で理由つきで選べなくする (オーナー「ルーン嵌めてないのにコルの MOD とか、
  エッセンス 2 回目とか、選択できずにグレーアウト、理由も」)。決まりは services/craft-stage/pattern.ts
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { craftStage, nameOf } from "../../state/craft-stage";
import { checkMiss, checkRune, checkSet, checkTarget, MISS_JA, noMiss, patternSets, removalSets, setByKey, stateBefore, type CheckCtx, type MissRule, type Pattern, type PatternSet, type PatternStep } from "../../services/craft-stage/pattern";
import { jaOfOmen } from "../../services/htc/labels";
import StagePatternStepPicker from "./StagePatternStepPicker.vue";
import { iconOf } from "../../state/craft-stage";
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
  /** 狙いごとの取り直しの見込み (高貴建て、計算機の redo-cost.ts) */
  redo?: Record<string, number>;
  /** 側ごとの外れの消し方 (redo-cost.ts の annulSides) */
  annulSides?: Partial<Record<"prefix" | "suffix", "plain" | "side">>;
  money?: (x: number) => string;
}>();
/** 付いたら取り直せない手 (レアリティが変わる手で付けた物は戻れない) */
const ONCE = new Set(["transmute", "augment", "regal", "alchemy", "essence"]);
/**
 * その手の消去で巻き込みうる、前の手で付けた狙い (2026-10-06 オーナー「消去で消す MOD はカオススパムがつらいほどアカン、
 * 一回付いたら取り直せないやつ」)。取り直せない物は赤、取り直せる物は取り直しの見込み
 */
function annulRisk(i: number, set: PatternSet | undefined, step: PatternStep): { text: string; bad: boolean } | null {
  if (!set || !ctx.value) return null;
  const c = ctx.value;
  const sideOfId = (id: string): "prefix" | "suffix" => (c.data.mods.get(id)?.type === "suffix" ? "suffix" : "prefix");
  let scope: Array<"prefix" | "suffix"> | null = null;
  if (set.kind === "annul") {
    if (set.omens.includes("OmenofLight")) return null; // 光は冒涜の MOD だけ
    scope = set.omens.includes("OmenofSinistralAnnulment") ? ["prefix"] : set.omens.includes("OmenofDextralAnnulment") ? ["suffix"] : ["prefix", "suffix"];
  } else if (step.onMiss === "annul_redo" && !noMiss(set) && step.target) {
    const sd = sideOfId(step.target);
    const ms = step.miss ? setByKey(sets.value, step.miss) : undefined;
    if (ms) {
      if (ms.omens.includes("OmenofLight")) return null;
      const left = ms.omens.some((o) => /Sinistral/.test(o)), right = ms.omens.some((o) => /Dextral/.test(o));
      scope = left ? ["prefix"] : right ? ["suffix"] : ["prefix", "suffix"];
    } else scope = props.annulSides?.[sd] === "side" ? [sd] : ["prefix", "suffix"];
  }
  if (!scope) return null;
  const hits = pat.value.steps.slice(0, i).flatMap((q) => {
    const x = setByKey(sets.value, q.set);
    if (!x || !q.target || x.kind === "rune" || x.kind === "annul" || !scope!.includes(sideOfId(q.target))) return [];
    return [{ id: q.target, once: ONCE.has(x.kind) }];
  });
  if (!hits.length) return null;
  const short = (id: string): string => modLabel(id).replace(/\s*T\d+ 以上.*$/, "").slice(0, 16);
  const m = props.money ?? ((x: number) => x.toFixed(1));
  const once = hits.filter((h) => h.once);
  if (once.length) return { text: `消去で ${once.map((h) => short(h.id)).join("・")} を巻き込むと取り直せない`, bad: true };
  return { text: `消去で巻き込みうる: ${hits.map((h) => `${short(h.id)} (取り直し 約 ${props.redo?.[h.id] != null ? m(props.redo[h.id]!) : "?"})`).join("・")}`, bad: false };
}
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
  /** 消去で巻き込みうる物 */
  risk: { text: string; bad: boolean } | null;
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
    return { step, set, setOpts, targetOpts, missOpts, bad: setWhy ?? tWhy, risk: annulRisk(i, set, step) };
  });
});

/** 打つ物 + お告げを棚の見た目で選んでいる手 (2026-10-06 オーナー「クラフトステージそのまま使っていい」) */
const openRow = ref<string | null>(null);
const removals = computed(() => removalSets(sets.value));
/** その手の位置で、セットを打てない理由 */
function whyAt(i: number): (x: PatternSet) => string | null {
  const c = ctx.value;
  if (!c) return () => null;
  const st = stateBefore(c, pat.value.steps, i);
  return (x) => checkSet(c, st, x);
}
/** 外す時のセット (外す時は付けた後 = レア。付ける手の後の状態で見る) */
const missSet = (step: PatternStep): PatternSet | undefined => (step.miss ? setByKey(sets.value, step.miss) : undefined);
function whyMissAt(i: number): (x: PatternSet) => string | null {
  const c = ctx.value;
  if (!c) return () => null;
  const st = { ...stateBefore(c, pat.value.steps, i + 1), rarity: "rare" as const };
  return (x) => checkSet(c, st, x);
}
function addStep(): void {
  const c = ctx.value;
  if (!c) return;
  const st = stateBefore(c, pat.value.steps, pat.value.steps.length);
  const first = sets.value.find((x) => !checkSet(c, st, x));
  setSteps((list) => [...list, { set: first?.key ?? sets.value[0]?.key ?? "", target: null, onMiss: missFor(first, "annul_redo") }]);
  openRow.value = `${pat.value.steps.length - 1}:add`;
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
        <template v-for="(r, i) in rows" :key="i">
        <tr class="border-t border-white/5 align-top">
          <td class="py-1">
            <span class="mr-1 font-bold text-amber-200">{{ i + 1 }}</span>
            <template v-if="!locked">
              <button type="button" class="px-0.5 opacity-60 hover:opacity-100 disabled:opacity-20" :disabled="i === 0" title="上へ" @click="move(i, -1)">▲</button>
              <button type="button" class="px-0.5 opacity-60 hover:opacity-100 disabled:opacity-20" :disabled="i === rows.length - 1" title="下へ" @click="move(i, 1)">▼</button>
            </template>
          </td>
          <td class="py-1 pr-1">
            <!-- セット (打つ物 + お告げ)。打てない物は理由つきで選べない -->
            <span class="mb-0.5 block opacity-60">付ける</span>
            <button type="button" class="flex w-full items-center gap-1 rounded border px-1 py-0.5 text-left disabled:cursor-default" :class="openRow === `${i}:add` ? 'border-amber-400/70 bg-amber-500/10' : 'border-white/15 bg-black/40 hover:border-white/30'" :disabled="locked" :title="locked ? undefined : '押すと棚から選ぶ'" @click="openRow = openRow === `${i}:add` ? null : `${i}:add`">
              <img v-if="r.set?.currency && iconOf(r.set.currency)" :src="iconOf(r.set.currency)" alt="" class="h-5 w-5 object-contain" />
              <img v-for="o in r.set?.omens ?? []" :key="o" :src="iconOf(o)" alt="" class="h-5 w-5 object-contain" />
              <span class="truncate">{{ r.set ? setLabel(r.set) : "選ぶ" }}</span>
              <span v-if="!locked" class="ml-auto opacity-50">{{ openRow === `${i}:add` ? "▲" : "▼" }}</span>
            </button>
          </td>
          <td class="py-1 pr-1">
            <!-- 付ける物 (5 順番計画の順)。付けられない物は理由つきで選べない -->
            <span v-if="r.set?.kind === 'annul'" class="opacity-50">(消す物は選べない。外れを消す手)</span>
            <select v-else class="w-full rounded border border-white/15 bg-black/40 px-1 py-0.5" :value="r.step.target ?? ''" :disabled="locked" @change="patch(i, { target: ($event.target as HTMLSelectElement).value || null })">
              <option value="" disabled>{{ r.set?.kind === "rune" ? "差すルーンを選ぶ" : "付ける MOD を選ぶ" }}</option>
              <option v-for="o in r.targetOpts" :key="o.key" :value="o.key" :disabled="!!o.why" :title="o.why ?? undefined">{{ o.label }}{{ o.why ? ` — ${o.why}` : "" }}</option>
            </select>
            <p v-if="r.bad" class="mt-0.5 text-rose-300">{{ r.bad }}</p>
            <p v-if="r.risk" class="mt-0.5" :class="r.risk.bad ? 'text-rose-300' : 'text-amber-200/80'">{{ r.risk.text }}</p>
          </td>
          <td class="py-1 pr-1">
            <template v-if="!noMiss(r.set)">
              <span class="mr-1 whitespace-nowrap opacity-60">外れたら</span>
              <select class="w-44 rounded border border-white/15 bg-black/40 px-1 py-0.5" :value="r.step.onMiss" :disabled="locked" @change="patch(i, { onMiss: ($event.target as HTMLSelectElement).value as MissRule })">
                <option v-for="o in r.missOpts" :key="o.rule" :value="o.rule" :disabled="!!o.why" :title="o.why ?? undefined">{{ MISS_JA[o.rule] }}{{ o.why ? ` — ${o.why}` : "" }}</option>
              </select>
              <!-- 外す時の打つ物 + お告げ (付ける時と同じ棚で選ぶ。無ければ自動) -->
              <template v-if="r.step.onMiss === 'annul_redo'">
                <span class="mb-0.5 mt-1 block opacity-60">外す</span>
                <span class="flex items-center gap-1">
                  <button type="button" class="flex min-w-0 flex-1 items-center gap-1 rounded border px-1 py-0.5 text-left disabled:cursor-default" :class="openRow === `${i}:miss` ? 'border-amber-400/70 bg-amber-500/10' : 'border-white/15 bg-black/40 hover:border-white/30'" :disabled="locked" :title="locked ? undefined : '押すと棚から選ぶ'" @click="openRow = openRow === `${i}:miss` ? null : `${i}:miss`">
                    <template v-if="missSet(r.step)">
                      <img v-if="iconOf(missSet(r.step)!.currency)" :src="iconOf(missSet(r.step)!.currency)" alt="" class="h-5 w-5 object-contain" />
                      <img v-for="o in missSet(r.step)!.omens" :key="o" :src="iconOf(o)" alt="" class="h-5 w-5 object-contain" />
                      <span class="truncate">{{ setLabel(missSet(r.step)!) }}</span>
                    </template>
                    <span v-else class="truncate opacity-70" title="やり直しの費用で、素の消去か側の消去のお告げを決める (冒涜の外れは光)">自動 (やり直しの費用で)</span>
                    <span v-if="!locked" class="ml-auto opacity-50">{{ openRow === `${i}:miss` ? "▲" : "▼" }}</span>
                  </button>
                  <button v-if="r.step.miss && !locked" type="button" class="opacity-50 hover:opacity-100" title="自動に戻す" @click="patch(i, { miss: null })">×</button>
                </span>
              </template>
            </template>
          </td>
          <td class="py-1 text-right">
            <button v-if="!locked" type="button" class="opacity-50 hover:text-rose-300 hover:opacity-100" title="この手を消す" @click="remove(i)">×</button>
          </td>
        </tr>
        <tr v-if="openRow === `${i}:add` && !locked">
          <td colspan="5" class="pb-2">
            <p class="mb-1 font-bold text-amber-100">{{ i + 1 }} 手目: 付ける</p>
            <StagePatternStepPicker :sets="sets" :why="whyAt(i)" :current="r.step.set" @pick="(k) => { onSet(i, k); openRow = null; }" @close="openRow = null" />
          </td>
        </tr>
        <tr v-if="openRow === `${i}:miss` && !locked">
          <td colspan="5" class="pb-2">
            <p class="mb-1 font-bold text-amber-100">{{ i + 1 }} 手目: 外れた時に外す</p>
            <StagePatternStepPicker :sets="removals" :why="whyMissAt(i)" :current="r.step.miss ?? ''" @pick="(k) => { patch(i, { miss: k }); openRow = null; }" @close="openRow = null" />
          </td>
        </tr>
        </template>
      </tbody>
    </table>
    <button v-if="!locked" type="button" class="mt-1 rounded border border-amber-400/50 px-2 py-0.5 text-amber-200 hover:bg-amber-500/15" @click="addStep">＋ 手を足す</button>
  </div>
</template>
