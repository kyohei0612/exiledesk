/**
 * tree-merge-open.ts — まだ手の無い同じ形の結果の箱をまとめる (S-66、10-28 夜オーナー「同じ奴は自動でまとめる」「最初程とんでもないことになるよ」)。
 * 自動のつなぎ (tree-shape の linkSameShape) は手のある箱へだけ・「打った後」はつながないので、狙い無しの変成 → 増強 → 王者を別々の枝に打つと、
 * 同じ形 (プレ 1 + サフィ 1 外れ など) の箱が枝の数だけ並び、全部に「!」と「↩ 戻り先を選ぶ」が出た (junkSide で側ごとに分けてから倍々に)。
 * ここでは外れ・打った後・外れが消えた の箱を、木の並びで前 (手のある箱が先) の同じ形 (狙いの組 + 体 = 外れの側・種類・数、✦ の側、レアリティ) の箱へ自動の ↩ でつなぐ。
 * 相手の箱は手が無くてもよい (後から人が相手に手を足せば、こちらの人もそこから進む)。人が × で外した箱 (noAutoBack) はつながない
 */
import { sameBody, type BodyOf } from "./tree-box-shape";
import { subtree, type OutKind, type TreeBox, type TreeDoc } from "./tree-model";
import { heldSets } from "./tree-shape";
import type { Judge } from "./tree-judge";

const OPEN_OUTS: ReadonlySet<OutKind | "start"> = new Set(["junk", "any", "junkGone"]);
/** 狙いが消えたの箱もまとめる (S-66) */
const OPEN_JUDGE: ReadonlySet<OutKind | "start"> = new Set(["junk", "any", "junkGone", "lost"]);
/** 木の並びの位置 = 始まりから各段の結果の何番目かの並び (作った順ではない。組んだ順と開いた時の打ち直しの順が違っても同じ答え、S-66・S-140) */
const placeOf = (doc: TreeDoc, id: string): number[] => {
  const at: number[] = [];
  for (let b = doc.boxes[id]; b?.parent; b = doc.boxes[b.parent]) at.unshift(doc.boxes[b.parent]?.outs.indexOf(b.id) ?? 0);
  return at;
};
/** a が木の並びで b より前か (上の段・同じ段は左が先) */
export const placedBefore = (doc: TreeDoc, a: string, b: string): boolean => {
  const x = placeOf(doc, a), y = placeOf(doc, b);
  if (x.length !== y.length) return x.length < y.length;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i]! < y[i]!;
  return false;
};
const byPlace = (doc: TreeDoc) => (a: string, b: string): number => (placedBefore(doc, a, b) ? -1 : placedBefore(doc, b, a) ? 1 : 0);
/** 親からの深さ (段) */
const depthOf = (doc: TreeDoc, id: string): number => { let n = 0; for (let b = doc.boxes[id]; b?.parent; b = doc.boxes[b.parent]) n++; return n; };
/** 鍵の削減の順位の部分 (`w:`、tree-whittle) */
const rankPart = (k: string | undefined): string => k?.split(";").find((s) => s.startsWith("w:")) ?? "";
const setKey = (doc: TreeDoc, id: string): string => heldSets(doc, id).map((h) => [...h].sort().join(",")).sort().join("|");

/** j = 判定 (tree-judge)。渡すと比べは「箱どうし」の fitsBox だけ */
export function mergeOpenSame(doc: TreeDoc, ids: readonly string[], body: BodyOf | undefined, j?: Judge | null): void {
  if (!body && !j) return;
  const outs = j ? OPEN_JUDGE : OPEN_OUTS;
  const open = (id: string): boolean => {
    const b = doc.boxes[id];
    return !!b && outs.has(b.out) && !b.hand && !b.back && !b.done && !b.split && !b.noAutoBack;
  };
  const order = byPlace(doc);
  for (const id of [...ids].sort(order)) {
    if (!open(id)) continue;
    const mine = j ? "" : body!(id);
    // 体の分からない箱・見本ごとに外れの種類が違う箱 (mixed) はまとめない
    if (!j && (!mine || mine.startsWith("mixed"))) continue;
    const key = j ? "" : setKey(doc, id), below = new Set(subtree(doc, id)), dep = depthOf(doc, id);
    // まとめるのは同じ段 (親からの深さが同じ) の箱どうしだけ。違う段の箱へまとめると、その手の線が上の段の決めていない箱へ伸びて線がぐちゃっとなった
    // (10-28 夜オーナー「まだ決めてない＋が出てるのに勝手に線につながれた」)。違う段の同じ形は戻りの自動のつなぎ (S-50) に任せる
    const same = Object.values(doc.boxes)
      // 削減の手で外れの順位で分けた箱 (S-65b) は、順位の鍵が同じ箱へだけ (中身の比べは MOD レベルを見ないので、分けた兄弟がまたまとまる)
      .filter((t) => t.id !== id && !below.has(t.id) && outs.has(t.out) && !t.back && !t.done && !t.split && depthOf(doc, t.id) === dep && rankPart(t.junkKey) === rankPart(doc.boxes[id]?.junkKey))
      .filter((t) => (j ? j.fitsBox(id, t.id) : body!(t.id) === mine && sameBody(body, id, t.id) && setKey(doc, t.id) === key));
    // まとめ先は手のある箱、無ければ木の並びで一番前の箱 (前は先に作った箱で、組んだ順と開いた時の打ち直しの順が違うと
    // 開き直すたびに合流先が別の親の下へ飛んだ。消去の外れが消えた / 狙いが消えたの合流、11-06 オーナー「消去の枠の合体も色々挙動おかしい」)
    const to = same.filter((t) => !!t.hand).sort((a, b) => order(a.id, b.id))[0] ?? same.filter((t) => placedBefore(doc, t.id, id)).sort((a, b) => order(a.id, b.id))[0];
    if (to) { mergeTo(doc, id, to.id); continue; }
    // 自分の方が前: 後ろのまだ手の無い同じ形の箱 (と、そこへまとめていた箱) をこちらへまとめ直す
    for (const t of same) if (!t.hand && open(t.id) && placedBefore(doc, id, t.id)) {
      for (const b of Object.values(doc.boxes)) if (b.back === t.id && b.merged && b.autoBack && !b.hand) b.back = id;
      mergeTo(doc, t.id, id);
    }
  }
}
function mergeTo(doc: TreeDoc, id: string, to: string): void {
  const c = doc.boxes[id]!;
  c.back = to;
  c.autoBack = true;
  c.merged = true;
  c.done = null;
}
/**
 * まとめた箱 = 描かない箱 (案 A、10-28 夜オーナー「N1の案Aだな」): 親の線はまとめ先の箱へ直に入り、まとめ先の題の横に「n 本から合流」。
 * 戻り先を手で替える・× で外す (autoBack が消える)・手を足すと、また普通の箱として描く
 */
export const mergedAway = (d: TreeDoc, b: TreeBox): boolean => !!b.merged && !!b.autoBack && !b.hand && !!b.back && !!d.boxes[b.back] && depthOf(d, b.id) === depthOf(d, b.back); // 違う段へまとめた古い箱は普通の箱 (↩) で描く
/** その箱へまとめた (描かない) 箱の数 */
export const mergedInto = (d: TreeDoc, id: string): number => Object.values(d.boxes).filter((b) => b.back === id && mergedAway(d, b)).length;

