/**
 * tree-odds.ts — 結果の箱に起こる割合 (2026-10-25 オーナー「おすすめの2つで進めて」、PC の箱とスマホの ② で同じ)。
 * 割合はシミュで数えず、エンジンの入口 outcomeOdds (engine-sim、ジン部長 695f76c3) に手の箱のアイテム (箱の形に合う見本 shapeSampleOf。形違いの戻りで入った人では出さない)・手 (お告げ込み)・木の狙いを渡すだけ。
 * ここでするのは結果の種類 → 木の結果の箱の結び付けだけ: 当たりは同じ狙いの当たりの箱、当たりの箱の無い狙いが付いた分は外れの箱 (tree-hand-plan の onlyOf と同じ)。
 * 割合が出せない手 (繰り返し・狙い無し・エンジンが null・結果の箱が 1 つ) は出さない
 */
import { computed, type Ref } from "vue";
import { outcomeOdds, stepOutcomes } from "../../../services/simulator/sim-engine";
import { boxOutcomeOf } from "../../../services/simulator/tree/tree-outcome";
import { outBoxOf } from "../../../services/simulator/tree/tree-shape";
import { isSideKey, isStripKey } from "../../../services/simulator/tree/tree-junk-side";
import { isWhittleHand, rankVariants } from "../../../services/simulator/tree/tree-whittle";
import { prepFor } from "../../../services/simulator/tree/tree-unbounded";
import { aimsOf, SINGLE_SEEDS } from "../../../services/simulator/tree/tree-sample";
import { aimedOfSample, sampleAimed } from "../../../services/simulator/tree/tree-judge";
import { flag } from "../../../web/release-flags";
import { shapeSampleOf } from "../../../services/simulator/tree/tree-sample-shape";
import { engineOmens } from "../../../services/simulator/tree/tree-hands";
import { boxAims, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { craftStage as s } from "../../../state/craft-stage";
import { useTree } from "./use-tree";

/** 手のある箱 1 つ分: 結果の箱の id → 割合 (0〜1)。出せなければ null */
export function oddsOfHand(doc: TreeDoc, id: string): Map<string, number> | null {
  const data = s.data.value, b = doc.boxes[id];
  if (!data || !b?.hand || b.hand.repeat || b.outs.length < 2) return null;
  const kids = b.outs.map((o) => doc.boxes[o]!).filter(Boolean);
  // 側で分けた箱 (S-65、スイッチ junkSide。狙い無しの打った後も) は、エンジンの枝ごとに回す時と同じ分け方で箱へ
  // 削減の手 (S-65b、スイッチ whittleRank) も同じ形で、外れの MOD レベルの範囲ごとの見本の重みを掛ける
  if (kids.some((k) => isSideKey(k.junkKey) || isStripKey(k.junkKey)) || isWhittleHand(b.hand)) return sideOdds(doc, id);
  if (b.hand.free) return null;
  const hits = kids.filter((k) => k.out === "hit" && k.aim).flatMap((k) => boxAims(k));
  const aims = [...hits, ...aimsOf(doc).filter((a) => !hits.some((h) => h.modId === a.modId && h.tier === a.tier))];
  const odds = outcomeOdds(data, prepFor(data, shapeSampleOf(data, doc, id), b.hand.currency), b.hand.currency, engineOmens(b.hand), aims, { sameText: true });
  if (!odds) return null;
  const out = new Map<string, number>();
  for (const o of odds) {
    // 「どれか」の当たりの箱 (anyOf) は一覧のどれかの割合を足す (10-26)
    const hit = o.out === "hit" && o.aim ? kids.find((k) => k.out === "hit" && boxAims(k).some((a) => a.modId === o.aim!.modId && a.tier === o.aim!.tier)) : undefined;
    // 当たりの箱の無い狙いが付いた = 外れの箱
    const kind = o.out === "hit" ? "junk" : o.out;
    const to = hit ?? kids.find((k) => k.out === kind || !!k.mergedOuts?.includes(kind));
    if (to) out.set(to.id, (out.get(to.id) ?? 0) + o.p);
  }
  return out.size ? out : null;
}
/** 側で分けた箱のある手の割合: エンジンの stepOutcomes の枝 (void を除いて割り直す) を、回す時と同じ boxOutcomeOf → outBoxOf で結果の箱へ */
function sideOdds(doc: TreeDoc, id: string): Map<string, number> | null {
  const data = s.data.value, b = doc.boxes[id];
  if (!data || !b?.hand) return null;
  const raw = shapeSampleOf(data, doc, id), item0 = prepFor(data, raw, b.hand.currency);
  const aims = aimsOf(doc), out = new Map<string, number>();
  // スイッチ judgeOne: 回す・精査と同じく、見本の ☑ で付いた狙いを渡す (渡さないと付いていて ☑ の無い完成形の MOD も狙いに数え、洗い出しの箱とずれた)
  if (flag("judgeOne")) for (let k = 1; k <= SINGLE_SEEDS; k++) sampleAimed(data, doc, id, k);
  const aimed = flag("judgeOne") ? aimedOfSample(id, raw) : null;
  // 削減の手は外れを MOD レベルの範囲ごとの代わりに差し替えた見本 (割合 = その範囲の重み、tree-whittle)。ほかは見本 1 つ
  const forms = isWhittleHand(b.hand) ? rankVariants(data, item0, aims, b.junkKey) : [{ p: 1, item: item0 }];
  for (const f of forms) {
    const live = (stepOutcomes(data, f.item, b.hand.currency, engineOmens(b.hand)) ?? []).filter((r) => !r.void);
    const total = live.reduce((n, r) => n + r.p, 0);
    if (!live.length || total <= 0) continue;
    for (const r of live) {
      const to = outBoxOf(doc, b, boxOutcomeOf(data, doc, b, f.item, r.item, aims, aimed), r.item);
      if (to) out.set(to, (out.get(to) ?? 0) + (f.p * r.p) / total);
    }
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
