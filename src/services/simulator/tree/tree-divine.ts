/**
 * tree-divine.ts — 神のオーブの手 = 狙いの MOD の目標の数値の以上 / 未満の 2 枝 (S-202、11-06 オーナー「神をもったら狙いMODの数値をいじれる様に」
 * 「神のリロールの確率はエンジンと同じく乱数で100人回したときそういう挙動して欲しい…その数値未満か以上かで枝を分けて」)。
 * 振り直しはエンジンの applyCurrency("divine") のまま。木の側は「目標に届いたか」で分けるだけ。
 * 予見リセット (ヒネコラの後の神、S-202 ⑤) も神 1 回の同じ 2 枝 (予見はエンジンの神で消える)。目標は道の手前の神で決めた値 (divineStart)。
 * 未満の箱は神の箱と同じ枠 (数値は枠に入れない) なので、ふつうの同じ枠の自動 ↩ で神の箱へ戻る (特別な線は作らない)
 */
import { allMods, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import { replaced, withValues } from "../../craft-stage/stage-core";
import { divineChance } from "../sim-engine";
import type { Hand, DivineTarget, TreeDoc } from "./tree-model";

export const DIVINE = "divine";
/** 神の目標の 2 枝の鍵 (箱の junkKey)。以上 = 打った後 (any)、未満 = 外れ (junk) = 自動の ↩ で神の箱へ (S-202 ④) */
export const DIVINE_GE = "dv:ge";
export const DIVINE_LT = "dv:lt";

/** 目標の数値を決めた神の手か */
export const isDivineAim = (h: Hand | null | undefined): boolean => !!h && h.currency === DIVINE && !!h.targets?.length;
const modOf = (item: StageItem, modId: string): StageMod | undefined => allMods(item).find((m) => m.modId === modId && !m.fractured);
/** 目標に全部届いたか (目標の MOD が無い目標は届かない) */
export function divineMet(item: StageItem, targets: readonly DivineTarget[]): boolean {
  return targets.every((t) => { const m = modOf(item, t.modId); return !!m && (m.values[t.vi] ?? -Infinity) >= t.value; });
}
/** 目標の MOD の数値を決めた値にした品 (ほかの値は段の下限 = S-202 ②)。文もエンジンの withValues で作り直す */
function withTargets(data: PatchData, item: StageItem, targets: readonly DivineTarget[], at: "target" | "low"): StageItem {
  let cur = item;
  for (const id of new Set(targets.map((t) => t.modId))) {
    const m = modOf(cur, id), mod = data.mods.get(id);
    if (!m || !mod) continue;
    const fixed = m.values.map((_, i) => { const t = targets.find((x) => x.modId === id && x.vi === i); return at === "target" && t ? t.value : m.ranges[i]?.[0] ?? m.values[i]!; });
    cur = replaced(cur, m, withValues(m, mod, () => 0, fixed));
  }
  return cur;
}
// 神 1 回で目標に届く割合はエンジンの divineChance (sim-engine、前はここに同じ数えの写し)
/**
 * 配置の枝 (tree-frame の outsOf): 代表の品に神を当てた 2 枝。以上の枝の代表は目標の値、未満の枝の代表は目標の MOD を下限 (S-202 ③)。
 * 神が打てない品 (振り直せる MOD が無い) は空
 */
export function divineBranches(data: PatchData, item: StageItem, h: Hand, applyOnce: (it: StageItem) => StageItem | null): Array<{ p: number; item: StageItem }> {
  const once = applyOnce(item);
  if (!once) return [];
  const ts = h.targets ?? [];
  const p = divineChance(data, item, ts);
  const out: Array<{ p: number; item: StageItem }> = [];
  if (p > 0) out.push({ p, item: withTargets(data, once, ts, "target") });
  if (p < 1) out.push({ p: 1 - p, item: withTargets(data, once, ts, "low") });
  return out;
}
/** 起こりうる結果の箱 (手を置く時の possibleOutsOf と同じ形) */
export function divineOuts(data: PatchData, item: StageItem, h: Hand): Array<{ out: "any" | "junk"; aim: null; junkKey: string }> {
  const p = divineChance(data, item, h.targets ?? []);
  return [...(p > 0 ? [{ out: "any" as const, aim: null, junkKey: DIVINE_GE }] : []), ...(p < 1 ? [{ out: "junk" as const, aim: null, junkKey: DIVINE_LT }] : [])];
}
/** 回した結果の分け (tree-outcome の boxOutcomeOf): 届いたら以上、届かなければ未満 */
export function divineOutcome(after: StageItem, h: Hand): { out: "any" | "junk"; hits: []; junkKey: string } {
  return divineMet(after, h.targets ?? []) ? { out: "any", hits: [], junkKey: DIVINE_GE } : { out: "junk", hits: [], junkKey: DIVINE_LT };
}
/**
 * 目標の欄の始まりの値 (S-202 ②⑤): 道の手前の神で決めた目標 (その神の以上の枝を通った時) があればその値、無ければ段の下限。
 * 予見リセットの目標もこの値 (今出ている数値ではない、11-06 オーナー)
 */
export function divineStart(doc: TreeDoc, boxId: string, item: StageItem, t: Pick<DivineTarget, "modId" | "vi">): number | null {
  for (let cur = doc.boxes[boxId]; cur?.parent; cur = doc.boxes[cur.parent]) {
    const p = doc.boxes[cur.parent], hit = cur.junkKey === DIVINE_GE && isDivineAim(p?.hand) ? p!.hand!.targets!.find((x) => x.modId === t.modId && x.vi === t.vi) : undefined;
    if (hit) { const r = divineRange(item, t); return r ? Math.min(r[1], Math.max(r[0], hit.value)) : hit.value; }
  }
  return divineRange(item, t)?.[0] ?? null;
}
/** 目標の欄の幅 (段の最小〜最大) */
export function divineRange(item: StageItem, t: Pick<DivineTarget, "modId" | "vi">): [number, number] | null {
  const r = modOf(item, t.modId)?.ranges[t.vi];
  return r ? [Math.min(r[0]!, r[1]!), Math.max(r[0]!, r[1]!)] : null;
}
