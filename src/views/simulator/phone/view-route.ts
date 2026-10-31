/**
 * view-route.ts — シミュのスマホの既定の画面の道 (S-94h、スイッチ phoneView。オーナー 11-01「3元素とかの絶対メインルートで付ける道みたいな奴はハズレ以外を全て表示させたらいいんじゃね
 * ハズレって言ったって色々あるけどメインルートでは外れもそのままルートとして通るでしょそれは絶対にいるルートなんだから」)。
 * 出すのは完成の箱までつながる箱全部 (名前が外れでも進む道なら出す)。出さないのは完成へ進まず前の段へ戻るだけの枝。枝は全部を上から順に並べる。木を読むだけ
 */
import type { TreeBox, TreeDoc } from "../../../services/simulator/tree/tree-model";
import { qualityLabelOf } from "../../../services/htc/quality";
import type { StageItem } from "../../../services/craft-stage/engine";
import { stepOf } from "../tree/tree-fail";
import { backTargetsOf } from "../tree/tree-merge";

/** 道の 1 段: 箱・その箱で打つ手・枝の見出し (no = 「1-2」のような番号)・もう出した箱へ合流 */
export type RouteStep = { kind: "box"; id: string } | { kind: "hand"; id: string; miss: boolean } | { kind: "branch"; id: string; no: string } | { kind: "join"; id: string };

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

/** 道を画面の段へ。完成へ着かない木は null。同じ箱は 2 度出さず、2 度目は合流の 1 行 */
export function routeSteps(d: TreeDoc): RouteStep[] | null {
  const on = finishing(d), seen = new Set<string>(), out: RouteStep[] = [];
  if (!on.has("start")) return null;
  const walk = (id: string, no: string): void => {
    const b = d.boxes[id]!;
    if (seen.has(id)) { out.push({ kind: "join", id }); return; }
    seen.add(id);
    const nexts = nextOf(d, b).filter((o) => on.has(o)), moves = !!onward(d, b).length;
    // 同じ中身の箱へ移るだけの箱は移った先だけ出す (同じ箱を 2 枚にしない)。品質だけの通り抜けは箱が無い
    if (b.out !== "pass" && !moves) out.push({ kind: "box", id });
    if (b.hand || b.split) out.push({ kind: "hand", id, miss: b.outs.some((o) => !on.has(o)) });
    if (nexts.length === 1) walk(nexts[0]!, no);
    else nexts.forEach((to, i) => { const n = no ? `${no}-${i + 1}` : `${i + 1}`; out.push({ kind: "branch", id: to, no: n }); walk(to, n); });
  };
  walk("start", "");
  return out;
}

/** 箱の見本の品質の文 (PC の箱のカードに無い行、オーナー 11-01「あと品質もかかれてないかな」) */
export const qualityLines = (it: StageItem | null): string[] => (!it ? [] : [...(it.quality > 0 ? [`${qualityLabelOf(it.catalystQuality ? null : it.qualityTag)} +${it.quality}%`] : []), ...((it.catalystQuality ?? 0) > 0 ? [`${qualityLabelOf(it.qualityTag)} +${it.catalystQuality}%`] : [])]);
