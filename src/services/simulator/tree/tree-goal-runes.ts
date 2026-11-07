/**
 * tree-goal-runes.ts — 完成形のルーンはスタートから付いている (S-31h、11-07 オーナー「プリズム打とうとしたところは絶対にアストリッドのはず」)。
 * 完成形のルーン = 自動で要るルーン (ルーンの MOD の狙いのルーン・2 つ目のクラフト MOD のアストリッド、エンジンの requiredRunes) + 使用ルーン (S-31g)。
 * 完成形のカードと同じ順 (自動の物 → 使用ルーン) でスタートの品に嵌める (嵌め方はエンジンの入口 socketGoalRunes)。
 * 保存の木にある完成形のルーンの手は無い物として読む: その手の結果の箱の決めを、その手の箱へ詰める (道の札を 1 段縮める)
 */
import type { PatchData, StageItem } from "../../craft-stage/engine";
import { GOAL_RUNE_MAX, requiredRunes, socketGoalRunes } from "../../simulator/sim-engine";
import type { TreeDoc } from "./tree-model";
import type { RecipePick } from "./tree-recipe-v1";

const RUNE = "rune:";
const memo = new Map<string, readonly string[]>();
/** 木の完成形のルーン (英語名、嵌める順) */
export function treeRunesOf(data: PatchData, doc: TreeDoc): readonly string[] {
  const aims = (doc.memoAims ?? []).map((a) => ({ modId: a.modId, tier: a.tier }));
  const key = JSON.stringify([doc.base, doc.itemLevel, aims, doc.goalRunes ?? []]);
  const hit = memo.get(key);
  if (hit) return hit;
  const auto = doc.base ? requiredRunes(data, doc.base, doc.itemLevel, aims).map((r) => r.en) : [];
  const list = [...new Set([...auto, ...(doc.goalRunes ?? [])])].slice(0, GOAL_RUNE_MAX);
  if (memo.size >= 256) memo.clear();
  memo.set(key, list);
  return list;
}
/** スタートの品に完成形のルーンを嵌めた形 */
export function withTreeRunes(data: PatchData, doc: TreeDoc, item: StageItem, rng: () => number): StageItem {
  const runes = treeRunesOf(data, doc);
  return runes.length ? socketGoalRunes(data, item, runes, rng) : item;
}
/** 完成形のルーンを嵌める手か (ソケットの番号付き `rune:名前@n` も) */
export const isGoalRuneHand = (currency: string, runes: readonly string[]): boolean =>
  currency.startsWith(RUNE) && runes.includes(currency.slice(RUNE.length).replace(/@\d+$/, ""));

/**
 * 保存の打ち方から完成形のルーンの手を抜く (S-31h)。ルーンの手の結果は 1 箱 (S-31e) なので、その箱の札の段 (`any[…]` など) を道から外し、
 * 結果の箱の決めをルーンの手の箱へ詰める。下の札・人の ↩ の行き先・例のアイテムの札も同じく 1 段縮める。結果の札が 2 つ以上ある手は触らない
 */
export function dropGoalRuneHands(picks: readonly RecipePick[], examples: Record<string, unknown> | undefined, runes: readonly string[]): RecipePick[] {
  let list = [...picks];
  if (!runes.length) return list;
  const kept = new Set<string>();
  for (;;) {
    const p = list.find((x) => !kept.has(x.at) && x.hand && isGoalRuneHand(x.hand.currency, runes));
    if (!p) return list;
    const head = `${p.at}/`;
    const segs = new Set([...list.map((x) => x.at), ...Object.keys(examples ?? {})].filter((at) => at.startsWith(head)).map((at) => at.slice(head.length).split("/")[0]!));
    if (segs.size > 1) { kept.add(p.at); continue; }
    const seg = [...segs][0], from = seg ? `${head}${seg}` : null;
    const move = (at: string): string => (from && (at === from || at.startsWith(`${from}/`)) ? p.at + at.slice(from.length) : at);
    const child = from ? list.find((x) => x.at === from) : undefined;
    const { hand: _h, aims: _a, pre: _p, ...rest } = p;
    const merged: RecipePick | null = child ? { ...child, at: p.at, ...(p.note && !child.note ? { note: p.note } : {}) }
      : rest.done || rest.back || rest.note || rest.unwanted || rest.noAutoBack ? rest : null;
    list = list.flatMap((x): RecipePick[] => {
      if (x === p) return merged ? [merged] : [];
      if (x === child) return [];
      return [{ ...x, at: move(x.at), ...(x.back ? { back: move(x.back) } : {}) }];
    });
    // ルーンの手の箱の例 (ルーンの無い品) は捨て、結果の箱の例をその札へ
    if (examples) {
      const next = Object.fromEntries(Object.entries(examples).filter(([k]) => k !== p.at).map(([k, v]) => [move(k), v]));
      for (const k of Object.keys(examples)) delete examples[k];
      Object.assign(examples, next);
    }
  }
}
