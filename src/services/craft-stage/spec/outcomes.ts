/**
 * 1 手の行き先の一覧 (2026-10-20 ジン部長。解析君の頼み事「手の効果を入口から組む」、docs/org/emulator/todo.md の案)。
 *
 * 打つ処理 (applyBySpec) と同じ planSpec (対象・制約・お告げの効き目) と動作の部品の選び方を、乱数で 1 つ選ぶ代わりに全部の枝に分けてたどる:
 *   remove → 消せる MOD から等しく (お告げの側・削り・光・未発現が先・上限を超えた側に当たると不成立)、
 *   add → 空きのある側から candidates の重み (段ごと)、fracture → 固定できる MOD から等しく、
 *   addUnrevealed → 側は unrevealedPlan の重み、満杯の側は固定以外から等しく 1 つ消す。
 * 乱数を使わない部品 (レアリティ・エッセンスの MOD・コラプト) は打つ処理の部品 (runPart) そのまま。
 * 発現 (候補から選ぶ = 確率ではなく選択)・数値だけ変わる手・品質・ルーンなどは null (revealOffers・applyCurrency を使う)。
 * 付く MOD の数値は段の真ん中 (行き先の区別に数値は使わない)。
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { allMods, candidates, catalystBoosts, catalystOf, hasExtraCatalyst, makeStageMod, overLimit, replaced, room, SIDES, unfracturable, withMod, without } from "../stage-core";
import { whittleTargets } from "../apply-currency";
import { isInfiniteEssence } from "../apply-essence";
import { tunedCatalysingMultiplier } from "../stage-tuning";
import type { StageItem, StageMod, StageSide } from "../types";
import { planSpec, type SpecPlan } from "./run-spec";
import { runPart, type PartCtx } from "./parts";
import { unrevealedMod, unrevealedPlan } from "./parts-unrevealed";
import { prepareEssence } from "./essence-specs";
import type { Action } from "./types";

/**
 * 行き先 1 つ。p = この行き先になる割合 (全部の和が 1)。item = 打った後のアイテム。
 * void = 打ったが当たり所で不成立 (カオスが上限を超えた側に当たった時など。アイテムは打つ前のまま、打つ処理の skipRandom)
 */
export interface StepOutcome { p: number; item: StageItem; added: StageMod[]; removed: StageMod[]; void?: true }

type Branch = { p: number; item: StageItem; added: StageMod[]; removed: StageMod[] };
type Step = Array<{ p: number; item: StageItem; added: StageMod[]; removed: StageMod[] } | { p: number; void: true }> | "skip";
type Remove = Extract<Action, { remove: unknown }>["remove"];
type Add = Extract<Action, { add: unknown }>["add"];
type AddUnrevealed = Extract<Action, { addUnrevealed: unknown }>["addUnrevealed"];

const MID = (): number => 0.5;
/** 1 つの部品で分かれる枝の上限 (大いなる高貴の 2 つ足すで 2〜3 万。錬金などの 3 つ以上足す手は掛け算で増えて固まるので、超えたら「多すぎ」) */
export const STEP_OUTCOMES_MAX = 50_000;
/** 枝が上限を超えた (中だけで使い、外へは投げない) */
const TOO_MANY = Symbol("tooMany");
const capped = <T>(xs: T[]): T[] => { if (xs.length > STEP_OUTCOMES_MAX) throw TOO_MANY; return xs; };
const SUPPORTED = (a: Action): boolean => "remove" in a || "add" in a || "fracture" in a || "addUnrevealed" in a || "setRarity" in a || "addEssence" in a || "corrupt" in a;
const ok = (item: StageItem, added: StageMod[] = [], removed: StageMod[] = []): Step => [{ p: 1, item, added, removed }];
const equally = (item: StageItem, xs: readonly StageMod[]): Step => xs.map((m) => ({ p: 1 / xs.length, item: without(item, m), added: [], removed: [m] }));

