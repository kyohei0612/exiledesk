/**
 * tree-ideal-first.ts — 完成を押すまで、組んでいる道の横の枝を灰色にする (S-142i、スイッチ treeIdealFirst)。
 * 11-13 オーナー「これ先理想形完成させてから動かした方が良いかな。完成を押すまで他の子枝グレーアウトで」「一旦その案で行ってみるか」。
 * 組んでいる道 = スタートから「手の付いた子が 1 つだけ」の間たどった箱。その道の箱の兄弟 (手の無い箱) とその下を灰色にする。
 * 道の先 (一番下の手の結果の箱) は全部押せる = どれに次の手を置くか選べる。置くとほかの兄弟が灰色になる。
 * 灰色にしない (null): 完成 (main) の印がある木・道の外に手がある木 (前に保存した木・人のレシピ、ブラック 95 の決め)。
 * 覚えておく物は無く、手の付き方だけで決まる (開き直しても同じ)
 */
import type { TreeDoc } from "./tree-model";
import { flag } from "../../../web/release-flags";

export interface IdealPath { /** 組んでいる道の箱 (スタートから一番下の手の箱まで。道の先の結果の箱は含まない) */ path: ReadonlySet<string>; /** 灰色の箱 */ gray: ReadonlySet<string> }

const memo = new WeakMap<TreeDoc, { key: string; v: IdealPath | null }>();

/** 組んでいる道と灰色の箱 (スイッチ treeIdealFirst が閉じている・灰色にしない木は null) */
export function idealPath(d: TreeDoc): IdealPath | null {
  if (!flag("treeIdealFirst") || !d.boxes.start) return null;
  // 木の形と手の付き方だけで決まるので、それを鍵にして同じ木では 1 回だけ数える (箱ごとに呼ばれる)
  const key = Object.values(d.boxes).map((b) => `${b.id}:${b.outs.join(",")}:${b.hand ? 1 : 0}${b.split?.length ? 1 : 0}${b.done ?? ""}`).join("|");
  const m = memo.get(d);
  if (m?.key === key) return m.v;
  const v = walk(d);
  memo.set(d, { key, v });
  return v;
}

function walk(d: TreeDoc): IdealPath | null {
  if (Object.values(d.boxes).some((b) => b.done === "main")) return null;
  const busy = (id: string): boolean => { const b = d.boxes[id]; return !!b && (!!b.hand || !!b.split?.length || !!b.done); };
  const path = new Set<string>(), gray = new Set<string>();
  for (let at: string | undefined = "start"; at; ) {
    const ks: string[] = (d.boxes[at]?.outs ?? []).filter((o) => !!d.boxes[o]);
    const on: string[] = ks.filter(busy);
    path.add(at);
    if (on.length > 1) return null;
    if (!on.length) break;
    for (const k of ks) if (k !== on[0]) gray.add(k);
    at = on[0];
  }
  // 道の外に手がある = 前の作り方の木 (灰色にしない)
  for (const b of Object.values(d.boxes)) if (busy(b.id) && !path.has(b.id)) return null;
  // 灰色の箱の下も灰色
  const down = (id: string): void => { for (const o of d.boxes[id]?.outs ?? []) if (d.boxes[o] && !gray.has(o)) { gray.add(o); down(o); } };
  for (const g of [...gray]) down(g);
  return { path, gray };
}

/** 箱が灰色か (組んでいる道の横の枝) */
export const idealGray = (d: TreeDoc, id: string): boolean => !!idealPath(d)?.gray.has(id);
