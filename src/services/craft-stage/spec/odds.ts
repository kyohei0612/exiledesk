/**
 * 確率表の「付く MOD の候補と重み」を説明文の分解 (spec) から引く (2026-10-16、ADR-004 の残り)。
 *
 * 前は apply-currency.ts の addCandidates が、変成・増強・王者・錬金・高貴・カオスごとに候補の決まりを switch で手書きしていた (打つ処理の写し)。
 * ここでは打つ処理と同じ planSpec (対象・制約・お告げの効き目) と動作の部品 (actions) を順にたどる:
 *   setRarity → レアリティを変える、remove → 消える MOD ごとに枝分かれ (等しい確率。削りのお告げ・抹消の側・上限を超えた側は打つ処理と同じ)、
 *   add → 最後の状態の空いている側から candidates (stage-core、打つ処理の addOne と同じ候補・重み・触媒の重み)。
 * 枝分かれした時は、枝ごとに付く割合 (重み ÷ 枝の重みの和) を枝の確率で足し合わせる。付けられない枝は数えない (付かなかった分は表に出ない)
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { allMods, candidates, catalystBoosts, catalystOf, overLimit, room, SIDES, unfracturable, without, type Candidate } from "../stage-core";
import { whittleTargets } from "../apply-currency";
import { tunedCatalysingMultiplier } from "../stage-tuning";
import type { StageItem, StageSide } from "../types";
import { planSpec, type SpecPlan } from "./run-spec";
import type { Mods } from "./parts";
import type { Action } from "./types";

type Add = Extract<Action, { add: unknown }>["add"];
type Remove = Extract<Action, { remove: unknown }>["remove"];

/** 1 回で付く MOD の候補 (cands) と、この手で付く数 (n: 大いなる高貴なら 2、錬金なら 4) */
export interface AddOdds { cands: Candidate[]; n: number }

/** その状態で 1 つ付ける時の候補 (parts.ts の add → stage-core の addOne と同じ: お告げの側 ∩ 空きのある側、触媒の高貴の重み) */
export function addCands(data: PatchData, item: StageItem, a: Add, mods: Mods): Candidate[] {
  const sides = (mods.side ? [mods.side] : SIDES).filter((s) => room(item, s));
  if (a.emptyOk && !SIDES.some((s) => room(item, s))) return [];
  const { tag, pct } = catalystOf(item);
  const boost = mods.catalysing && tag ? { test: (m: { id: string; tags?: readonly string[] }) => catalystBoosts(item, { modId: m.id, tags: m.tags }, tag, data), mult: tunedCatalysingMultiplier(pct) } : undefined;
  return candidates(data, item, sides, a.floor, boost ? { boost } : {});
}

/** 消える MOD の候補 (parts.ts の remove と同じ選び方。上限を超えた側に当たると手ごと不成立なので、その枝は数えない) */
function removeBranches(item: StageItem, a: Remove, mods: Mods): StageItem[] | null {
  if (a.n === "all") return [{ ...item, prefixes: item.prefixes.filter((m) => m.fractured), suffixes: item.suffixes.filter((m) => m.fractured) }];
  // 1 つ以外 (冒涜だけを消す光のお告げ・2 つ以上消す手) は MOD を付ける手に無い
  if (a.n !== 1 || (mods.pick ?? a.pick) !== "equal") return null;
  if (a.ifAny && !allMods(item).length) return [item];
  const side: StageSide | null = mods.removeSide ?? mods.side;
  const gone = mods.pickLowest ? whittleTargets(item, side) : allMods(item).filter((m) => !m.fractured && (!side || m.side === side));
  const ok = a.overLimitVoids ? gone.filter((m) => !overLimit(item, m.side)) : gone;
  if (!ok.length) return a.optional && !gone.length ? [item] : [];
  return ok.map((m) => without(item, m));
}

/**
 * 持っているカレンシーで次に付く MOD の候補と重み。MOD を足さない手 (骨・エッセンス・神 …)・移していない手・対象で打てない手は null、
 * それ以外で打てない時 (コラプト・空きが無い・アイテムレベルが下限未満・お告げの前提) は候補 0 (表は全部 0%)
 */
