/**
 * tree-copy-fit.ts — 兄弟枠で写す手の設定が、写した先の品で意味を持つか (S-190d、11-17、係 f の #7・#8・#9)。
 * 打てるか (tree-copy-block の handBlockAt) とは別: 打てても、残したい MOD・☑ の狙い・神の目標が写した先の品に合わなければ写さず空のまま。
 * 見本は箱の代表の品 (sampleOf seed 1、handBlockAt と同じ)。見本が作れない箱は写さない
 */
import type { PatchData, StageItem } from "../../../services/craft-stage/engine";
import { aimHeldOn } from "../../../services/simulator/tree/tree-aim";
import { sampleOf } from "../../../services/simulator/tree/tree-sample";
import type { Aim, Hand, TreeDoc } from "../../../services/simulator/tree/tree-model";
import { hitAimsOf } from "./tree-hand-plan";

/** 段を問わない狙い (T の数が大きいほど下の段、aimHeldOn は「この段以上」) */
const ANY_TIER = 99;
const itemOf = (data: PatchData, d: TreeDoc, id: string): StageItem | null => { try { return sampleOf(data, d, id, 1)?.item ?? null; } catch { return null; } };
/** ☑ の候補 (手の窓と同じ hitAimsOf、完成の狙い = memoAims) の MOD の並び */
const candsOf = (data: PatchData, d: TreeDoc, id: string, it: StageItem, h: Hand): string => hitAimsOf(data, d, id, it, h, d.memoAims ?? []).map((a) => a.modId).sort().join();

/**
 * src の箱の手 (h・☑ = aims) を id の箱へ写してよいか。
 * ① 残したい MOD (keep) は写す先の品に全部ある時だけ (#7) ② 神の目標は写す先の品に目標の MOD が全部ある時だけ (#9)
 * ③ ☑ は写す先の品の候補が元の箱の候補と同じ時だけ (#8。候補の違う箱では ☑ の意味が変わり、要る狙いが外れに数えられる)
 */
export function fitsAt(data: PatchData, d: TreeDoc, src: string | null, id: string, h: Hand, aims: readonly Aim[]): boolean {
  const it = itemOf(data, d, id);
  if (!it) return false;
  if (h.keep?.length && !h.keep.every((a) => aimHeldOn(data, it, a, { sameText: true }))) return false;
  // 神の目標の MOD が付いているか (段は問わない = 一番下の段まで、エンジンの aimHeldOn)
  if (h.targets?.length && !h.targets.every((t) => aimHeldOn(data, it, { modId: t.modId, tier: ANY_TIER }))) return false;
  // ☑ は元の箱の候補から選んだ物なので、候補が同じなら写す先でも同じ意味
  if (aims.length) {
    const si = src ? itemOf(data, d, src) : null;
    if (!si || candsOf(data, d, src!, si, h) !== candsOf(data, d, id, it, h)) return false;
  }
  return true;
}
