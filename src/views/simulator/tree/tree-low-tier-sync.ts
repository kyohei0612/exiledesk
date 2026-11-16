/**
 * tree-low-tier-sync.ts — 前に作った「<狙い> 低ティア MOD」の箱 (S-33g) を片付ける。11-16 から木に低ティアの箱は作らず、低いティアで付いた人は
 * 回す時に「予期せぬ狙い MOD」の止まりになる (tree-low-tier の lowTierStopOf)。手を決めた時・外した時に、人の決め (手・人が付けた ↩・完成 / 失敗) の無い低ティアの箱を消す
 */
import type { PatchData } from "../../../services/craft-stage/engine";
import { drop, subtree, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { isLowTierBox } from "../../../services/simulator/tree/tree-low-tier";

/** 箱 id の手の結果の低ティアの箱のうち、人の決めの無い物を消す */
function syncOne(d: TreeDoc, id: string): void {
  const b = d.boxes[id];
  if (!b) return;
  for (const o of [...b.outs]) {
    const c = d.boxes[o];
    if (!c || !isLowTierBox(c)) continue;
    if (!c.hand && (!c.back || c.autoBack) && !c.done) { drop(d, [c.id]); b.outs = b.outs.filter((x) => x !== c.id); }
  }
}

/** 箱 at と、その上・下の手のある箱の低ティアの箱を片付ける (手を決めた後・外した後) */
export function syncLowTier(_data: PatchData, d: TreeDoc, at: string | null): void {
  if (!at || !d.boxes[at]) return;
  for (let p = d.boxes[at]?.parent ? d.boxes[d.boxes[at]!.parent!] : undefined; p; p = p.parent ? d.boxes[p.parent] : undefined) if (p.hand) syncOne(d, p.id);
  for (const id of subtree(d, at)) if (d.boxes[id]?.hand) syncOne(d, id);
}
