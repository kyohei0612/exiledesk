/**
 * 1 手の行き先の一覧 (2026-10-20 ジン部長。解析君の頼み事「手の効果を入口から組む」、docs/org/emulator/todo.md の案)。
 *
 * 打つ処理 (applyBySpec) と同じ planSpec (対象・制約・お告げの効き目) と動作の部品の選び方を、乱数で 1 つ選ぶ代わりに全部の枝に分けてたどる:
 *   remove → 消せる MOD から等しく (土台 spec/basis.ts の removalOf: お告げの側・削り・光・上限を超えた側に当たると不成立)、
 *   add → 空きのある側から candidates の重み (段ごと)、fracture → 固定できる MOD から等しく、
 *   addUnrevealed → 側は unrevealedPlan の重み、枠は土台の boneSlotOf (満杯の側は固定以外から等しく 1 つ消す・上限を超えた側には付かない E-25)。
 * 乱数を使わない部品 (レアリティ・エッセンスの MOD・コラプト) は打つ処理の部品 (runPart) そのまま。
 * 発現 (候補から選ぶ = 確率ではなく選択)・数値だけ変わる手・品質・ルーンなどは null (revealOffers・applyCurrency を使う)。
 * 付く MOD の数値は段の下限 (S-202 ②。行き先の区別に数値は使わない)。
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { allMods, hasExtraCatalyst, makeStageMod, replaced, room, SIDES, unfracturable, withMod, without } from "../../craft-stage/stage-core";
import { infiniteChoices, isInfiniteEssence } from "../../craft-stage/apply-essence";
import { addCandidatesOf, boneSlotOf, removalOf } from "../../craft-stage/spec/basis";
import type { StageItem, StageMod, StageSide } from "../../craft-stage/types";
import { planSpec, type SpecPlan } from "../../craft-stage/spec/run-spec";
import { runPart, type PartCtx } from "../../craft-stage/spec/parts";
import { unrevealedMod, unrevealedPlan } from "../../craft-stage/spec/parts-unrevealed";
import { prepareEssence } from "../../craft-stage/spec/essence-specs";
import type { Action } from "../../craft-stage/spec/types";
import { emotionNameOf } from "../../craft-stage/apply-emotion";
import { jewelEmotionsOf } from "../../htc/patch";

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
/** 付く MOD の数値 = 段の下限 (S-202 ②、11-06 オーナー「他が全部下限値でおｋ」。数値を決めるのは神の目標) */
const LOW = (): number => 0;
/** 1 つの部品で分かれる枝の上限 (大いなる高貴の 2 つ足すで 2〜3 万。錬金などの 3 つ以上足す手は掛け算で増えて固まるので、超えたら「多すぎ」) */
export const STEP_OUTCOMES_MAX = 50_000;
/** 枝が上限を超えた (中だけで使い、外へは投げない) */
const TOO_MANY = Symbol("tooMany");
const capped = <T>(xs: T[]): T[] => { if (xs.length > STEP_OUTCOMES_MAX) throw TOO_MANY; return xs; };
const SUPPORTED = (a: Action): boolean => "remove" in a || "add" in a || "fracture" in a || "addUnrevealed" in a || "setRarity" in a || "addEssence" in a || "corrupt" in a || "addEmotion" in a;
const ok = (item: StageItem, added: StageMod[] = [], removed: StageMod[] = []): Step => [{ p: 1, item, added, removed }];
const equally = (item: StageItem, xs: readonly StageMod[]): Step => xs.map((m) => ({ p: 1 / xs.length, item: without(item, m), added: [], removed: [m] }));

