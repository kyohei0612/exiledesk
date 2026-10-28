/**
 * tree-sample-shape.ts — 箱の形 (道で付いている狙いの組) に合う見本 (10-26 オーナー「その選択肢が出てくるのは前提狙いMODの状態でなんかする時やろ」)。
 * 起こりうる結果の箱 (tree-sample の possibleOutsOf) と結果の割合 (views の tree-odds) が、形違いの戻りで入った人のアイテムを使わないように。tree-sample.ts が 500 行を超えたので分けた
 */
import type { PatchData, StageItem } from "../../craft-stage/engine";
import { aimHeldOn } from "./tree-aim";
import { aimKey, type TreeDoc } from "./tree-model";
import { aimsOf, sampleOf, SINGLE_SEEDS, startGoalAims } from "./tree-sample";
import { heldSets } from "./tree-shape";

/** その箱の形 (道で付いている狙いの組 = heldSets) にアイテムが合うか。始めから付いている狙いは数えない */
export function shapeFit(data: PatchData, doc: TreeDoc, boxId: string): (item: StageItem) => boolean {
  const sets = new Set(heldSets(doc, boxId).map((h) => [...h].sort().join(",")));
  const st = startGoalAims(doc), shapeAims = aimsOf(doc).filter((a) => !st.some((x) => x.modId === a.modId && x.tier === a.tier));
  return (item) => sets.has(shapeAims.filter((a) => aimHeldOn(data, item, a, { sameText: true })).map(aimKey).sort().join(","));
}
/** 箱の形に合う見本 (着いた人の 1〜SINGLE_SEEDS 人目のうち最初。合う人がいなければ 1 人目)。結果の割合 (tree-odds) が使う
 *  (10-26: 形違いの戻りで入った人が 1 人目だと、その人のアイテムで割合を出し、キャストの箱のカオスに「狙いが消えた 99%」と出た) */
export function shapeSampleOf(data: PatchData, doc: TreeDoc, boxId: string): StageItem { return shapeSampleWithNote(data, doc, boxId).item; }
/** 見本と、合う見本が無かった時の印 (cant:unreachable = この道では作れない箱。見張りが箱の data-sample-note で見分ける、10-28 夜 最終チェック長) */
export function shapeSampleWithNote(data: PatchData, doc: TreeDoc, boxId: string): { item: StageItem; note: string | null } {
  const fits = shapeFit(data, doc, boxId);
  for (let seed = 1; seed <= SINGLE_SEEDS; seed++) {
    const x = sampleOf(data, doc, boxId, seed);
    if (x.note !== "none" && !x.note?.startsWith("cant:") && fits(x.item)) return { item: x.item, note: null };
  }
  const x = sampleOf(data, doc, boxId, 1);
  return { item: x.item, note: x.note ?? null };
}
