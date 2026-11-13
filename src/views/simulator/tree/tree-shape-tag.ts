/**
 * tree-shape-tag.ts — 組んでいる間に置いた消去の手の下の箱に「ツリーの形が変わる見込み」の札 (S-142l、スイッチ annulShapeTag、11-13 オーナー「消去のくだりやろええんちゃう」)。
 * 消去の結果は、完成・最終チェックの並べ直し (S-142k) で合流や並びが変わるので、それまでは結果の札 (外れが消えた・狙いが消えた など) の代わりにこの札を出す。
 * 開いた時と並べ直しの時に、その時ある消去の手の箱を控える (保存しない)。控えに無い消去の手の箱の下 (結果の箱とその下全部) が札の箱。
 * 開いた時の控えは、開いた回数 (use-tree の opened) が変わった後に最初に聞かれた時の木で取る (少しずつ描いて開く木 S-196 は、
 * 組み上がった木を入れる時にも opened が進むので、そこで取り直す。前は箱の置き場の掛け直しの時に取り、組み上がる前の木で取って全部の消去に札が出た)
 */
import { shallowRef } from "vue";
import { flag } from "../../../web/release-flags";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { isAnnulHand } from "./tree-annul-chain";

/** 開いた時・並べ直しの時にあった消去の手の箱 (画面の computed の中で書くので反応しない入れ物) */
let settled: ReadonlySet<string> = new Set();
/** 控えを取った時の開いた回数 */
let settledOpen = -1;
/** 並べ直しで控えを取り直した回数 (札を出し直すため) */
const tidied = shallowRef(0);
const annulIds = (d: TreeDoc): ReadonlySet<string> => new Set(Object.values(d.boxes).filter((b) => isAnnulHand(b.hand)).map((b) => b.id));
/** 並べ直しの時に今ある消去の手の箱を控える (札が消える) */
export function settleAnnul(d: TreeDoc): void {
  settled = annulIds(d);
  tidied.value++;
}
/** この箱の上に、控えの後に置いた消去の手の箱があるか (= 札の箱)。opened = 開いた回数 */
export function shapeTagOf(d: TreeDoc, id: string, opened: number): boolean {
  if (!flag("annulShapeTag")) return false;
  void tidied.value;
  if (opened !== settledOpen) { settledOpen = opened; settled = annulIds(d); }
  for (let p = d.boxes[id]?.parent; p; p = d.boxes[p]?.parent) {
    const b = d.boxes[p];
    if (b && isAnnulHand(b.hand) && !settled.has(p)) return true;
  }
  return false;
}
