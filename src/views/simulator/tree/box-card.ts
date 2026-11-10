/**
 * box-card.ts — 木の箱のカードの組み立てを 1 か所に (G-1 V-1、11-07)。
 * 見本 (箱の形に合う見本 shapeSampleWithNote) → 値を揃える (fixedValues、箱 boxId 込み = 道の手前の神の目標値も) → 行の札 (treeRowTags) の順。
 * 並びは木の箱のカードではどこも rowGroup を渡さない (null = エミュの並び) ので、呼ぶ画面が :row-group="null" のまま。
 * 前は PC の箱 (TreeBox)・手の窓 (TreeHandShelf)・スマホの 4 画面 (PhoneAsk・PhoneBoxPeek・PhoneBoxSheet・PhoneOutRow) が別々に組み、
 * スマホは boxId を渡さず神の目標値が出ず、見本も 1 人目だけ (PC は箱の形に合う人) だった。
 */
import { lvRowTags } from "./tree-whittle-marks";
import type { PatchData, StageItem } from "../../../services/craft-stage/engine";
import type { RowTag } from "../../../components/for-share/item/stage-item-row-tag";
import type { TreeBox, TreeDoc } from "../../../services/simulator/tree/tree-model";
import { shapeSampleWithNote } from "../../../services/simulator/tree/tree-sample-shape";
import { fixedValues } from "./tree-fixed-values";
import { sameModShown } from "../../../services/simulator/tree/tree-outcome";
import { routeRowTags, treeRowTags } from "./tree-row-tags";

export interface CardOpts {
  /** 札を引く箱 (無ければ doc.boxes[boxId]。PC の箱は自分の props.box を渡す) */
  box?: TreeBox | null;
  /** スマホの道の画面: エッセンスの行は MOD の名前で出す (S-94h、routeRowTags) */
  routeNames?: boolean;
}
/** 出すカード (値を揃えた品) と行の札 */
export interface Card { item: StageItem; tags: Map<string, RowTag> }
/** 箱のカード + 元の見本 (打つ前の光り・判定は見本の値のまま使う) と、合う見本が無かった時の印 */
export interface BoxCard extends Card { sample: StageItem; note: string | null }

/** 渡した品 it を箱 boxId のカードにする (手の窓の持った品・戻り先の箱の品など、見本を自分で決める画面) */
export function cardFor(d: PatchData, doc: TreeDoc, boxId: string, it: StageItem, opts: CardOpts = {}): Card {
  const item = fixedValues(d, doc, sameModShown(d, doc, boxId, it), boxId); // 「エッセンスと同じ MOD」の箱はエッセンス未満の一番高い段で出す (S-33e)
  const b = opts.box ?? doc.boxes[boxId];
  const tags = treeRowTags(d, doc, b?.unwanted ?? [], item, b);
  return { item, tags: opts.routeNames ? routeRowTags(d, doc, item, tags) : tags };
}
/** 箱 boxId のカード (見本は箱の形に合う見本)。箱が無ければ null */
export function boxCardOf(d: PatchData, doc: TreeDoc, boxId: string, opts: CardOpts = {}): BoxCard | null {
  if (!opts.box && !doc.boxes[boxId]) return null;
  const s = shapeSampleWithNote(d, doc, boxId);
  const c = cardFor(d, doc, boxId, s.item, opts);
  // 削減の手前の枠 (S-65c ⑧): 比べる相手 と外れ MOD の ▼ ＝ ▲ (PC の箱・スマホの道・窓で同じ)
  return { ...c, tags: lvRowTags(d, doc, boxId, c.item, c.tags), sample: s.item, note: s.note };
}
