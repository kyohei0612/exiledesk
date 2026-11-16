/**
 * tree-junk-same.ts — 「同じ外れは 1 回で」(S-190d、スイッチ junkSameHand。オーナー 11-15「ハズレMODのハズレの仕方の設定がだるい…多すぎてめんどい」→ 案 A)。
 * 同じ外れ = 同じ手 (sameHand) の結果の、同じ種類の箱 (外れ / 外れが消えた / 狙いが消えた / 打った後。プレ・サフィの側は見ない) で、まだ手・↩・完成 / 失敗の無い物。
 * 同じ中身の箱は手を置けば自動でつながる (S-50e) ので、ここが拾うのは中身が側などで少し違う箱 (例: 消去の後の「外れが消えた」プレ / サフィ)。
 * 兄弟枠 (11-16 の名前): 手の無い箱に初めて手を置いたその時に、今ある・まだ決めていない同じ外れの箱へ 1 回だけ同じ手 (と「失敗」の印) を入れる
 * (1 つの組み替えなので 1 つ戻すで丸ごと戻る。☑ は 11-15 にやめた)。つながりは残さない: 後で手を替える・消す・置き直すのはその箱だけ。
 * 手を消した箱 (sameOff) は兄弟枠に入れず、写す元にもしない
 */
import type { PatchData } from "../../../services/craft-stage/engine";
import { sameHand, type Aim, type Hand, type HandKind, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { applyPick, holdLinks, onlyOf } from "./tree-hand-plan";
import { flag } from "../../../web/release-flags";
import { effectOf } from "../../../services/simulator/tree/tree-hands";

/** 同じ外れに数える結果の種類 (当たり・完成への道・塞がった箱は入れない) */
const KINDS = new Set(["junk", "junkGone", "lost", "any"]);
/** フラクチャーで固定された箱 (フラクチャーの手の当たり = 「〜が固定された」)。兄弟枠に入れる (S-190d、11-16 オーナー「フラクチャー後の消去も兄弟判定になってない」→「おｋ」) */
const fracHit = (d: TreeDoc, id: string): boolean => { const b = d.boxes[id]; const h = b?.parent ? d.boxes[b.parent]?.hand : null; return !!b && b.out === "hit" && !!h && effectOf(h.currency) === "fracture"; };
/** 兄弟枠に入る・写す元になれる箱 = 手・↩・完成 / 失敗が無く、人が手を消した箱 (sameOff) でもない (11-16 オーナー「自動で置いたやつを編集したり消したりするときはその枠だけで良さそうやね」) */
const open = (d: TreeDoc, id: string): boolean => { const b = d.boxes[id]; return !!b && (KINDS.has(b.out) || fracHit(d, id)) && !b.hand && !b.back && !b.done && !b.sameOff; };

/** id の箱と同じ外れの、まだ決めていないほかの箱 (木の並びの順)。id が決め済み・外れでなければ空 */
export function sameJunkOf(d: TreeDoc, id: string): string[] {
  if (!flag("junkSameHand") || !open(d, id)) return [];
  const ph = d.boxes[d.boxes[id]!.parent ?? ""]?.hand;
  if (!ph) return [];
  const out = d.boxes[id]!.out;
  const aim = d.boxes[id]!.aim?.modId ?? null; // フラクチャーで固定された箱どうしは固定された狙いも同じ物だけ
  return Object.values(d.boxes).filter((o) => o.id !== id && o.out === out && (out !== "hit" || (o.aim?.modId ?? null) === aim) && open(d, o.id) && !!o.parent && (() => { const h = d.boxes[o.parent!]?.hand; return !!h && sameHand(h, ph); })()).map((o) => o.id);
}

/** 決めた手を同じ外れのほかの箱にも置く (呼ぶ側の edit の中で、元の箱に置いた後)。間に自動でつながった箱は飛ばす */
export function pickSameJunk(data: PatchData, d: TreeDoc, ids: string[], h: Hand, kind: HandKind, aims: Aim[], pre: string | null): void {
  for (const id of ids) {
    if (!open(d, id)) continue;
    holdLinks(() => applyPick(d, id, h, kind, aims, pre, onlyOf(data, d, id, h, pre, aims)));
  }
}
