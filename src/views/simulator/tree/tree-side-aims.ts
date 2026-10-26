/**
 * tree-side-aims.ts — 当たりの箱の横の ＋ (当たりを横に足す) で足せる狙い (10-26 夜オーナー: 本番で ＋ を押しただけで箱ができ、
 * もう付いている MOD しか無い箱が足された)。完成の狙いのうち、前の箱 (親) でもう付いていない・親の手で付きうる・横の箱でまだ選んでいない物。
 * TreeBox の横の ＋ を出すか と TreeModPick の選べない行が同じ決め
 */
import type { PatchData } from "../../../services/craft-stage/engine";
import { aimHeldOn } from "../../../services/simulator/tree/tree-aim";
import { sampleOf } from "../../../services/simulator/tree/tree-sample";
import { aimKey, boxAims, type Aim, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { hitAimsOf, kindOf } from "./tree-hand-plan";

/** 付く狙いを見る手 (消す・品質などは見ない、TreeModPick の reach と同じ) */
const REACH_KINDS = ["add", "swap", "spam", "essence", "fracture"];

/** 横の箱 (同じ親の結果の当たり) でもう選んでいる狙いの鍵。except = 選び直している箱 (自分の狙いは選べる) */
export function takenBeside(doc: TreeDoc, boxId: string, except: string | null): Set<string> {
  const p = doc.boxes[doc.boxes[boxId]?.parent ?? ""];
  return new Set((p?.outs ?? []).filter((o) => o !== except).flatMap((o) => { const c = doc.boxes[o]; return c?.out === "hit" ? boxAims(c) : []; }).map(aimKey));
}
/** 横の ＋ で足せる狙い。完成の狙いが無い木は null (どの MOD も選べる) */
export function sideAims(data: PatchData, doc: TreeDoc, goals: readonly Aim[], boxId: string): Aim[] | null {
  const b = doc.boxes[boxId], p = b?.parent ? doc.boxes[b.parent] : undefined;
  if (!b || b.out !== "hit" || !p) return [];
  if (!goals.length) return null;
  const it = sampleOf(data, doc, p.id, 1).item;
  const reach = p.hand && REACH_KINDS.includes(kindOf(p.hand)) ? new Set(hitAimsOf(data, doc, p.id, it, p.hand, [...goals]).map((a) => a.modId)) : null;
  const taken = takenBeside(doc, boxId, null);
  return goals.filter((a) => !aimHeldOn(data, it, a, { sameText: true }) && (!reach || reach.has(a.modId)) && !taken.has(aimKey(a)));
}
