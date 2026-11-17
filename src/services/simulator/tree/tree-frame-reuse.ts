/**
 * tree-frame-reuse.ts — (S-196j、スイッチ frameReuse) 見本の配置 (tree-frame の frameTree) を作り直す時、前と同じ段は前の答えをそのまま使う。
 * 配置の 1 段 = 親の箱の代表の品から子の箱の代表を決める所。その答えは 親の代表の品・親と子と孫の箱・木全体の狙いの組 (と木の残りの設定) だけで決まるので、
 * それが前と同じ (親の代表は同じ物そのもの) なら、子の代表と、その段で足した ↩ で着く人の形・止まり・枠の混ざりを前のまま使う。
 * 手を置いた箱の下は親の代表が新しい物になるので作り直す。↩ で着く人の形を当てる後半 (extra) は今どおり木全体で回す。
 * 木全体の鍵が変われば全部捨てる。覚えは箱の id ごとで、親の代表と段の鍵で確かめるので、ほかの木 (タブ) と混ざっても答えは同じ
 */
import type { PatchData } from "../../craft-stage/engine";
import type { TreeBox, TreeDoc } from "./tree-model";
import type { Frame, FrameCant, FrameMiss } from "./tree-frame";

/** 段で足した物 (子の代表・↩ で着く人の形・止まり・行き先の無い結果・枠の混ざり) */
export interface FrameStep { f: Frame; sig: string; kids: Array<[string, Frame]>; extra: Array<{ at: string; f: Frame; from: string }>; miss: FrameMiss[]; cant: FrameCant[]; mixed: string[] }
interface Reuse { wide: string; start: Frame | null; steps: Map<string, FrameStep> }
const REUSE = new WeakMap<PatchData, Reuse>();

/** 木全体の鍵 wide の覚え (変わっていれば空から) */
export function reuseOf(data: PatchData, wide: string): Reuse {
  let r = REUSE.get(data);
  if (!r || r.wide !== wide) REUSE.set(data, (r = { wide, start: null, steps: new Map() }));
  return r;
}
/** 箱の鍵 (置き場・手の時刻・メモの文は入れない) */
const boxSig = (b: TreeBox | undefined): string => JSON.stringify(b ?? null, (k, v: unknown) => (k === "x" || k === "y" || k === "touched" || k === "note" || k === "doneNow" ? undefined : v));
/** 段の鍵 = 親の箱・子の箱・孫の箱 (子の手の結果の分け = splitOf が孫の箱を見る) */
export function stepSig(doc: TreeDoc, b: TreeBox, kids: readonly string[]): string {
  const out = [boxSig(b)];
  for (const k of kids) { const c = doc.boxes[k]; out.push(boxSig(c)); for (const g of c?.outs ?? []) out.push(boxSig(doc.boxes[g])); }
  return out.join("\n");
}
