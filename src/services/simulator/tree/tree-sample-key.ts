/**
 * tree-sample-key.ts — 箱の見本を覚える鍵 (S-71b ②、スイッチ treeLight。tree-sample.ts から分けた)。
 * 見本は道だけで決まる (S-74) ので、鍵 = 見本に効く物全部: 木の前提 (箱より外)・木の狙いの札 (aimsOf)・置き石 (placedAims)・始まりからこの箱までの箱と、その各段の兄弟の札。
 * この箱自身の手・分かれ目は下の箱の見本にしか効かないので入れない (手を足しても自分の見本を作り直さない)。
 * 道に全部消えてよい消去の手がある箱だけ、止まる所 (stripStop) が木全体を見るので木全体の中身も入れる
 */
import { boxAims, type TreeBox, type TreeDoc } from "./tree-model";
import { isStrip } from "./tree-outcome";
import { aimsOf } from "./tree-sample";
import { placedAims } from "./tree-veil";

/** 位置と、見本に効かないメモの文を除く */
const skipPos = (k: string, v: unknown): unknown => (k === "x" || k === "y" || k === "note" ? undefined : v);
/** 兄弟の札 (手の当たりの札 handAims・結果の分け方 own・見本の種 pathKeyOf がここを見る) */
const tagOf = (x: TreeBox): unknown[] => [x.id, x.out, x.aim, boxAims(x), x.junkKey, x.mergedOuts];

/** whole = 木全体の鍵の番号 (道に全部消えてよい消去がある箱だけ呼ぶ) */
export function pathKeyOfBox(doc: TreeDoc, boxId: string, seed: number, alt: boolean, whole: () => number): string {
  const { boxes: _b, seq: _s, picks: _p, orphans: _o, note: _n, tabNo: _t, tabName: _m, baseChosen: _c, ...rest } = doc;
  const chain: unknown[] = [];
  let strip = false;
  for (let b: TreeBox | undefined = doc.boxes[boxId]; b; b = b.parent ? doc.boxes[b.parent] : undefined) {
    const p: TreeBox | undefined = b.parent ? doc.boxes[b.parent] : undefined;
    if (isStrip(p)) strip = true;
    const sibs = (p?.outs ?? []).map((o) => { const x = doc.boxes[o]; return x ? tagOf(x) : o; });
    chain.push(b.id === boxId ? [tagOf(b), sibs] : [tagOf(b), b.hand, b.split, sibs]);
  }
  return JSON.stringify([seed, alt, rest, aimsOf(doc), placedAims(doc), chain, strip ? whole() : 0], skipPos);
}
