/**
 * tree-flow-once.ts — (S-196i、スイッチ drawOnce) 画面に出ている木の描く物 (畳み・隠す箱・箱の深さ・完成を押すまで隠す外れの箱) を、
 * 同じ流れ (同じマイクロタスクの間 = 画面の 1 回の描き) の中では 1 回だけ作る。箱ごとに描く子を求めるたびに木全体から作り直していた
 * (171 箱の木で手を置く時の描き直しが箱の数の 2 乗)。次の流れでは必ず作り直す。
 * 覚えるのは画面に出ている木だけ (組み替えの途中の写し = edit の中の木は書き換えながら引くので毎回作る)。frameSigOnce (S-196d) と同じ考え
 */
import type { TreeDoc } from "./tree-model";
import { flag } from "../../../web/release-flags";

let shown: TreeDoc | null = null;
/** 画面に出ている木を知らせる (tree-frame の setSigShown から) */
export const setFlowShown = (d: TreeDoc): void => { shown = d; };

let memo = new Map<string, { d: TreeDoc; dep: unknown; v: unknown }>(), clearing = false;
/**
 * name ごとに 1 つ覚える。d が画面の木で、dep (開いた続きの印など、木のほかに効く物) が同じなら前の答え。
 * 返す物は呼ぶ側で書き換えない (書き換える所は写してから)
 */
export function flowOnce<T>(name: string, d: TreeDoc, dep: unknown, make: () => T): T {
  if (d !== shown || !flag("drawOnce")) return make();
  const had = memo.get(name);
  if (had && had.d === d && had.dep === dep) return had.v as T;
  const v = make();
  memo.set(name, { d, dep, v });
  if (!clearing) { clearing = true; queueMicrotask(() => { memo = new Map(); clearing = false; }); }
  return v;
}
/** 箱の深さ (始まりから何段) を同じ流れの中で覚える */
export function flowDepth(d: TreeDoc, id: string): number {
  const m = flowOnce("depth", d, null, () => new Map<string, number>());
  const had = m.get(id);
  if (had !== undefined) return had;
  let n = 0;
  for (let b = d.boxes[id]; b?.parent && n < 1000; b = d.boxes[b.parent]) n++;
  m.set(id, n);
  return n;
}
