/**
 * tree-front-path.ts — 一番進んだ箱までの道 (S-22g、スイッチ pathLeftCol)。
 * 完成・最終チェックの並べ直し (S-142k の tidyView) の瞬間の道を並べの控え (KeptOrder) に凍らせ、並べ (tree-place・tree-place-wide) と描く親 (tree-strip-fold の homesOf) が使う。
 * 組んでいる間は凍らせ直さない (11-16 オーナー「完成品ボタン押した時と、最終チェク押した時それぞれ並び替えるか？　組み換えではなく並べ変え」)
 */
import type { TreeDoc } from "./tree-model";
import type { KeptOrder } from "./tree-place-order";
import { treeOrder } from "./tree-order";
import { flag } from "../../../web/release-flags";

/** 控えの中で凍らせた道を入れる鍵 (箱の id とは重ならない) */
export const FRONT_KEY = "\u0000front";

/**
 * (S-22g) 一番進んだ箱までの道 (始まりからその箱までの箱)。一番進んだ箱 = 完成の印の箱 (木の並びで前の物)、
 * 無ければ道の上の 当たりの数 − 狙いが消えたの数 が一番多い箱 (同じなら深い方 → 木の並びで前の方)。11-16 オーナー「斜めになるな左から順につくってみて」
 */
export function frontPath(d: TreeDoc): Set<string> {
  const order = treeOrder(d), memo = new Map<string, [number, number]>();
  /** [当たり − 狙いが消えた, 深さ] */
  const score = (id: string): [number, number] => {
    const had = memo.get(id);
    if (had) return had;
    memo.set(id, [0, 0]); // 輪の止め
    const b = d.boxes[id]!, p = b.parent && d.boxes[b.parent] ? score(b.parent) : ([0, -1] as [number, number]);
    const v: [number, number] = [p[0] + (b.out === "hit" ? 1 : b.out === "lost" ? -1 : 0), p[1] + 1];
    memo.set(id, v);
    return v;
  };
  const all = Object.values(d.boxes);
  const mains = all.filter((b) => b.done === "main").map((b) => b.id).sort(order);
  let best = mains[0];
  if (!best) {
    for (const b of all) {
      if (!best) { best = b.id; continue; }
      const s = score(b.id), t = score(best);
      if (s[0] > t[0] || (s[0] === t[0] && (s[1] > t[1] || (s[1] === t[1] && order(b.id, best) < 0)))) best = b.id;
    }
  }
  const path = new Set<string>();
  for (let x = best ? d.boxes[best] : undefined, n = 0; x && n < 500; x = x.parent ? d.boxes[x.parent] : undefined, n++) path.add(x.id);
  return path;
}

/** 並べ直しの瞬間 (tidyView) に今の道を控えへ凍らせる。控えを空にする (木を開いた時) と一緒に忘れる */
export function freezeFront(d: TreeDoc, kept: KeptOrder): void {
  if (flag("pathLeftCol")) kept.set(FRONT_KEY, [...frontPath(d)]);
}

/** 控えの中身に凍らせた道以外があるか (凍らせた道だけの控えは「空」= 開いた・並べ直しの時と同じに扱う) */
export const keptHasOrder = (kept: KeptOrder | undefined): boolean => !!kept && [...kept.keys()].some((k) => k !== FRONT_KEY);

/** その木を並べた時の凍らせた道 (描く親 homesOf が読む。木は手を置くたびに写し直されるので、並べるたびに置き直す) */
const shown = new WeakMap<TreeDoc, ReadonlySet<string>>();

/** 控えから凍らせた道を取り出し、その木の物として覚える (並べの頭で呼ぶ) */
export function takeFront(d: TreeDoc, kept: KeptOrder | undefined): ReadonlySet<string> | null {
  const l = flag("pathLeftCol") ? kept?.get(FRONT_KEY) : undefined;
  const s = l ? new Set(l.filter((id) => !!d.boxes[id])) : null;
  if (s?.size) shown.set(d, s); else shown.delete(d);
  return s?.size ? s : null;
}

/** その木の凍らせた道 (並べる前・凍らせていない時は null) */
export const frontOf = (d: TreeDoc): ReadonlySet<string> | null => shown.get(d) ?? null;
