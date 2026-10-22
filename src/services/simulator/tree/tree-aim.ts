/**
 * tree-aim.ts — ツリーの当たりの小さな判定 (段の名前の T で持つ狙い・同じ系統で文も同じ別の modId も当たり)。中身はエンジンの核の aimHits と段の換算 tierIndexOf を呼ぶだけ
 * (2026-10-23 エンジンの for-sim から戻した。オーナー「元からエンジンにあった物をシミュが勝手に自前で作っただけ」)
 */
import { aimHits as hits, tierIndexOf, type AimHitOpts, type AimTarget, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";

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
