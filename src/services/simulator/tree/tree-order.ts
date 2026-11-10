/**
 * tree-order.ts — 同じ中身の候補が並んだ時の決め手 = 木の並び (S-50e の足し、11-10)。
 * 上の段が先 → 同じ段は始まりからの道で、各段の親の結果の並び (削減の手前の枠 S-65c は組の中でいつも 低い→同じ→高い) → 最後に箱の番号。
 * 前は「浅い段・先に作った箱 (箱の番号)」で、保存して開き直すと番号と枠の並び (手のある枠が先頭) が変わり、自動の ↩ の行き先が入れ替わった
 * (シミュ部長 6 の切り分け: 手袋・削減の弓。エミュで枠の組は合い、揺れは木の並びだけ)
 */
import type { TreeBox, TreeDoc } from "./tree-model";
import { LV_ORDER, lvPart } from "./tree-whittle";
import { frameGroupKey } from "./tree-whittle-scene";

const seqOf = (id: string): number => (id === "start" ? -1 : Number(/\d+$/.exec(id)?.[0] ?? 0));

/** 兄弟の中の並び: 削減の枠は組の先頭の場所に置き、組の中は 低い→同じ→高い (箱の作られた順に依らない) */
function sibRank(doc: TreeDoc, p: TreeBox, b: TreeBox): number {
  const lv = lvPart(b.junkKey);
  if (!lv) return p.outs.indexOf(b.id) * 4;
  const g = frameGroupKey(b), first = p.outs.findIndex((o) => { const x = doc.boxes[o]; return !!x && !!lvPart(x.junkKey) && frameGroupKey(x) === g; });
  return Math.max(first, 0) * 4 + LV_ORDER.indexOf(lv);
}

/** 木の並びの比べ (上の段が先、同じ段は道の並び、最後に箱の番号)。比べ 1 回分の覚えを持つので、並べ替えごとに作る */
export function treeOrder(doc: TreeDoc): (x: string, y: string) => number {
  const memo = new Map<string, number[]>();
  const pathOf = (id: string): number[] => {
    const had = memo.get(id);
    if (had) return had;
    const out: number[] = [];
    for (let b = doc.boxes[id], n = 0; b?.parent && n < 500; b = doc.boxes[b.parent], n++) { const p = doc.boxes[b.parent]; if (!p) break; out.unshift(sibRank(doc, p, b)); }
    memo.set(id, out);
    return out;
  };
  return (x, y) => {
    const a = pathOf(x), b = pathOf(y);
    if (a.length !== b.length) return a.length - b.length;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
    return seqOf(x) - seqOf(y);
  };
}
