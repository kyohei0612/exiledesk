/**
 * tree-odds.ts — 結果の箱に起こる割合 (2026-10-25 オーナー「おすすめの2つで進めて」、PC の箱とスマホの ② で同じ)。
 * 割合はシミュで数えず、エンジンの入口 outcomeOdds (engine-sim、ジン部長 695f76c3) に手の箱のアイテム (箱に着く見本の人ごと peopleOf)・手 (お告げ込み)・木の狙いを渡すだけ。
 * ここでするのは結果の種類 → 木の結果の箱の結び付けだけ: 当たりは同じ狙いの当たりの箱、当たりの箱の無い狙いが付いた分は外れの箱 (tree-hand-plan の onlyOf と同じ)。
 * 割合が出せない手 (繰り返し・狙い無し・エンジンが null・結果の箱が 1 つ) は出さない
 */
import { computed, type Ref } from "vue";
import { outcomeOdds, stepOutcomes } from "../../../services/simulator/sim-engine";
import { boxOutcomeOf } from "../../../services/simulator/tree/tree-outcome";
import { outBoxOf } from "../../../services/simulator/tree/tree-shape";
import { isSideKey, isStripKey } from "../../../services/simulator/tree/tree-junk-side";
import { isWhittleHand } from "../../../services/simulator/tree/tree-whittle";
import { prepFor } from "../../../services/simulator/tree/tree-unbounded";
import { rolledOutcomes } from "../../../services/simulator/tree/tree-uncountable";
import { aimsOf, sampleOf, SINGLE_SEEDS } from "../../../services/simulator/tree/tree-sample";
import type { PatchData, StageItem } from "../../../services/craft-stage/engine";
import { docPartOf, itemKeyOf, tagOf } from "../../../services/simulator/tree/tree-sample-key";
import { aimedOfSample, sampleAimed } from "../../../services/simulator/tree/tree-judge";
import { flag } from "../../../web/release-flags";
import { shapeSampleOf } from "../../../services/simulator/tree/tree-sample-shape";
import { engineOmens } from "../../../services/simulator/tree/tree-hands";
import { boxAims, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { craftStage as s } from "../../../state/craft-stage";
import { useTree } from "./use-tree";

/** 手のある箱 1 つ分: 結果の箱の id → 割合 (0〜1)。出せなければ null */
export function oddsOfHand(doc: TreeDoc, id: string, part = ""): Map<string, number> | null {
  const data = s.data.value, b = doc.boxes[id];
  if (!data || !b?.hand || b.hand.repeat || b.outs.length < 2) return null;
  const kids = b.outs.map((o) => doc.boxes[o]!).filter(Boolean);
  // 側で分けた箱 (S-65、スイッチ junkSide。狙い無しの打った後も) は、エンジンの枝ごとに回す時と同じ分け方で箱へ
  // 削減の手 (S-65b、スイッチ whittleRank) も同じ形で、外れの MOD レベルの範囲ごとの見本の重みを掛ける
  if (kids.some((k) => isSideKey(k.junkKey) || isStripKey(k.junkKey)) || isWhittleHand(b.hand)) return sideOdds(doc, id, part);
  if (b.hand.free) return null;
  const hits = kids.filter((k) => k.out === "hit" && k.aim).flatMap((k) => boxAims(k));
  const aims = [...hits, ...aimsOf(doc).filter((a) => !hits.some((h) => h.modId === a.modId && h.tier === a.tier))];
  const out = new Map<string, number>();
  let shot = 0;
  for (const man of peopleOf(data, doc, id)) {
    const odds = outcomeOdds(data, prepFor(data, man.raw, b.hand.currency), b.hand.currency, engineOmens(b.hand), aims, { sameText: true });
    if (!odds) continue;
    shot += man.w;
    for (const o of odds) {
      // 「どれか」の当たりの箱 (anyOf) は一覧のどれかの割合を足す (10-26)
      const hit = o.out === "hit" && o.aim ? kids.find((k) => k.out === "hit" && boxAims(k).some((a) => a.modId === o.aim!.modId && a.tier === o.aim!.tier)) : undefined;
      // 当たりの箱の無い狙いが付いた = 外れの箱
      const kind = o.out === "hit" ? "junk" : o.out;
      const to = hit ?? kids.find((k) => k.out === kind || !!k.mergedOuts?.includes(kind));
      if (to) out.set(to.id, (out.get(to.id) ?? 0) + man.w * o.p);
    }
  }
  return out.size ? perShot(out, shot) : null;
}
/** 箱に着く人 (w = 割合、和 1) */
type Man = { raw: StageItem; aimed: ReadonlySet<string> | null; w: number };
/** 手の結果を打てた人の割合で割り直す (打てない人は打てる箱へ移る S-64 ので、割合に入れない) */
const perShot = (m: Map<string, number>, shot: number): Map<string, number> => { if (shot > 0) for (const [k, v] of m) m.set(k, v / shot); return m; };
/**
 * 割合を数える人 (S-65・S-65b): 箱に着く見本 SINGLE_SEEDS 人を同じ中身と ☑ でまとめ、人数の割合を持たせる。
 * 前は見本 1 つで決まり、ブリーチ持ちとランダムの外れの人が混ざる箱 (オーナーの木の b43) の結果が「打った後 100%」と出た。洗い出し possibleOutsOf と同じ人を見る。
 * 着いた見本が無ければ形に合う見本 1 つ
 */
function peopleOf(data: PatchData, doc: TreeDoc, id: string): Man[] {
  const seeds = SINGLE_SEEDS;
  if (flag("judgeOne")) for (let k = 1; k <= seeds; k++) sampleAimed(data, doc, id, k);
  const one = (raw: StageItem): Man[] => [{ raw, aimed: flag("judgeOne") ? aimedOfSample(id, raw) : null, w: 1 }];
  const by = new Map<string, Man>();
  for (let k = 1; k <= seeds; k++) {
    const x = sampleOf(data, doc, id, k);
    if (x.note === "none" || x.note?.startsWith("cant:")) continue;
    const aimed = flag("judgeOne") ? aimedOfSample(id, x.item) : null, key = `${itemKeyOf(x.item)}|${aimed ? [...aimed].sort().join() : ""}`, e = by.get(key);
    if (e) e.w++; else by.set(key, { raw: x.item, aimed, w: 1 });
  }
  const men = [...by.values()], n = men.reduce((t, m) => t + m.w, 0);
  return n ? men.map((m) => ({ ...m, w: m.w / n })) : one(shapeSampleOf(data, doc, id));
}
/** 側で分けた箱のある手の割合: エンジンの stepOutcomes の枝 (void を除いて割り直す) を、回す時と同じ boxOutcomeOf → outBoxOf で結果の箱へ */
/** 側で分けた手の割合の覚え (鍵 = 木の前提と狙い・見本・☑・手・結果の箱。木が替わるたびに全部の手でエンジンの枝を数えていた、S-71b、スイッチ treeLight) */
const sideMemo = new Map<string, Map<string, number> | null>();
const SIDE_MAX = 5000;
function sideOdds(doc: TreeDoc, id: string, part: string): Map<string, number> | null {
  const data = s.data.value, b = doc.boxes[id];
  if (!data || !b?.hand) return null;
  const aims = aimsOf(doc), out = new Map<string, number>();
  // スイッチ judgeOne: 回す・精査と同じく、見本の ☑ で付いた狙いを渡す (渡さないと付いていて ☑ の無い完成形の MOD も狙いに数え、洗い出しの箱とずれた)
  const men = peopleOf(data, doc, id);
  const key = part ? `${part}|${men.map((m) => `${itemKeyOf(m.raw)}|${m.aimed ? [...m.aimed].sort().join() : ""}|${m.w}`).join("&")}|${JSON.stringify([b.hand, b.junkKey, b.outs.map((o) => { const k = doc.boxes[o]; return k ? [o, ...tagOf(k)] : o; })])}` : null;
  if (key && sideMemo.has(key)) return sideMemo.get(key)!;
  let shot = 0;
  for (const man of men) {
    const item0 = prepFor(data, man.raw, b.hand.currency), aimed = man.aimed;
    // 削減の手も見本のまま (結果の箱は % を出さない、treeOddsOf)
    const forms = [{ p: 1, item: item0 }];
    for (const f of forms) {
      // 数え上げられない手は打って集めた結果の割合 (S-21)
      const live = (stepOutcomes(data, f.item, b.hand.currency, engineOmens(b.hand)) ?? rolledOutcomes(data, f.item, b.hand.currency, engineOmens(b.hand)) ?? []).filter((r) => !r.void);
      const total = live.reduce((n, r) => n + r.p, 0);
      if (!live.length || total <= 0) continue;
      shot += man.w * f.p;
      for (const r of live) {
        const to = outBoxOf(doc, b, boxOutcomeOf(data, doc, b, f.item, r.item, aims, aimed), r.item);
        if (to) out.set(to, (out.get(to) ?? 0) + (man.w * f.p * r.p) / total);
      }
    }
  }
  const res = out.size ? perShot(out, shot) : null;
  if (key) { if (sideMemo.size >= SIDE_MAX) sideMemo.clear(); sideMemo.set(key, res); }
  return res;
}
/** 木全体: 結果の箱の id → 割合 (手の箱ごとに oddsOfHand。木が替わった時だけ数え直す) */
function treeOddsOf(doc: Ref<TreeDoc>) {
  return computed((): Map<string, number> => {
    const all = new Map<string, number>(), part = flag("treeLight") ? docPartOf(doc.value) : "";
    for (const b of Object.values(doc.value.boxes)) {
      if (!b.hand) continue;
      // 削減の手の結果の箱は % を出さない (S-65b)。オーナー 11-01「削減だけ消す」
      if (isWhittleHand(b.hand)) continue;
      try { for (const [k, v] of oddsOfHand(doc.value, b.id, part) ?? []) all.set(k, v); } catch { /* 割合が出せない手は出さない */ }
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
