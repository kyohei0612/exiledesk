/**
 * 兄弟の箱の並べ順 (S-142e、スイッチ treeDoneLeft、開発版だけ。11-11 オーナー「まぁAだな　てかAのはず」)。
 * 完成の箱を下に持つ枝を左端 → 下に手が続く枝 (下の箱の多い順) → 下に何も無い箱 (矢印で戻るだけ・止まり) を右。
 * 同じ組の中は今までの結果の順 (S-142d) のまま。決めるのは並べ方 (tree-place) の兄弟の順だけで、箱と線のつながりは変えない
 */
import type { TreeDoc } from "./tree-model";

export function doneLeftOrder(d: TreeDoc): (kids: string[]) => string[] {
  const done = new Map<string, boolean>(), size = new Map<string, number>();
  const outsOf = (id: string): string[] => (d.boxes[id]?.outs ?? []).filter((o) => !!d.boxes[o]);
  const hasDone = (id: string): boolean => { let v = done.get(id); if (v === undefined) { v = !!d.boxes[id]?.done || outsOf(id).some(hasDone); done.set(id, v); } return v; };
  const sizeOf = (id: string): number => { let v = size.get(id); if (v === undefined) { v = 1 + outsOf(id).reduce((n, o) => n + sizeOf(o), 0); size.set(id, v); } return v; };
  const leaf = (id: string): number => (outsOf(id).length ? 0 : 1);
  return (kids) => kids.map((o, i) => ({ o, i })).sort((x, y) => (Number(hasDone(y.o)) - Number(hasDone(x.o))) || (leaf(x.o) - leaf(y.o)) || (sizeOf(y.o) - sizeOf(x.o)) || (x.i - y.i)).map((x) => x.o);
}
