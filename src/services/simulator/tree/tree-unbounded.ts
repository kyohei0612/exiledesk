/**
 * tree-unbounded.ts — ツリーで打つ時の「規格外」(2026-10-26 オーナー「ルーン嵌めるタイミングは2個目のクラフトモッド使う時や特殊ルーンをツリーで選んだ時に自動で付けるような形にしようか」)。
 * 打つ前のアイテムを整えるのは sim-engine の unboundedBefore (ルーンの手は空きソケットを足す、クラフト MOD が上限ならアストリッドの創造性を先に嵌める)。
 * 打つ (playHand)・打てるか (handProblem)・結果の箱の洗い出しと割合 (stepOutcomes・outcomeOdds・heldOdds) で同じ形を使う。
 * その手より前には効かない。一度嵌まったルーンはアイテムに残るので、戻りの道でまた来ても嵌まったまま (同じルーンの手は打たずに通す、費用も数えない)。
 * ほかの「打たずに通す」回し方だけの扱い (10-25) もここ (tree-sample から分けた、500 行を超えた)
 */
import { kindOf, mulberry32, room, RUNE_PREFIX, type PatchData, type StageItem } from "../../craft-stage/engine";
import { unboundedBefore } from "../sim-engine";
import { aimHeldOn } from "./tree-aim";
import { boxAims, type Hand, type TreeBox, type TreeDoc } from "./tree-model";

/** その手 (カレンシーの key) を打つ前のアイテム。要らなければそのまま */
export const prepFor = (data: PatchData, item: StageItem, key: string): StageItem => unboundedBefore(data, item, key, mulberry32(1));
/** ルーンの手で、そのルーンがもう嵌まっている (打たずに通す) */
export const runeHeld = (item: StageItem, h: Hand): boolean => h.currency.startsWith(RUNE_PREFIX) && (item.augments ?? []).some((a) => `${RUNE_PREFIX}${a.en}` === h.currency);
/** 打つ前に自動で嵌めたルーンの key (アストリッドの創造性。費用と箱の印) */
export const autoRuneKeys = (before: StageItem, after: StageItem): string[] =>
  (after.augments ?? []).filter((a) => !(before.augments ?? []).some((b) => b.en === a.en)).map((a) => `${RUNE_PREFIX}${a.en}`);

/**
 * 回し方だけの扱い (10-25 オーナー・ブラック、木の形は変えない。木の「自動の完成」= 完成の箱を作って先を止める、とは別物でそちらは取りやめのまま):
 * goalsHeld = 完成の狙いが全部そろった人は、どの箱に着いてもその場で完成として数える (100 人回し・テストラン・精査)。
 * heldHitOf = 手が打てない時、その手の当たりの箱の狙いがもう付いていれば打たずにその箱へ進む (合金の負けで冒涜のキャストを持ったまま戻った人など)
 */
/**
 * 完成形の品質が足りているか (「品質も狙う」☑ の時だけ見る。値で見て、ブリーチの MOD の有無では見ない。
 * 10-27 夕オーナー「一度付けた品質は消えない」「オフなら品質は見ない」、スイッチ goalQuality)
 */
export const qualityOk = (doc: TreeDoc, item: StageItem): boolean => !(doc.goalQualityOn && doc.goalQuality && (item.quality ?? 0) < doc.goalQuality);
export function goalsHeld(data: PatchData, doc: TreeDoc, item: StageItem): boolean {
  if (!qualityOk(doc, item)) return false;
  const goals = (doc.memoAims ?? []).filter((a) => !(a.forQuality));
  return !!goals.length && goals.every((a) => aimHeldOn(data, item, a, { sameText: true }));
}
export function heldHitOf(data: PatchData, doc: TreeDoc, b: TreeBox, item: StageItem): string | null {
  return b.outs.find((id) => { const o = doc.boxes[id]; return o?.out === "hit" && !!o.aim && boxAims(o).some((a) => aimHeldOn(data, item, a, { sameText: true })); }) ?? null;
}
/** 狙い無しの埋めるだけの高貴で、もう両側満杯 (打たずに通す。playHand・handProblem) */
const fillDone = (item: StageItem, h: Hand): boolean => !!h.free && kindOf(h.currency) === "exalt" && !room(item, "prefix") && !room(item, "suffix");
/** 打たずに通す手 (埋めるだけの高貴が満杯・もう嵌まっているルーン) */
export const passThrough = (item: StageItem, h: Hand): boolean => fillDone(item, h) || runeHeld(item, h);