/** parts.ts の remove と同じ選び方 (指名は無し) */
function removeStep(ctx: PartCtx, item: StageItem, a: Remove): Step {
  if (a.n === "all") return ok({ ...item, prefixes: item.prefixes.filter((m) => m.fractured), suffixes: item.suffixes.filter((m) => m.fractured) }, [], allMods(item).filter((m) => !m.fractured));
  if ((ctx.mods.pick ?? a.pick) === "desecrated") {
    const ds = allMods(item).filter((m) => m.desecrated && !m.fractured);
    return ds.length ? equally(item, ds) : "skip";
  }
  if (a.ifAny && !allMods(item).length) return ok(item);
  const side = ctx.mods.removeSide ?? ctx.mods.side;
  if (a.unrevealedFirst) {
    const us = allMods(item).filter((m) => m.unrevealed && !m.fractured && (!side || m.side === side));
    if (us.length) return equally(item, us);
  }
  let sides: readonly StageSide[] = side ? [side] : SIDES;
  const e = ctx.essence;
  if (a.sideWhenFull && e && !room(item, e.side)) {
    if (side && side !== e.side) return "skip";
    sides = [e.side];
  }
  // n 回消す (今の手は 1 回だけ)。消せる物が尽きたらそこまで
  let states: Branch[] = [{ p: 1, item, added: [], removed: [] }];
  const out: Exclude<Step, "skip"> = [];
  for (let i = 0; i < a.n; i++) {
    const next: Branch[] = [];
    for (const s of states) {
      const gone = ctx.mods.pickLowest ? whittleTargets(s.item, side) : allMods(s.item).filter((m) => !m.fractured && sides.includes(m.side));
      if (!gone.length) { next.push(s); continue; }
      for (const m of gone) {
        const p = s.p / gone.length;
        if (a.overLimitVoids && overLimit(s.item, m.side)) out.push({ p, void: true });
        else next.push({ p, item: without(s.item, m), added: [], removed: [...s.removed, m] });
      }
    }
    states = capped(next);
  }
  for (const s of states) {
    if (s.removed.length || a.optional) out.push(s);
    else return "skip";
  }
  return out;
}

/** parts.ts の add と同じ候補 (stage-core の addOne: お告げの側 ∩ 空きのある側、触媒の高貴の重み)。n 個付ける手は 1 つずつ枝分かれ */
function addStep(ctx: PartCtx, item: StageItem, a: Add, last: boolean, merge?: (b: Branch) => string): Step {
  if (a.emptyOk && !SIDES.some((s) => room(item, s))) return ok(item);
  const n = ctx.mods.addCount ?? a.n;
  const omenSides = ctx.mods.side ? [ctx.mods.side] : SIDES;
  const { tag, pct } = catalystOf(item);
  const boost = ctx.mods.catalysing && tag ? { test: (m: { id: string; tags?: readonly string[] }) => catalystBoosts(item, { modId: m.id, tags: m.tags }, tag, ctx.data), mult: tunedCatalysingMultiplier(pct) } : undefined;
  const finish = (b: Branch): Branch => (ctx.mods.catalysing ? { ...b, item: hasExtraCatalyst(item.base) ? { ...b.item, catalystQuality: 0 } : { ...b.item, quality: 0 } } : b);
  let states: Branch[] = [{ p: 1, item, added: [], removed: [] }];
  const done: Branch[] = [];
  for (let i = 0; i < n; i++) {
    const next: Branch[] = [];
    for (const s of states) {
      const cs = candidates(ctx.data, s.item, omenSides.filter((x) => room(s.item, x)), a.floor, boost ? { boost } : {});
      const total = cs.reduce((x, c) => x + c.w, 0);
      // 付けられなければここで止まる (打つ処理の addOne が null で break)
      if (!(total > 0)) { done.push(s); continue; }
      for (const c of cs) for (const t of c.tiers) {
        const sm = makeStageMod(c.mod, c.side, t.index, MID);
        next.push({ p: (s.p * t.w) / total, item: withMod(s.item, sm), added: [...s.added, sm], removed: [] });
      }
      capped(next);
    }
    // 最後の部品の最後の 1 つは、行き先の区別 (merge) でまとめてから次へ (大いなる高貴で枝が掛け算で増えるのを抑える)
    states = last && i === n - 1 && merge ? mergeBranches(next, merge) : next;
  }
  const all = [...done, ...states];
  const out: Exclude<Step, "skip"> = [];
  for (const b of all) {
    if (b.added.length) out.push(finish(b));
    else if (a.optional) out.push(b);
    else return "skip";
  }
  return out;
}

