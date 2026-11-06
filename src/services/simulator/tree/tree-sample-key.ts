/**
 * tree-sample-key.ts — 箱の見本を覚える鍵 (S-71b ②。tree-sample.ts から分けた)。
 * 見本は道だけで決まる (S-74) ので、鍵 = 見本に効く物全部: 木の前提 (箱より外)・木の狙いの札 (aimsOf)・置き石 (placedAims)・始まりからこの箱までの箱と、その各段の兄弟の札。
 * この箱自身の手・分かれ目は下の箱の見本にしか効かないので入れない (手を足しても自分の見本を作り直さない)。
 * 道に全部消えてよい消去の手がある箱だけ、止まる所 (stripStop) が木全体を見るので木全体の中身も入れる
 * 鍵を作るだけで 100 箱の 1 手の 3 割を使っていたので、判定と見本作りの間は段ごとの文字を 1 回だけ作る (links)
 */
import type { StageItem } from "../../craft-stage/engine";
import { boxAims, type TreeBox, type TreeDoc } from "./tree-model";
import { aimsOf } from "./tree-sample";
import { placedAims } from "./tree-veil";

/** 位置と、見本に効かないメモの文を除く */
const skipPos = (k: string, v: unknown): unknown => (k === "x" || k === "y" || k === "note" ? undefined : v);
/** 兄弟の札 (手の当たりの札 handAims・結果の分け方 own・見本の種 pathKeyOf がここを見る) */
// 箱の番号は見本に効かない (種は道の札 pathKeyOf)。手を変えると番号が振り直されて覚えが全部外れていたので入れない (S-71b ⑬)
// ヒネコラのハズレ (S-39) の箱は見本が親のまま = 札に入れる (無い箱は前と同じ鍵)
export const tagOf = (x: TreeBox): unknown[] => [x.out, x.aim, boxAims(x), x.junkKey, x.mergedOuts, ...(x.seen ? ["seen"] : [])];
/** 箱の段の文字: self = 箱自身の札と兄弟、chain = 手・分かれ目まで入れて始まりまで続けた物、strip = ここまでの道に全部消えてよい消去がある */
export interface PathLink { self: string; chain: string; strip: boolean }
const NO_LINK: PathLink = { self: "", chain: "", strip: false };
function linkOf(doc: TreeDoc, id: string | null | undefined, links?: Map<string, PathLink>): PathLink {
  const b = id ? doc.boxes[id] : undefined;
  if (!b) return NO_LINK;
  const had = links?.get(b.id);
  if (had) return had;
  const p: TreeBox | undefined = b.parent ? doc.boxes[b.parent] : undefined, up = linkOf(doc, b.parent, links);
  const sibs = (p?.outs ?? []).map((o) => { const x = doc.boxes[o]; return x ? tagOf(x) : o; });
  const r = { self: JSON.stringify([tagOf(b), sibs], skipPos), chain: JSON.stringify([tagOf(b), b.hand, b.split, sibs], skipPos) + up.chain, strip: false };
  links?.set(b.id, r);
  return r;
}

/** whole = 木全体の鍵の番号 (道に全部消えてよい消去がある箱だけ呼ぶ) */
export function pathKeyOfBox(doc: TreeDoc, boxId: string, seed: number, alt: boolean, part: string, whole: () => number, links?: Map<string, PathLink>): string {
  const l = linkOf(doc, boxId, links);
  return `${part}|${seed}|${alt ? 1 : 0}|${l.self}|${linkOf(doc, doc.boxes[boxId]?.parent, links).chain}|${l.strip ? whole() : 0}`;
}
/** アイテムの比べの文字 (部位の表 cls はベースで決まるので入れない) */
export const itemKeyOf = (it: StageItem): string => JSON.stringify(it, (k, v: unknown) => (k === "cls" ? undefined : v));
/** 木の前提 (箱・狙いより外。始まりの見本はこれと種だけで決まる) */
export function premiseOf(doc: TreeDoc): string {
  const { boxes: _b, seq: _s, picks: _p, orphans: _o, droppedOld: _d, note: _n, tabNo: _t, tabName: _m, baseChosen: _c, ...rest } = doc;
  return JSON.stringify(rest, skipPos);
}
/** 箱によらない部分 (木の前提・木の狙いの札・置き石)。箱の数の分だけ掛かるので、木の変わらない間は 1 回だけ作る (tree-sample の keyOf) */
export function docPartOf(doc: TreeDoc): string {
  const { boxes: _b, seq: _s, picks: _p, orphans: _o, droppedOld: _d, note: _n, tabNo: _t, tabName: _m, baseChosen: _c, ...rest } = doc;
  return JSON.stringify([rest, aimsOf(doc), placedAims(doc)], skipPos);
}