export function addOddsBySpec(data: PatchData, item: StageItem, key: string, omens: readonly string[], plan: SpecPlan | null = planSpec(data, item, key, omens)): AddOdds | null {
  if (!plan) return null;
  const last = plan.actions[plan.actions.length - 1];
  if (!last || !("add" in last)) return null;
  const n = plan.mods.addCount ?? last.add.n;
  // 対象 (レアリティ・部位) で打てない時は表を出さない (持っていない時と同じ出やすさ)。それ以外で打てない時は全部 0%
  if (plan.block) return plan.offTarget ? null : { cands: [], n };
  let states: StageItem[] = [item];
  let branched = false;
  for (const a of plan.actions.slice(0, -1)) {
    if ("setRarity" in a) states = states.map((it) => ({ ...it, rarity: a.setRarity }));
    else if ("remove" in a) {
      const next: StageItem[] = [];
      for (const it of states) {
        const bs = removeBranches(it, a.remove, plan.mods);
        if (!bs) return null;
        next.push(...bs);
      }
      branched ||= next.length > 1 || a.remove.n !== "all";
      states = next;
    } else return null;
  }
  if (!branched) return { cands: states.length ? addCands(data, states[0]!, last.add, plan.mods) : [], n };
  // 枝ごとに割合で足し合わせる (消えた MOD と同じ系統も、消えた後なら付きうる)
  const acc = new Map<string, Candidate>();
  for (const it of states) {
    const cs = addCands(data, it, last.add, plan.mods);
    const total = cs.reduce((x, c) => x + c.w, 0);
    if (!(total > 0)) continue;
    const k = 1 / states.length / total;
    for (const c of cs) {
      const cur = acc.get(c.mod.id);
      if (!cur) { acc.set(c.mod.id, { ...c, w: c.w * k, tiers: c.tiers.map((t) => ({ ...t, w: t.w * k })) }); continue; }
      cur.w += c.w * k;
      for (const t of c.tiers) { const x = cur.tiers.find((y) => y.index === t.index); if (x) x.w += t.w * k; else cur.tiers.push({ ...t, w: t.w * k }); }
    }
  }
  return { cands: [...acc.values()], n };
}

/** 狙い 1 つ (その MOD のその段以上。aim-odds の AimTarget と同じ形) */
export interface OddsTarget { modId: string; minTierIndex: number }

/** 候補の重みのうち、狙いのどれか (その段以上) が占める割合。同じ MOD が 2 回あれば低い方の段で 1 回だけ数える */
export function hitShare(cands: readonly Candidate[], targets: readonly OddsTarget[]): number {
  const min = new Map<string, number>();
  for (const t of targets) min.set(t.modId, Math.min(min.get(t.modId) ?? Infinity, t.minTierIndex));
  const total = cands.reduce((a, c) => a + c.w, 0);
  if (!(total > 0)) return 0;
  const hit = cands.reduce((a, c) => { const m = min.get(c.mod.id); return m == null ? a : a + c.tiers.reduce((x, t) => x + (t.index >= m ? t.w : 0), 0); }, 0);
  return Math.min(1, hit / total);
}

/** 1 手で付く 1 つ目が狙いに当たる割合 (p)、この手で付く数 (n)、付く 1 つ目がどちらの側に行くかの割合 (side)、候補の重みの和 (total) */
export interface AddHit { p: number; n: number; side: Record<StageSide, number>; total: number }

/**
 * 持っているカレンシー (key・お告げ) を今のアイテムに 1 回打った時、付く 1 つ目が狙いのどれかに当たる割合。打つ処理と同じ候補 (addOddsBySpec) から出す。
 * n が 2 以上の手 (大いなる高貴・錬金) は 1 つ目だけ (2 つ目以降は 1 つ目が付いた後の候補で変わる)。MOD を足さない手は null
 */
export function addHitOdds(data: PatchData, item: StageItem, key: string, omens: readonly string[], targets: readonly OddsTarget[]): AddHit | null {
  const o = addOddsBySpec(data, item, key, omens);
  if (!o) return null;
  const total = o.cands.reduce((a, c) => a + c.w, 0);
  const on = (s: StageSide): number => (total > 0 ? o.cands.filter((c) => c.side === s).reduce((a, c) => a + c.w, 0) / total : 0);
  return { p: hitShare(o.cands, targets), n: o.n, side: { prefix: on("prefix"), suffix: on("suffix") }, total };
}

/**
 * フラクチャーを今のアイテムに 1 回打った時、狙いのどれか (その段以上) が固定される割合 (parts.ts の fracture と同じ: 固定できる MOD から等しく 1 つ。
 * 未発現の枠・冒涜の MOD は選ばれない)。pool = 固定できる MOD の数 (0 なら打てない)。既にフラクチャー済みのアイテムに打てるかは見ない (棚の条件 = planSpec の側)
 */
export function fractureHit(data: PatchData, item: StageItem, targets: readonly OddsTarget[]): { p: number; pool: number } {
  const pool = allMods(item).filter((m) => !unfracturable(data, item, m));
  const hit = pool.filter((m) => targets.some((t) => m.modId === t.modId && m.tierIndex >= t.minTierIndex)).length;
  return { p: pool.length ? hit / pool.length : 0, pool: pool.length };
}
