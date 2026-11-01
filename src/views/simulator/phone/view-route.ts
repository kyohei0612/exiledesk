/**
 * view-route.ts — シミュのスマホの既定の画面の道 (S-94h、スイッチ phoneView。オーナー 11-01「3元素とかの絶対メインルートで付ける道みたいな奴はハズレ以外を全て表示させたらいいんじゃね
 * ハズレって言ったって色々あるけどメインルートでは外れもそのままルートとして通るでしょそれは絶対にいるルートなんだから」)。
 * 出すのは完成の箱までつながる箱全部 (名前が外れでも進む道なら出す)。出さないのは完成へ進まず前の段へ戻るだけの枝。枝は手の札のプルダウンで 1 本を選ぶ。木を読むだけ
 */
import type { TreeBox, TreeDoc } from "../../../services/simulator/tree/tree-model";
import { stepOf } from "../tree/tree-fail";
import { backTargetsOf } from "../tree/tree-merge";

/** 道の 1 段: 箱・その箱で打つ手 (枝が分かれる手は options = 各枝の箱、at = 選んだ枝)・もう出した箱へ合流 */
export type RouteStep = { kind: "box"; id: string } | { kind: "hand"; id: string; miss: boolean; options?: string[]; at?: number } | { kind: "join"; id: string };

const isDone = (b: TreeBox): boolean => !!b.done && b.done !== "fail";
/** 手の無い箱が同じ中身の箱へ移る先 (同じ段か後ろの段だけ。前の段へは戻るだけの枝) */
const onward = (d: TreeDoc, b: TreeBox): string[] => (b.back && !b.hand && !b.split ? backTargetsOf(d, b.id).filter((to) => stepOf(d, to) >= stepOf(d, b.id)) : []);
const nextOf = (d: TreeDoc, b: TreeBox): string[] => (isDone(b) ? [] : [...b.outs, ...onward(d, b)].filter((o) => !!d.boxes[o]));

/** 完成の箱までつながる箱 */
export function finishing(d: TreeDoc): Set<string> {
  const on = new Set(Object.values(d.boxes).filter(isDone).map((b) => b.id));
  for (let more = true; more;) {
    more = false;
    for (const b of Object.values(d.boxes)) if (!on.has(b.id) && nextOf(d, b).some((o) => on.has(o))) { on.add(b.id); more = true; }
  }
  return on;
}

/** 道を画面の段へ。picks = 手の箱ごとに選んだ枝 (無ければ先頭)。完成へ着かない木は null。同じ箱は 2 度出さず、2 度目は合流の 1 行 */
export function routeSteps(d: TreeDoc, picks: ReadonlyMap<string, number>): RouteStep[] | null {
  const on = finishing(d), seen = new Set<string>(), out: RouteStep[] = [];
  if (!on.has("start")) return null;
  const walk = (id: string): void => {
    const b = d.boxes[id]!;
    if (seen.has(id)) { out.push({ kind: "join", id }); return; }
    seen.add(id);
    const nexts = nextOf(d, b).filter((o) => on.has(o)), moves = !!onward(d, b).length;
    // 同じ中身の箱へ移るだけの箱は移った先だけ出す (同じ箱を 2 枚にしない)。品質だけの通り抜けは箱が無い
    if (b.out !== "pass" && !moves) out.push({ kind: "box", id });
    const at = nexts.length > 1 ? Math.min(picks.get(id) ?? 0, nexts.length - 1) : 0;
    if (b.hand || b.split) out.push({ kind: "hand", id, miss: b.outs.some((o) => !on.has(o)), ...(nexts.length > 1 ? { options: nexts, at } : {}) });
    if (nexts.length) walk(nexts[at]!);
  };
  walk("start");
  return out;
}
