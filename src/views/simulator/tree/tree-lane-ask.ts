/**
 * tree-lane-ask.ts — 削減の手を消す・打ち直す前の一言 (S-65c4、スイッチ treeLaneAsk)。
 * 削減の手が無くなると、その削減で分けたほかの枠 (低い・同じ・高い) は置いてあった手と下の枝ごと消える (S-65c ⑦、決まりは変えない)。
 * ほかの枠に人の置いた手が 1 つ以上ある時だけ、変える前に窓 (TreeLaneAsk.vue) で聞く。0 なら聞かずにそのまま進む。
 * 数えは同じ操作を木の写しに先に通して、ほかの枠の下で消えた手を数える (消える決まりを 2 か所に書かない)
 */
import { ref, toRaw } from "vue";
import { tr } from "../../../i18n/lang";
import { subtree, type Aim, type Hand, type HandKind, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { applyPick, type OnlyOut } from "./tree-hand-plan";
import { lvPart } from "../../../services/simulator/tree/tree-whittle";
import { frameSiblings } from "../../../services/simulator/tree/tree-whittle-scene";
import { flag } from "../../../web/release-flags";

/** 聞いている間の中身 (null = 聞いていない)。n = 消える手の数、go = 「消して進む」でやる事 */
export const laneAsk = ref<{ n: number; go: () => void } | null>(null);

/** 箱 id の手を op で変えた時に、ほかの枠とその下で消える人の手の数 (自動の消去の続きは数えない) */
export function laneLossOf(doc: TreeDoc, id: string, op: (d: TreeDoc) => void): number {
  const hands = frameSiblings(doc, id)
    .filter((x) => x.id !== id && !!lvPart(x.junkKey))
    .flatMap((x) => subtree(doc, x.id))
    .filter((x) => { const b = doc.boxes[x]; return !!b?.hand && !b.autoAnnul; });
  if (!hands.length) return 0;
  const after = JSON.parse(JSON.stringify(doc)) as TreeDoc;
  op(after);
  return hands.filter((x) => !after.boxes[x]).length;
}

/** 窓の本文 (n = 消える手の数)。手の窓の「この手以降は削除されます」に足す 1 行も同じ字 */
export const laneText = (n: number): string => tr(`この削減で分けたほかの枠に置いた手 ${n} つも、下の枝ごと消えます。`,
  n === 1 ? "1 other craft placed in the frames this Whittling split will be removed too, along with its branches." : `${n} other crafts placed in the frames this Whittling split will be removed too, along with their branches.`);

/**
 * 手の窓で別の手に決める時の 1 行: 前からある確かめ「この手以降は削除されます」の本文に足す (窓は 1 回、新しい窓は出さない)。
 * ほかの枠の手が消えなければ空の字 (今までの字のまま)
 */
export function laneNoteOf(doc: TreeDoc, id: string, h: Hand | null, kind: HandKind | null, aims: Aim[], pre: string | null, only: OnlyOut): string {
  if (!flag("treeLaneAsk") || !h || !kind) return "";
  const n = laneLossOf(toRaw(doc), id, (d) => { applyPick(d, id, h, kind, aims, pre, only); });
  return n ? laneText(n) : "";
}

/** 箱 id の手を変える前に通す口: ほかの枠の手が消えるなら聞き、消えなければすぐ go。told = 手の窓の確かめでもう伝えた (聞かない) */
export function askLane(doc: TreeDoc, id: string, op: (d: TreeDoc) => void, go: () => void, told = false): void {
  const n = flag("treeLaneAsk") && !told ? laneLossOf(doc, id, op) : 0;
  if (n) laneAsk.value = { n, go }; else go();
}

/** 窓の答え (true = 消して進む、false = やめる = 何も変えない) */
export function answerLane(ok: boolean): void {
  const a = laneAsk.value;
  laneAsk.value = null;
  if (ok) a?.go();
}
