/**
 * tree-merge-open.ts — まだ手の無い同じ形の結果の箱をまとめる (S-66、10-28 夜オーナー「同じ奴は自動でまとめる」「最初程とんでもないことになるよ」)。
 * 自動のつなぎ (tree-judge-link の linkByContent。前は tree-shape の linkSameShape) は手のある箱へだけ・「打った後」はつながないので、狙い無しの変成 → 増強 → 王者を別々の枝に打つと、
 * 同じ形 (プレ 1 + サフィ 1 外れ など) の箱が枝の数だけ並び、全部に「!」と「↩ 戻り先を選ぶ」が出た (junkSide で側ごとに分けてから倍々に)。
 * ここでは外れ・打った後・外れが消えた の箱を、木の並びで前 (手のある箱が先) の同じ形 (狙いの組 + 体 = 外れの側・種類・数、✦ の側、レアリティ) の箱へ自動の ↩ でつなぐ。
 * 相手の箱は手が無くてもよい (後から人が相手に手を足せば、こちらの人もそこから進む)。人が × で外した箱 (noAutoBack) はつながない
 */
import { subtree, type OutKind, type TreeBox, type TreeDoc } from "./tree-model";
import type { Judge } from "./tree-judge";
import { treeOrder } from "./tree-order";

/** まとめる結果の箱 (外れ・打った後・外れが消えた・狙いが消えた、S-66) */
const OPEN_JUDGE: ReadonlySet<OutKind | "start"> = new Set(["junk", "any", "junkGone", "lost"]);
/**
 * a が木の並びで b より前か (上の段・同じ段は道の並び、S-66・S-140)。並びは S-50f の treeOrder (作った順ではない)。
 * 前は各段の親の結果の何番目か (outs の並び) で、削減の手前の枠 (S-65c) は開くたびに 高い・低い・同じ の並びが変わり、まとめ先が入れ替わった (S-50f)
 */
export const placedBefore = (doc: TreeDoc, a: string, b: string): boolean => a !== b && treeOrder(doc)(a, b) < 0;
const byPlace = (doc: TreeDoc): ((a: string, b: string) => number) => treeOrder(doc);
/** 親からの深さ (段) */
const depthOf = (doc: TreeDoc, id: string): number => { let n = 0; for (let b = doc.boxes[id]; b?.parent; b = doc.boxes[b.parent]) n++; return n; };
/** 鍵の削減の順位の部分 (`w:`、tree-whittle) と削減の手前の枠の組 (`l:`、S-65c) */
const rankPart = (k: string | undefined): string => k?.split(";").filter((s) => s.startsWith("w:") || s.startsWith("l:")).join(";") ?? "";

/** j = 判定 (tree-judge)。比べは「箱どうし」の fitsBox だけ */
export function mergeOpenSame(doc: TreeDoc, ids: readonly string[], j: Judge): void {
  const outs = OPEN_JUDGE;
  // 自動の ↩ だけの箱 (人の決めでも、まとめた箱でもない) も、↩ 先が同じならまとめる (11-06 オーナー「ただ同じ枠あるなら統合しちゃっていいと思う」。
  // 前は整理が先に自動の ↩ を付けるので、消去の後の同じ枠の箱が親ごとに ↩ を持ったまま並んだ)
  const autoOnly = (b: TreeBox): boolean => !!b.back && !!b.autoBack && !b.merged;
  const open = (id: string): boolean => {
    const b = doc.boxes[id];
    return !!b && outs.has(b.out) && !b.hand && (!b.back || autoOnly(b)) && !b.done && !b.split && !b.noAutoBack;
  };
  const order = byPlace(doc);
  // 呼ぶ側は ↩ の無い箱だけを渡すので、自動の ↩ だけの箱もここで足して見る
  const auto = Object.values(doc.boxes).filter((b) => autoOnly(b) && open(b.id)).map((b) => b.id);
  for (const id of [...new Set([...ids, ...auto])].sort(order)) {
    if (!open(id)) continue;
    const below = new Set(subtree(doc, id)), dep = depthOf(doc, id);
    // まとめるのは同じ段 (親からの深さが同じ) の箱どうしだけ。違う段の箱へまとめると、その手の線が上の段の決めていない箱へ伸びて線がぐちゃっとなった
    // (10-28 夜オーナー「まだ決めてない＋が出てるのに勝手に線につながれた」)。違う段の同じ形は戻りの自動のつなぎ (S-50) に任せる
    const same = Object.values(doc.boxes)
      // 削減の手で外れの順位で分けた箱 (S-65b) は、順位の鍵が同じ箱へだけ (中身の比べは MOD レベルを見ないので、分けた兄弟がまたまとまる)
      // ヒネコラのハズレ箱 (seen、S-39) はまとめ先にしない (持つ前のアイテムのままの人の箱で、付け直すたびに出来るので、まとめる相手が付け直しの順で変わった)
      .filter((t) => t.id !== id && !below.has(t.id) && outs.has(t.out) && (t.back ?? null) === (doc.boxes[id]?.back ?? null) && (!t.back || autoOnly(t)) && !t.done && !t.split && !t.seen && depthOf(doc, t.id) === dep && rankPart(t.junkKey) === rankPart(doc.boxes[id]?.junkKey))
      .filter((t) => j.fitsBox(id, t.id));
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
 * 同じ段の同じ枠へまとめた箱 (S-66)。11-11 から描かない箱 (前の案 A = 親の線をまとめ先へ直に引く) にせず、各親の真下に普通の箱で描き、下の札を「→ 同じ枠へ (n 段目)」にする
 * (オーナー「普通に直下に同じ箱でも出したら線ごちゃごちゃにならない説　どうせ同じ枠に戻るだけだし」→「線がごちゃつくよりいいな　採用で」。前は別の親の下の箱へ横に伸びる線が交わり合流に見えた)。
 * 合流の線 (tree-merge) は引かない。戻り先を手で替える・× で外す (autoBack が消える)・手を足すと、ふつうの戻りの箱
 */
export const mergedSameRow = (d: TreeDoc, b: TreeBox): boolean => !!b.merged && !!b.autoBack && !b.hand && !!b.back && !!d.boxes[b.back] && depthOf(d, b.id) === depthOf(d, b.back); // 違う段へまとめた古い箱は普通の箱 (↩) で描く
/** 描かない箱 = ヒネコラの「ハズレ (打たない)」の先頭へまとめた兄弟だけ (S-39 ②)。同じ枠へまとめたほかの箱は 11-11 から親の真下に描く (S-66) */
export const mergedAway = (d: TreeDoc, b: TreeBox): boolean => mergedSameRow(d, b) && !!d.boxes[b.back!]?.seen;
/** その箱へまとめた (描かない) 箱の数 = ヒネコラのハズレ箱の「当たり以外 n 通り」 */
export const mergedInto = (d: TreeDoc, id: string): number => Object.values(d.boxes).filter((b) => b.back === id && mergedAway(d, b)).length;

