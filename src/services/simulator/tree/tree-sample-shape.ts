/**
 * tree-sample-shape.ts — 箱の見本 (着いた人の最初の 1 人)。tree-sample.ts が 500 行を超えたので分けた。
 * 前の箱の形 (道で付いている狙いの組) に合う見本を選ぶ shapeFit は使い手が無くなったので 11-07 に消した (判定は tree-judge の judgeMemo 1 本)
 */
import type { PatchData, StageItem } from "../../craft-stage/engine";
import type { TreeDoc } from "./tree-model";
import { sampleOf, SINGLE_SEEDS } from "./tree-sample";

/** 箱の形に合う見本 (着いた人の 1〜SINGLE_SEEDS 人目のうち最初。合う人がいなければ 1 人目) */
export function shapeSampleOf(data: PatchData, doc: TreeDoc, boxId: string): StageItem { return shapeSampleWithNote(data, doc, boxId).item; }
/** 見本と、合う見本が無かった時の印 (cant:unreachable = この道では作れない箱。見張りが箱の data-sample-note で見分ける、10-28 夜 最終チェック長) */
export function shapeSampleWithNote(data: PatchData, doc: TreeDoc, boxId: string): { item: StageItem; note: string | null } {
  // 道の狙いの組で選ばない (着いた見本の最初の 1 つ、大本 1)
  for (let seed = 1; seed <= SINGLE_SEEDS; seed++) {
    const x = sampleOf(data, doc, boxId, seed);
    if (x.note !== "none" && !x.note?.startsWith("cant:")) return { item: x.item, note: null };
  }
  const x = sampleOf(data, doc, boxId, 1);
  return { item: x.item, note: x.note ?? null };
}
