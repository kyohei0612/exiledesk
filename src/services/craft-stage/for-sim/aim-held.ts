/**
 * aim-held.ts — 狙いが当たる MOD・外れ・付いている狙い (2026-10-22 シミュの自前の式を入口へ、sim-own-logic.md の B2・B3。aim-odds.ts から分けた)。
 * 当たりの判定は核の aim-odds の hits (sameText = 同じ系統で文も同じ別の modId も当たり)
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { hits, type AimHitOpts, type AimTarget } from "../aim-odds";
import { tierIndexOf } from "../tier-rank";
import type { StageItem, StageMod } from "../types";

/** その MOD がどれかの狙いに当たる */
export const isAimMod = (m: StageMod, ts: readonly AimTarget[], o?: AimHitOpts): boolean => ts.some((t) => hits(m, t, o));
/**
 * 外れ = 固定 (フラクチャー) でも狙いでもない MOD、側ごと (2026-10-22 シミュの自前の式を入口へ、sim-own-logic.md の B2。
 * ツリーの junkCount・分かれ目の数え・形の鍵・満杯の文・行の札が同じ数え方)
 */
export function junkOf(item: StageItem, ts: readonly AimTarget[], o?: AimHitOpts): { prefix: StageMod[]; suffix: StageMod[] } {
  const junk = (ms: readonly StageMod[]): StageMod[] => ms.filter((m) => !m.fractured && !isAimMod(m, ts, o));
  return { prefix: junk(item.prefixes), suffix: junk(item.suffixes) };
}
/**
 * アイテムに狙い (modId と段の名前の T) が付いているか (2026-10-22 シミュの aimHeld の橋渡しを入口へ)。アイテムの MOD を全部見て、T を段の番号に直して aimHits。
 * sameText = 同じ系統で文も同じ別の modId も当たり (シミュの aimHeld と同じ)
 */
export function aimHeldOn(data: PatchData, item: StageItem, a: { modId: string; tier: number }, o?: { sameText?: boolean }): boolean {
  const t: AimTarget = { modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, a.tier) };
  const opts = o?.sameText ? { data, sameText: true } : undefined;
  return [...item.prefixes, ...item.suffixes].some((m) => hits(m, t, opts));
}
/** 付いている狙いの組 = 狙いのうちアイテムに付いている物 (並びは ts のまま。sim-own-logic.md の B3) */
export const heldSetOf = (item: StageItem, ts: readonly AimTarget[], o?: AimHitOpts): AimTarget[] => ts.filter((t) => [...item.prefixes, ...item.suffixes].some((m) => hits(m, t, o)));
