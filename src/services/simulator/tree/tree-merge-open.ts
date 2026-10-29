/**
 * tree-merge-open.ts — まだ手の無い同じ形の結果の箱をまとめる (S-66、10-28 夜オーナー「同じ奴は自動でまとめる」「最初程とんでもないことになるよ」、スイッチ mergeOpen)。
 * 自動のつなぎ (tree-shape の linkSameShape) は手のある箱へだけ・「打った後」はつながないので、狙い無しの変成 → 増強 → 王者を別々の枝に打つと、
 * 同じ形 (プレ 1 + サフィ 1 外れ など) の箱が枝の数だけ並び、全部に「!」と「↩ 戻り先を選ぶ」が出た (junkSide で側ごとに分けてから倍々に)。
 * ここでは外れ・打った後・外れが消えた の箱を、先に作った同じ形 (狙いの組 + 体 = 外れの側・種類・数、✦ の側、レアリティ) の箱へ自動の ↩ でつなぐ。
 * 相手の箱は手が無くてもよい (後から人が相手に手を足せば、こちらの人もそこから進む)。人が × で外した箱 (noAutoBack) はつながない
 */
import { flag } from "../../../web/release-flags";
import { sameBody, type BodyOf } from "./tree-box-shape";
import { subtree, type OutKind, type TreeBox, type TreeDoc } from "./tree-model";
import { heldSets } from "./tree-shape";
import type { Judge } from "./tree-judge";

const OPEN_OUTS: ReadonlySet<OutKind | "start"> = new Set(["junk", "any", "junkGone"]);
/** スイッチ judgeOne: 狙いが消えたの箱もまとめる (S-66) */
const OPEN_JUDGE: ReadonlySet<OutKind | "start"> = new Set(["junk", "any", "junkGone", "lost"]);
/** 作った順 (箱の id は b<番号>) */
const seqOf = (id: string): number => Number(/\d+$/.exec(id)?.[0] ?? 0);
/** 親からの深さ (段) */
const depthOf = (doc: TreeDoc, id: string): number => { let n = 0; for (let b = doc.boxes[id]; b?.parent; b = doc.boxes[b.parent]) n++; return n; };
/** 鍵の削減の順位の部分 (`w:`、tree-whittle) */
const rankPart = (k: string | undefined): string => k?.split(";").find((s) => s.startsWith("w:")) ?? "";
const setKey = (doc: TreeDoc, id: string): string => heldSets(doc, id).map((h) => [...h].sort().join(",")).sort().join("|");

/** j = 判定 (tree-judge、スイッチ judgeOne)。渡すと比べは「箱どうし」の fitsBox だけ */
export function mergeOpenSame(doc: TreeDoc, ids: readonly string[], body: BodyOf | undefined, j?: Judge | null): void {
  if (!flag("mergeOpen") || (!body && !j)) return;
  const outs = j ? OPEN_JUDGE : OPEN_OUTS;
  const open = (id: string): boolean => {
    const b = doc.boxes[id];
    return !!b && outs.has(b.out) && !b.hand && !b.back && !b.done && !b.split && !b.noAutoBack;
  };
  for (const id of [...ids].sort((a, b) => seqOf(a) - seqOf(b))) {
    if (!open(id)) continue;
    const mine = j ? "" : body!(id);
    // 体の分からない箱・見本ごとに外れの種類が違う箱 (mixed) はまとめない
    if (!j && (!mine || mine.startsWith("mixed"))) continue;
    const key = j ? "" : setKey(doc, id), below = new Set(subtree(doc, id)), dep = depthOf(doc, id);
    // まとめるのは同じ段 (親からの深さが同じ) の箱どうしだけ。違う段の箱へまとめると、その手の線が上の段の決めていない箱へ伸びて線がぐちゃっとなった
    // (10-28 夜オーナー「まだ決めてない＋が出てるのに勝手に線につながれた」)。違う段の同じ形は戻りの自動のつなぎ (S-50) に任せる
    const to = Object.values(doc.boxes)
      // 削減の手で外れの順位で分けた箱 (S-65b) は、順位の鍵が同じ箱へだけ (中身の比べは MOD レベルを見ないので、分けた兄弟がまたまとまる)
      .filter((t) => t.id !== id && !below.has(t.id) && seqOf(t.id) < seqOf(id) && outs.has(t.out) && !t.back && !t.done && !t.split && depthOf(doc, t.id) === dep && rankPart(t.junkKey) === rankPart(doc.boxes[id]?.junkKey))
      .sort((a, b) => seqOf(a.id) - seqOf(b.id))
      .find((t) => (j ? j.fitsBox(id, t.id) : body!(t.id) === mine && sameBody(body, id, t.id) && setKey(doc, t.id) === key));
    if (!to) continue;
    const c = doc.boxes[id]!;
    c.back = to.id;
    c.autoBack = true;
    c.merged = true;
    c.done = null;
  }
}
/**
 * まとめた箱 = 描かない箱 (案 A、10-28 夜オーナー「N1の案Aだな」): 親の線はまとめ先の箱へ直に入り、まとめ先の題の横に「n 本から合流」。
 * 戻り先を手で替える・× で外す (autoBack が消える)・手を足すと、また普通の箱として描く
 */
export const mergedAway = (d: TreeDoc, b: TreeBox): boolean => flag("mergeOpen") && !!b.merged && !!b.autoBack && !b.hand && !!b.back && !!d.boxes[b.back] && depthOf(d, b.id) === depthOf(d, b.back); // 違う段へまとめた古い箱は普通の箱 (↩) で描く
/** その箱へまとめた (描かない) 箱の数 */
export const mergedInto = (d: TreeDoc, id: string): number => Object.values(d.boxes).filter((b) => b.back === id && mergedAway(d, b)).length;