/** parts.ts の remove と同じ選び方 (土台の removalOf を全部の枝に分ける。指名は無し) */
function removeStep(ctx: PartCtx, item: StageItem, a: Remove): Step {
  const R = removalOf(item, a, ctx.mods, ctx.essence?.side);
  if ("all" in R) return ok({ ...item, prefixes: item.prefixes.filter((m) => m.fractured), suffixes: item.suffixes.filter((m) => m.fractured) }, [], R.all);
  if ("skip" in R) return "skip";
  if ("none" in R) return ok(item);
  if (R.desecrated) return equally(item, R.pick(item));
  // n 回消す (今の手は 1 回だけ)。消せる物が尽きたらそこまで
  let states: Branch[] = [{ p: 1, item, added: [], removed: [] }];
  const out: Exclude<Step, "skip"> = [];
  for (let i = 0; i < (a.n === "all" ? 0 : a.n); i++) {
    const next: Branch[] = [];
    for (const s of states) {
      const gone = R.pick(s.item);
      if (!gone.length) { next.push(s); continue; }
      for (const m of gone) {
        const p = s.p / gone.length;
        if (R.voids(s.item, m)) out.push({ p, void: true });
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
  if (a.emptyOk && !SIDES.some((s) => room(item, s, ctx.before))) return ok(item);
  const n = ctx.mods.addCount ?? a.n;
  const finish = (b: Branch): Branch => (ctx.mods.catalysing ? { ...b, item: hasExtraCatalyst(item.base) ? { ...b.item, catalystQuality: 0 } : { ...b.item, quality: 0 } } : b);
  let states: Branch[] = [{ p: 1, item, added: [], removed: [] }];
  const done: Branch[] = [];
  for (let i = 0; i < n; i++) {
    const next: Branch[] = [];
    for (const s of states) {
      // 触媒の重みは打つ前の品の品質で (打つ処理の parts.ts の add と同じ。付けた後の品の品質は変わらない)
      const cs = addCandidatesOf(ctx.data, s.item, a, ctx.mods, ctx.before, item);
      const total = cs.reduce((x, c) => x + c.w, 0);
      // 付けられなければここで止まる (打つ処理の addOne が null で break)
      if (!(total > 0)) { done.push(s); continue; }
      for (const c of cs) for (const t of c.tiers) {
        const sm = makeStageMod(c.mod, c.side, t.index, LOW);
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

/** parts.ts の addUnrevealed と同じ側の選び方 (unrevealedPlan) と枠 (土台の boneSlotOf: 印の置き換え・空き・満杯の側を固定以外から等しく 1 つ消す・上限超え E-25) */
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
    const slot = boneSlotOf(item, s, mark, ctx.before);
    // 付かない側: お告げで決めた側なら打つ前に分かる (打てない)、重みで選んだ時は当たり所 (不成立)
    if ("over" in slot || "stuck" in slot) { if (fixed) return "skip"; out.push({ p, void: true }); continue; }
    if ("open" in slot) { out.push({ p, item: withMod(item, hiddenOf(s)), added: [hiddenOf(s)], removed: [] }); continue; }
    const from = "mark" in slot ? [slot.mark] : slot.replace;
    for (const m of from) out.push({ p: p / from.length, item: withMod(without(item, m), hiddenOf(s)), added: [hiddenOf(s)], removed: [m] });
  }
  return out;
}

/**
 * parts.ts の addEmotion と同じ選び方: 液化した感情の作った MOD の版のうち、付ける側に空きのある物から等しく 1 つ (獰猛・軽蔑はプレの版とサフィの版)。
 * 空きのある版が無ければ当たり所で不成立 (打つ処理の skipRandom)。2026-11-03 シミュ部長 68 (前は行き先で表せない手で null = 木の結果が 1 箱だった)
 */
function emotionStep(ctx: PartCtx, item: StageItem, key: string): Step {
  const fits = jewelEmotionsOf(item.cls.id).filter((e) => e.item === emotionNameOf(key) && room(item, e.side as StageSide, ctx.before));
  if (!fits.length) return [{ p: 1, void: true }];
  return fits.flatMap((e) => {
    const mod = ctx.data.mods.get(e.modId);
    if (!mod) return [];
    const added: StageMod = { ...makeStageMod(mod, e.side as StageSide, 0, LOW), crafted: true };
    return [{ p: 1 / fits.length, item: withMod(item, added), added: [added], removed: [] }];
  });
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
function walk(data: PatchData, item: StageItem, key: string, omens: readonly string[], o: { merge?: (r: StepOutcome) => string; essence?: ReturnType<typeof prepareEssence> }): { states: State[]; vp: number } | null | "tooMany" | "block" {
  const plan: SpecPlan | null = planSpec(data, item, key, omens);
  if (!plan) return null;
  if (!plan.actions.every(SUPPORTED)) return null;
  if (plan.block) return "block";
  // 無限のエッセンス: 付く MOD は付きうる物 (infiniteChoices) から等しく 1 つ。選び方ごとに枝を分けて 1/n ずつ (2026-10-24 シミュ部長 20 本目、前は数え上げなかった)
  if (isInfiniteEssence(key) && !o.essence) {
    const n = infiniteChoices(data, item, key).length;
    if (!n) return "block";
    const states: State[] = [];
    let vp = 0;
    for (let j = 0; j < n; j++) {
      let first = true;
      const pickJ = (): number => (first ? ((first = false), (j + 0.5) / n) : 0.5);
      const essence = prepareEssence(data, item, key, pickJ);
      if (!essence) continue;
      const r = walk(data, item, key, omens, { ...o, essence });
      if (r === "tooMany") return r;
      if (!r || r === "block") continue;
      for (const s of r.states) states.push({ ...s, p: s.p / n });
      vp += r.vp / n;
    }
    return states.length || vp ? { states, vp } : "block";
  }
  const needsEssence = plan.spec.actions.some((a) => "addEssence" in a);
  const essence = o.essence ?? (needsEssence ? prepareEssence(data, item, key, MID) : null);
  if (needsEssence && !essence) return "block";
  const altered = plan.spec.actions.some((a) => "addUnrevealed" in a && a.addUnrevealed.pools.includes("otherworldly"));
  let states: State[] = [{ p: 1, item, added: [], removed: [], removedSoFar: [] }];
  const voids: number[] = [];
  try {
    plan.actions.forEach((a, i) => {
      const last = i === plan.actions.length - 1;
      const next: State[] = [];
      for (const s of states) {
        // 消してから付ける時の枠は打つ前の品の上限 (E-30a、エンジンの parts.ts の ctx.before と同じ)
        const ctx: PartCtx = { data, rng: MID, mods: plan.mods, reveal: plan.reveal, removedSoFar: s.removedSoFar, essence, catalystTag: plan.catalystTag, altered, before: item };
        const r: Step = "remove" in a ? removeStep(ctx, s.item, a.remove)
          : "add" in a ? addStep(ctx, s.item, a.add, last, o.merge ? (b) => o.merge!({ ...b, added: [...s.added, ...b.added], removed: [...s.removed, ...b.removed] }) : undefined)
          : "fracture" in a ? fractureStep(data, s.item)
          : "addUnrevealed" in a ? unrevealedStep(ctx, s.item, a.addUnrevealed)
          : "addEmotion" in a ? emotionStep(ctx, s.item, key)
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
