/**
 * tree-odds.ts — 結果の箱に起こる割合 (2026-10-25 オーナー「おすすめの2つで進めて」、PC の箱とスマホの ② で同じ)。
 * 割合はシミュで数えず、エンジンの入口 outcomeOdds (engine-sim、ジン部長 695f76c3) に手の箱のアイテム (sampleOf の 1 人目)・手 (お告げ込み)・木の狙いを渡すだけ。
 * ここでするのは結果の種類 → 木の結果の箱の結び付けだけ: 当たりは同じ狙いの当たりの箱、当たりの箱の無い狙いが付いた分は外れの箱 (tree-hand-plan の onlyOf と同じ)。
 * 割合が出せない手 (繰り返し・狙い無し・エンジンが null・結果の箱が 1 つ) は出さない
 */
import { computed, type Ref } from "vue";
import { outcomeOdds } from "../../../services/simulator/sim-engine";
import { prepFor } from "../../../services/simulator/tree/tree-unbounded";
import { aimsOf, sampleOf } from "../../../services/simulator/tree/tree-sample";
import { engineOmens } from "../../../services/simulator/tree/tree-hands";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { craftStage as s } from "../../../state/craft-stage";
import { useTree } from "./use-tree";

/** 手のある箱 1 つ分: 結果の箱の id → 割合 (0〜1)。出せなければ null */
export function oddsOfHand(doc: TreeDoc, id: string): Map<string, number> | null {
  const data = s.data.value, b = doc.boxes[id];
  if (!data || !b?.hand || b.hand.repeat || b.hand.free || b.outs.length < 2) return null;
  const kids = b.outs.map((o) => doc.boxes[o]!).filter(Boolean);
  const hits = kids.filter((k) => k.out === "hit" && k.aim).map((k) => k.aim!);
  const aims = [...hits, ...aimsOf(doc).filter((a) => !hits.some((h) => h.modId === a.modId && h.tier === a.tier))];
  const odds = outcomeOdds(data, prepFor(data, sampleOf(data, doc, id, 1).item, b.hand.currency), b.hand.currency, engineOmens(b.hand), aims, { sameText: true });
  if (!odds) return null;
  const out = new Map<string, number>();
  for (const o of odds) {
    const hit = o.out === "hit" && o.aim ? kids.find((k) => k.out === "hit" && k.aim?.modId === o.aim!.modId && k.aim.tier === o.aim!.tier) : undefined;
    // 当たりの箱の無い狙いが付いた = 外れの箱
    const to = hit ?? kids.find((k) => k.out === (o.out === "hit" ? "junk" : o.out));
    if (to) out.set(to.id, (out.get(to.id) ?? 0) + o.p);
  }
  return out.size ? out : null;
}
/** 木全体: 結果の箱の id → 割合 (手の箱ごとに oddsOfHand。木が替わった時だけ数え直す) */
function treeOddsOf(doc: Ref<TreeDoc>) {
  return computed((): Map<string, number> => {
    const all = new Map<string, number>();
    for (const b of Object.values(doc.value.boxes)) {
      if (!b.hand) continue;
      try { for (const [k, v] of oddsOfHand(doc.value, b.id) ?? []) all.set(k, v); } catch { /* 割合が出せない手は出さない */ }
    }
    return all;
  });
}
let shared: ReturnType<typeof treeOddsOf> | null = null;
/** 今の木の割合 (箱・スマホの行が読む。木 1 つ分を 1 か所で数える) */
export function useTreeOdds(): ReturnType<typeof treeOddsOf> {
  return (shared ??= treeOddsOf(useTree().doc));
}
/** 割合の文 (1% 未満は「<1%」) */
export const pctText = (p: number): string => (p < 0.01 ? "<1%" : p >= 0.995 ? "100%" : `${Math.round(p * 100)}%`);
