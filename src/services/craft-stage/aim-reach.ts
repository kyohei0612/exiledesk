/**
 * aim-reach.ts — 1 手の前と後で狙いがどう変わったか・この手で付きうる狙い (2026-10-22 シミュの自前の式を入口へ、sim-own-logic.md の B12)。
 * 狙いは段の名前の T ({ modId, tier })。当たりの判定は aim-odds の hits (sameText = 同じ系統で文も同じ別の modId も当たり)、行き先はエンジンの stepOutcomes
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { hits, junkOf, type AimTarget } from "./aim-odds";
import { stepOutcomes, stepPool, type StepOutcome } from "./spec/outcomes";
import { tierIndexOf } from "./tier-rank";
import type { StageItem, StageMod } from "./types";

/** 段の名前の T で言う狙い (T1 が一番上) */
export interface TierAim { modId: string; tier: number }
export interface AimDiffOpts { sameText?: boolean }

const targetOf = (data: PatchData, a: TierAim): AimTarget => ({ modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, a.tier) });
const modsOf = (item: StageItem): StageMod[] => [...item.prefixes, ...item.suffixes];
const heldOn = (data: PatchData, mods: readonly StageMod[], a: TierAim, o: AimDiffOpts): boolean => {
  const t = targetOf(data, a), opts = o.sameText ? { data, sameText: true } : undefined;
  return mods.some((m) => hits(m, t, opts));
};

export interface AimDiff<A extends TierAim = TierAim> {
  /** 前に無く後に付いている狙い (並びは aims のまま) */
  hits: A[];
  /** 前に付いていて後に無い狙い */
  lost: A[];
  /** 外れ (固定でも狙いでもない MOD) の数が減った */
  junkGone: boolean;
  /** 新しく ✦ (フラクチャー) になった MOD (無ければ null) と、それが当たる狙い */
  fractured: StageMod | null;
  fracturedHits: A[];
}

/** 1 手の前 (before) と後 (after) で狙いがどう変わったか */
export function aimDiff<A extends TierAim>(data: PatchData, before: StageItem, after: StageItem, aims: readonly A[], o: AimDiffOpts = {}): AimDiff<A> {
  const bm = modsOf(before), am = modsOf(after);
  const had = aims.filter((a) => heldOn(data, bm, a, o));
  const has = aims.filter((a) => heldOn(data, am, a, o));
  const ts = aims.map((a) => targetOf(data, a)), opts = o.sameText ? { data, sameText: true } : undefined;
  const junk = (it: StageItem): number => { const j = junkOf(it, ts, opts); return j.prefix.length + j.suffix.length; };
  const was = new Set(bm.filter((m) => m.fractured).map((m) => m.modId));
  const fractured = am.find((m) => m.fractured && !was.has(m.modId)) ?? null;
  return {
    hits: has.filter((a) => !had.includes(a)),
    lost: had.filter((a) => !has.includes(a)),
    junkGone: junk(after) < junk(before),
    fractured,
    fracturedHits: fractured ? aims.filter((a) => heldOn(data, [fractured], a, o)) : [],
  };
}

/** 1 手の行き先 (stepOutcomes、消える枝 void は除く) を、狙いの変わり方と一緒に。エンジンが枝に分けられない手は null */
export function outcomesByAim<A extends TierAim>(data: PatchData, item: StageItem, key: string, omens: readonly string[], aims: readonly A[], o: AimDiffOpts = {}): Array<StepOutcome & { diff: AimDiff<A> }> | null {
  const outs = stepOutcomes(data, item, key, omens);
  if (!outs) return null;
  return outs.filter((x) => !x.void).map((x) => ({ ...x, diff: aimDiff(data, item, x.item, aims, o) }));
}

/**
 * この手で付きうる狙い = items (同じ箱の見本など) のどれかに打った行き先のどれかに付いている狙い (並びは aims のまま)。
 * 行き先は数え上げず、エンジンの stepPool (足す前の枝のアイテム + 最後に足す部品の候補の池。側・段・アイテムレベル・お告げ込み) で答えるので、
 * 錬金など何個も足す手でも固まらない。どの見本でも行き先が 1 つも無い (エンジンが枝に分けられない・打てない・多すぎる) 時は null (呼ぶ側が決める)
 */
export function reachableAims<A extends TierAim>(data: PatchData, items: readonly StageItem[], key: string, omens: readonly string[], aims: readonly A[], o: AimDiffOpts = {}): A[] | null {
  const ps = items.flatMap((it) => { const r = stepPool(data, it, key, omens); return r && r !== "tooMany" && r.items.length ? [r] : []; });
  if (!ps.length) return null;
  return aims.filter((a) => ps.some((r) => heldOn(data, r.pool, a, o) || r.items.some((it) => heldOn(data, modsOf(it), a, o))));
}