/** parts.ts の addUnrevealed と同じ側の選び方 (unrevealedPlan)。満杯の側は固定以外から等しく 1 つ消してから */
function unrevealedStep(ctx: PartCtx, item: StageItem, a: AddUnrevealed): Step {
  if (a.fill) return runOnce(ctx, item, { addUnrevealed: a });
  const { mark, floor, fixed, weights } = unrevealedPlan(ctx.data, item, a, ctx.mods);
  if (fixed && !(weights.find((x) => x.s === fixed)!.w > 0)) return "skip";
  const sides = fixed ? [{ s: fixed, w: 1 }] : weights;
  const total = sides.reduce((x, y) => x + y.w, 0);
  if (!(total > 0)) return "skip";
  const hiddenOf = (side: StageSide): StageMod => unrevealedMod(side, { floor, altered: a.pools.includes("otherworldly"), faction: ctx.mods.guaranteeTag, ...(a.exclusiveAnyLevel ? {} : { gnawed: true }) });
  const out: Exclude<Step, "skip"> = [];
  for (const { s, w } of sides) {
    if (!(w > 0)) continue;
    const p = w / total;
    if (mark) { out.push({ p, item: withMod(without(item, mark), hiddenOf(s)), added: [hiddenOf(s)], removed: [mark] }); continue; }
    if (room(item, s)) { out.push({ p, item: withMod(item, hiddenOf(s)), added: [hiddenOf(s)], removed: [] }); continue; }
    const rem = allMods(item).filter((m) => !m.fractured && m.side === s);
    // 側をお告げで決めた時は打つ前に分かる (打てない)、重みで選んだ時は当たり所 (不成立)
    if (!rem.length) { if (fixed) return "skip"; out.push({ p, void: true }); continue; }
    for (const m of rem) out.push({ p: p / rem.length, item: withMod(without(item, m), hiddenOf(s)), added: [hiddenOf(s)], removed: [m] });
  }
  return out;
}

/** 乱数を使わない部品は打つ処理の部品そのまま */
function runOnce(ctx: PartCtx, item: StageItem, a: Action): Step {
  const r = runPart(ctx, item, a);
  return r.applied ? ok(r.item, r.added, r.removed) : "skip";
}

function mergeBranches(xs: readonly Branch[], key: (b: Branch) => string): Branch[] {
  const m = new Map<string, Branch>();
  for (const b of xs) {
    const k = key(b);
    const cur = m.get(k);
    if (cur) cur.p += b.p;
    else m.set(k, { ...b });
  }
  return [...m.values()];
}

/**
 * 持っているカレンシー (key・お告げ) を今のアイテムに 1 回打った時の行き先の一覧 (p の和は 1)。
 * 打てない時は [] (対象・制約・お告げの前提、全部の枝で付けられない・消せない)。行き先で表せない手 (発現・数値・品質・ルーン・無限のエッセンス …) は null。
 * merge: 行き先の区別の鍵 (同じ鍵の行き先は p を足して 1 つにし、最初のアイテムを代表に残す)。大いなる高貴のお告げなど 2 つ付ける手は渡すと軽い。
 */
