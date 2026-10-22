/**
 * magic-odds.ts — MOD の無いマジックに 1 回足す (増強) 時の、候補の組 (どれか 1 つで当たり) の付きやすさ (2026-10-22 シミュの start-cost.ts の式を入口へ、
 * sim-own-logic.md の C)。打つ処理と同じ候補 (addOddsBySpec) から出す。数字の正しさは解析君に確かめてもらう (下の pHit と pAny の違い)
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { addOddsBySpec, hitShare, type OddsTarget } from "./spec/odds";
import { sideOfMod } from "./stage-core";
import type { StageItem, StageSide } from "./types";

export interface MagicAddOdds {
  /** その側に付いた時に、候補のどれかが当たる割合 (その側の候補の重みの中で) */
  hit: (side: StageSide, targets: readonly OddsTarget[]) => number;
  /** 付く 1 つ目がどちらの側に行くかの割合 (候補の重みの和、両側に候補が無ければ半々) */
  share: Record<StageSide, number>;
}
/** 増強などを 1 回打った時の、側ごとの当たりの割合と付く側の割合 (シミュの sim-odds の magicAugOdds と同じ) */
export function magicAddOdds(data: PatchData, blank: StageItem, key: string): MagicAddOdds {
  const cands = addOddsBySpec(data, blank, key, [])?.cands ?? [];
  const sum = (s: StageSide): number => cands.filter((c) => c.side === s).reduce((a, c) => a + c.w, 0);
  const pre = sum("prefix"), suf = sum("suffix");
  return {
    hit: (side, targets) => hitShare(cands.filter((c) => c.side === side), targets),
    share: pre + suf > 0 ? { prefix: pre / (pre + suf), suffix: suf / (pre + suf) } : { prefix: 0.5, suffix: 0.5 },
  };
}
/**
 * 候補の組 (どれか 1 つで当たり) の付きやすさ。
 *   each = 候補ごとの「自分の側に付いた時の割合」、pHit = その和を 1 で切った物 (シミュの start-cost の pAt と同じ。側の割合で重みを付けていない)。
 *   pAny = 側の割合込みで、1 回で候補のどれかが付く割合 (= Σ share[側] × その側の当たり。addHitOdds の p と同じ考え)。どちらを費用に使うかは解析君の確かめ待ち
 */
export function anyOfAddOdds(data: PatchData, odds: MagicAddOdds, members: readonly OddsTarget[]): { each: Array<{ modId: string; p: number }>; pHit: number; pAny: number } {
  const each = members.map((r) => ({ modId: r.modId, p: odds.hit(sideOfMod(data, r.modId), [r]) }));
  const sides = [...new Set(members.map((r) => sideOfMod(data, r.modId)))];
  const pAny = sides.reduce((a, s) => a + odds.share[s] * odds.hit(s, members.filter((r) => sideOfMod(data, r.modId) === s)), 0);
  return { each, pHit: Math.min(1, each.reduce((a, x) => a + x.p, 0)), pAny };
}
/** 増強の等級の並び (完全 → 上級 → 無印)。変成と増強の鍵つき */
export const ADD_GRADES = [
  { g: "perfect", aug: "augment_perfect", tra: "transmute_perfect", ja: "完全" },
  { g: "greater", aug: "augment_greater", tra: "transmute_greater", ja: "上級" },
  { g: "base", aug: "augment", tra: "transmute", ja: "無印" },
] as const;
export type AddGrade = (typeof ADD_GRADES)[number] & { odds: MagicAddOdds };
/**
 * 候補の組が付く一番上の等級 (完全の段の下限で狙いの段が出ない時は上級 → 無印に落とす。どれも 0 なら完全のまま。シミュの start-cost の grades と同じ)
 */
export function addGradeFor(data: PatchData, blank: StageItem, members: readonly OddsTarget[]): AddGrade {
  const grades = ADD_GRADES.map((x) => ({ ...x, odds: magicAddOdds(data, blank, x.aug) }));
  return grades.find((x) => anyOfAddOdds(data, x.odds, members).pHit > 0) ?? grades[0]!;
}
