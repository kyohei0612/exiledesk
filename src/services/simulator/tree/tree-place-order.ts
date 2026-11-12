/**
 * 兄弟の箱の並べ順 (S-142e、スイッチ treeDoneLeft、開発版だけ。11-11 オーナー「まぁAだな　てかAのはず」)。
 * 完成の箱を下に持つ枝 (理想形の道) を左端 → 未設定の箱 (人が決める箱) → 下に手が続く枝 (下の箱の多い順) → 下に何も無い箱 (矢印で戻るだけ・止まり) を右。
 * 理想形が一番左 = 11-11 オーナー「順番は理想形は前提左でおｋよたどっていったら絶対に左側みるだけで理想形見れるようにはしたいからね」。
 * 未設定を左 = 11-11 オーナー「基本未設定をその段の左側に入れて欲しい。そのカレンシーをうった挙動のあとのツリーで左側ね。横に他のカレンシーの枝があったらそれを通り超えてやれって話じゃなくてさ」
 * (同じ手の結果の兄弟の中だけ。隣の別の手の枝は越えない = ここは 1 つの親の子の並びしか決めない)。
 * 同じ組の中は今までの結果の順 (S-142d) のまま。決めるのは並べ方 (tree-place) の兄弟の順だけで、箱と線のつながりは変えない
 */
import { unsetBoxes } from "./tree-junk-tidy";
import type { TreeDoc } from "./tree-model";

/** 組んでいる間の兄弟の順の控え (S-142g): 親の箱 → 前に並べた時の子の順 (もう無い箱も場所取りに残す) */
export type KeptOrder = Map<string, string[]>;

/**
 * (S-142g) 組んでいる間は、もう並んでいる兄弟の横の順を入れ替えない。ideal = 今の決まりどおりの順 (S-142d・S-142e)。
 * 前に並べた兄弟は前の順のまま、新しい箱だけ ideal で 1 つ前に来る兄弟のすぐ右 (前が無ければ左端) に足す。
 * 控えが無い親 (開いた時・手を付けたばかり) は ideal のまま。控えを空にするのは木を開いた時だけ (use-row-settle)
 */
export function keepOrder(kept: KeptOrder, parent: string, ideal: string[]): string[] {
  const was = kept.get(parent);
  if (!was) { kept.set(parent, [...ideal]); return ideal; }
  const list = [...was], at = new Set(was);
  ideal.forEach((k, i) => {
    if (at.has(k)) return;
    let prev: string | undefined;
    for (let j = i - 1; j >= 0 && !prev; j--) if (at.has(ideal[j]!)) prev = ideal[j];
    list.splice(prev ? list.indexOf(prev) + 1 : 0, 0, k);
    at.add(k);
  });
  kept.set(parent, list);
  const now = new Set(ideal);
  return list.filter((k) => now.has(k));
}

export function doneLeftOrder(d: TreeDoc): (kids: string[]) => string[] {
  const done = new Map<string, boolean>(), size = new Map<string, number>();
  const unset = new Set(unsetBoxes(d));
  const outsOf = (id: string): string[] => (d.boxes[id]?.outs ?? []).filter((o) => !!d.boxes[o]);
  const hasDone = (id: string): boolean => { let v = done.get(id); if (v === undefined) { v = !!d.boxes[id]?.done || outsOf(id).some(hasDone); done.set(id, v); } return v; };
  const sizeOf = (id: string): number => { let v = size.get(id); if (v === undefined) { v = 1 + outsOf(id).reduce((n, o) => n + sizeOf(o), 0); size.set(id, v); } return v; };
  const leaf = (id: string): number => (outsOf(id).length ? 0 : 1);
  const open = (id: string): number => (unset.has(id) ? 0 : 1);
  return (kids) => kids.map((o, i) => ({ o, i })).sort((x, y) => (Number(hasDone(y.o)) - Number(hasDone(x.o))) || (open(x.o) - open(y.o)) || (leaf(x.o) - leaf(y.o)) || (sizeOf(y.o) - sizeOf(x.o)) || (x.i - y.i)).map((x) => x.o);
}
