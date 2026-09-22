/**
 * route-steps.ts — 「で、実際どう動くのか」(2026-09-23)
 *
 * オーナー指示:「実際さっきのスタッフ入力したら何分でどんな動きしてどうなるのか最後まで見たい」
 * 「先に忍者コピーから流れ仕上げようか」。
 *
 * ## 方策は一本道ではない
 * MDP が返すのは「**どの状態で何を打つか**」の表で、順番の決まった手順書ではありません。
 * 外した時に何を打つかも全部入っているので、そのまま出すと数百行の地図になります。
 *
 * ## だから「うまく行った時の並び」を 1 本抜く
 * 開始から、**当たりの枝を辿って**ゴールまで歩きます。各段に「その手」と「そこで当たる確率」が
 * 付くので、ゲームを開いたまま上から順に打てます。**外した時にどうするか**も同じ表から引けるので、
 * 段ごとに 1 行だけ添えます (それ以上は地図になるので出しません)。
 *
 * **ここに出る確率を掛け算しないでください。**外しても打ち直せる手が多く、実際の総回数は
 * 期待費用のほうが正しい答えです。この並びは「何を、どの順で、どれくらいの当たりで打つか」を
 * 見るためのものです。
 */
import { labelOfAction } from "./labels";
import { routeFrom } from "../../vendor/poe2htc/optimizer/markovRoute";
import type { PolicyEdge, PolicyNode, RouteTable } from "../../vendor/poe2htc/optimizer/markovRoute";
import type { ItemBase } from "../../vendor/poe2htc/engine/types";

/** 手順 1 段 */
export interface RouteStep {
  /** 1 から */
  no: number;
  /** 「カタリストを 14 個 (品質 20%) → 高貴なオーブ + 触媒の高貴のお告げ」 */
  text: string;
  /** その手が当たる確率 (0-1)。当たり = 目標に 1 歩近づく枝 */
  prob: number;
  /** その手 1 回の値段 (高貴建て) */
  cost: number;
  /** ここから完成までの期待費用 (高貴建て)。段を追うごとに減る */
  remaining: number;
  /** 埋まっている目標の数 */
  filled: number;
  /** 外した時に方策が打つ手 (無ければ null) */
  onMiss: string | null;
}

export interface RouteWalk {
  steps: RouteStep[];
  /** ゴールまで辿り着けたか。届かずに打ち切った時は false */
  reachedGoal: boolean;
  /** 打ち切った理由 (届いた時は null) */
  stoppedWhy: string | null;
}

/** 地図にならないための上限。これを超える craft は「並び」で説明する物ではない */
const MAX_STEPS = 40;

/**
 * 当たりの枝を辿って手順を 1 本抜く。
 *
 * 当たり = `regress` でない枝のうち、**目標に近づく** (`depth` が減る) もの。同じ深さに留まる枝
 * (下位ティアを引いた等) は当たり扱いにしません ── 当たったことにすると、確率だけ高くて
 * 進まない並びが出ます。
 */
export function routeSteps(table: RouteTable, cls?: ItemBase): RouteWalk {
  const { nodes, edges } = routeFrom(table, table.restartIdx);
  const byKey = new Map<string, PolicyNode>(nodes.map((n) => [n.key, n]));
  const out = new Map<string, PolicyEdge[]>();
  for (const e of edges) {
    const list = out.get(e.from);
    if (list) list.push(e);
    else out.set(e.from, [e]);
  }

  const start = nodes.find((n) => n.isStart);
  if (!start) return { steps: [], reachedGoal: false, stoppedWhy: "開始の状態が見つかりません" };

  const steps: RouteStep[] = [];
  const seen = new Set<string>();
  let node = start;
  let stoppedWhy: string | null = null;

  while (!node.isGoal) {
    if (steps.length >= MAX_STEPS) { stoppedWhy = `${MAX_STEPS} 段で打ち切りました`; break; }
    if (seen.has(node.key)) { stoppedWhy = "同じ状態に戻ったので打ち切りました"; break; }
    seen.add(node.key);
    const action = node.action;
    if (!action) { stoppedWhy = "ここから先の手がありません"; break; }

    const outs = out.get(node.key) ?? [];
    // 当たり = 目標に近づく枝。同じ深さに留まる枝は当たりにしない
    const forward = outs
      .filter((e) => !e.regress && e.to !== node.key)
      .map((e) => ({ e, to: byKey.get(e.to) }))
      .filter((x): x is { e: PolicyEdge; to: PolicyNode } => !!x.to && x.to.depth < node.depth);
    const best = forward.sort((a, b) => b.e.prob - a.e.prob)[0];
    const missEdge = outs
      .filter((e) => !forward.some((f) => f.e === e))
      .sort((a, b) => b.prob - a.prob)[0];
    const missNode = missEdge ? byKey.get(missEdge.to) : undefined;

    steps.push({
      no: steps.length + 1,
      text: labelOfAction(action, cls).text,
      prob: best?.e.prob ?? 0,
      cost: node.actionCost ?? 0,
      remaining: node.expectedCost,
      filled: node.present.length,
      onMiss: missNode?.action ? labelOfAction(missNode.action, cls).text : null,
    });

    if (!best) { stoppedWhy = "目標に近づく結果がありません"; break; }
    node = best.to;
  }

  return { steps, reachedGoal: node.isGoal, stoppedWhy };
}