export function stepOutcomes(data: PatchData, item: StageItem, key: string, omens: readonly string[] = [], o: { merge?: (r: StepOutcome) => string } = {}): StepOutcome[] | null {
  const r = stepOutcomesOrTooMany(data, item, key, omens, o);
  return r === "tooMany" ? null : r;
}
/** stepOutcomes と同じ。枝が上限 (STEP_OUTCOMES_MAX) を超える手 (錬金など 3 つ以上足す) は数え上げずに "tooMany" (stepOutcomes は null) */
export function stepOutcomesOrTooMany(data: PatchData, item: StageItem, key: string, omens: readonly string[] = [], o: { merge?: (r: StepOutcome) => string } = {}): StepOutcome[] | null | "tooMany" {
  const w = walk(data, item, key, omens, o);
  if (w === null || w === "tooMany" || w === "block") return w === "block" ? [] : w;
  // 全部の枝が弾かれた = 打てない
  if (!w.states.length) return [];
  let out: StepOutcome[] = w.states.map((s) => ({ p: s.p, item: s.item, added: s.added, removed: s.removed }));
  if (o.merge) out = mergeBranches(out, o.merge);
  if (w.vp > 0) out.push({ p: w.vp, item, added: [], removed: [], void: true });
  return out;
}

type State = Branch & { removedSoFar: StageMod[] };
/** 手の部品を順にたどる */
function walk(data: PatchData, item: StageItem, key: string, omens: readonly string[], o: { merge?: (r: StepOutcome) => string }): { states: State[]; vp: number } | null | "tooMany" | "block" {
  const plan: SpecPlan | null = planSpec(data, item, key, omens);
  if (!plan) return null;
  if (!plan.actions.every(SUPPORTED) || isInfiniteEssence(key)) return null;
  if (plan.block) return "block";
  const needsEssence = plan.spec.actions.some((a) => "addEssence" in a);
  const essence = needsEssence ? prepareEssence(data, item, key, MID) : null;
  if (needsEssence && !essence) return "block";
  const altered = plan.spec.actions.some((a) => "addUnrevealed" in a && a.addUnrevealed.pools.includes("otherworldly"));
  let states: State[] = [{ p: 1, item, added: [], removed: [], removedSoFar: [] }];
  const voids: number[] = [];
  try {
    plan.actions.forEach((a, i) => {
      const last = i === plan.actions.length - 1;
      const next: State[] = [];
      for (const s of states) {
        const ctx: PartCtx = { data, rng: MID, mods: plan.mods, reveal: plan.reveal, removedSoFar: s.removedSoFar, essence, catalystTag: plan.catalystTag, altered };
        const r: Step = "remove" in a ? removeStep(ctx, s.item, a.remove)
          : "add" in a ? addStep(ctx, s.item, a.add, last, o.merge ? (b) => o.merge!({ ...b, added: [...s.added, ...b.added], removed: [...s.removed, ...b.removed] }) : undefined)
          : "fracture" in a ? fractureStep(data, s.item)
          : "addUnrevealed" in a ? unrevealedStep(ctx, s.item, a.addUnrevealed)
          : runOnce(ctx, s.item, a);
        // 弾かれた枝は打つ前のまま (打つ処理は途中で弾かれたら手ごと不成立)。決まって弾かれる部品なら、その枝は不成立として数える
        if (r === "skip") { voids.push(s.p); continue; }
        for (const b of r) {
          if ("void" in b) voids.push(s.p * b.p);
          else next.push({ p: s.p * b.p, item: b.item, added: [...s.added, ...b.added], removed: [...s.removed, ...b.removed], removedSoFar: [...s.removedSoFar, ...b.removed] });
        }
      }
      states = capped(next);
    });
  } catch (e) {
    if (e === TOO_MANY) return "tooMany";
    throw e;
  }
  return { states, vp: voids.reduce((x, y) => x + y, 0) };
}

function fractureStep(data: PatchData, item: StageItem): Step {
  const pool = allMods(item).filter((m) => !unfracturable(data, item, m));
  if (!pool.length) return "skip";
  return pool.map((m) => {
    const next = { ...m, fractured: true };
    return { p: 1 / pool.length, item: replaced(item, m, next), added: [next], removed: [] };
  });
}
