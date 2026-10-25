/**
 * 1 手の結果の種類ごとの割合 (2026-10-25 ジン部長 10 本目。シミュ部長 29 本目の頼み、オーナー 10-25「おすすめの2つで進めて」)。
 * ツリーの結果の箱 (PC の箱・スマホの ②) に「起こる割合」を出す。割合はシミュで数えず、ここ (stepOutcomes の枝) から取る。
 *
 * 分け方はツリーの結果の箱 (tree-sample の outcomeOf・possibleOutsOf) と同じ:
 *   狙いが新しく付いた = hit (付いた狙いごと)、狙いが消えた = lost、外れが消えただけ = junkGone、狙いが付かず何か付いた / 入れ替わった = junk。
 *   エッセンスは 2 つだけ (10-24 オーナー): 狙いが消えたら lost、ほかは hit (付いた狙いが無ければ any = 狙いの付かない当たり)。
 *   フラクチャーは新しく ✦ になった MOD が狙いなら hit (札 = その狙い)、ほかは junk。
 * 狙いの当たりは aimHits (段の番号以上、sameText で同じ文も)。外れ = 固定 (✦) でも狙いでもない MOD。
 * void (打ったが当たり所で不成立) の枝は除いて、残りの和が 1 になるように割り直す。
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import type { StageItem, StageMod } from "../../craft-stage/types";
import { kindOf } from "../../craft-stage/apply-currency";
import { unrevealedOf } from "../../craft-stage/apply-desecrate";
import { hits, type AimHitOpts, type AimTarget } from "../../craft-stage/aim-odds";
import { tierIndexOf } from "../../craft-stage/tier-rank";
import { stepOutcomesOrTooMany } from "./outcomes";

/** 結果の種類 (ツリーの箱の out と同じ名前) */
export type OutcomeKind = "hit" | "junk" | "lost" | "junkGone" | "any";
/** 狙い = MOD と段の名前の T (T 以上で当たり) */
export interface TierAimLike { modId: string; tier: number }
export interface OutcomeOdd<A extends TierAimLike> { out: OutcomeKind; aim: A | null; p: number }

const modsOf = (item: StageItem): StageMod[] => [...item.prefixes, ...item.suffixes];

/**
 * 打つ前 before と後 after で、どの種類の結果か (付いた狙いは hits に。2 つ以上付くこともある)。key = 打った手 (エッセンス・フラクチャーの分け方に使う)
 */
export function outcomeKindOf<A extends TierAimLike>(data: PatchData, before: StageItem, after: StageItem, aims: readonly A[], key: string, o: { sameText?: boolean } = {}): { out: OutcomeKind; hits: A[] } {
  const opts: AimHitOpts | undefined = o.sameText ? { data, sameText: true } : undefined;
  const ts: AimTarget[] = aims.map((a) => ({ modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, a.tier) }));
  const on = (ms: readonly StageMod[], i: number): boolean => ms.some((m) => hits(m, ts[i]!, opts));
  const bm = modsOf(before), am = modsOf(after);
  const gained = aims.filter((_, i) => !on(bm, i) && on(am, i));
  const lost = aims.filter((_, i) => on(bm, i) && !on(am, i));
  const junk = (ms: readonly StageMod[]): number => ms.filter((m) => !m.fractured && !ts.some((t) => hits(m, t, opts))).length;
  const k = kindOf(key);
  if (k.startsWith("essence")) return lost.length ? { out: "lost", hits: gained } : { out: gained.length ? "hit" : "any", hits: gained };
  if (k === "fracture") {
    const was = new Set(bm.filter((m) => m.fractured).map((m) => m.modId));
    const f = am.find((m) => m.fractured && !was.has(m.modId));
    const fh = f ? aims.filter((_, i) => hits(f, ts[i]!, opts)).slice(0, 1) : [];
    return fh.length ? { out: "hit", hits: fh } : { out: "junk", hits: [] };
  }
  if (gained.length) return { out: "hit", hits: gained };
  if (lost.length) return { out: "lost", hits: [] };
  if (junk(am) < junk(bm)) return { out: "junkGone", hits: [] };
  return { out: "junk", hits: [] };
}

/**
 * 今のアイテムに手 (key + お告げ) を 1 回打った時の、結果の種類ごとの割合 (和は 1、void を除いて割り直す)。並びは割合の大きい順。
 * 割合が出せない時は null: 行き先で表せない手 (stepOutcomes が null)・枝が多すぎる (tooMany)・未発現が付く手 (冒涜の骨、発現で選ぶ候補で分かれる)・
 * 1 つの枝で狙いが 2 つ以上付く (ツリーの箱は札 1 つ)・打てない (枝が無い)
 */
export function outcomeOdds<A extends TierAimLike>(data: PatchData, item: StageItem, key: string, omens: readonly string[], aims: readonly A[], o: { sameText?: boolean } = {}): OutcomeOdd<A>[] | null {
  const outs = stepOutcomesOrTooMany(data, item, key, omens);
  if (!outs || outs === "tooMany") return null;
  const live = outs.filter((r) => !r.void);
  const total = live.reduce((s, r) => s + r.p, 0);
  if (!live.length || total <= 0) return null;
  const by = new Map<string, OutcomeOdd<A>>();
  for (const r of live) {
    if (unrevealedOf(r.item)) return null;
    const c = outcomeKindOf(data, item, r.item, aims, key, o);
    if (c.hits.length > 1) return null;
    const aim = c.out === "hit" ? c.hits[0] ?? null : null;
    const id = `${c.out}:${aim ? `${aim.modId}/${aim.tier}` : ""}`;
    const cur = by.get(id);
    if (cur) cur.p += r.p / total;
    else by.set(id, { out: c.out, aim, p: r.p / total });
  }
  return [...by.values()].sort((a, b) => b.p - a.p);
}
