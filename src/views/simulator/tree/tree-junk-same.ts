/**
 * tree-junk-same.ts — 「同じ外れは 1 回で」(S-190d、スイッチ junkSameHand。オーナー 11-15「ハズレMODのハズレの仕方の設定がだるい…多すぎてめんどい」→ 案 A)。
 * 同じ外れ = 同じ手 (sameHand) の結果の、同じ種類の箱 (外れ / 外れが消えた / 狙いが消えた / 打った後。プレ・サフィの側は見ない) で、まだ手・↩・完成 / 失敗の無い物。
 * 同じ中身の箱は手を置けば自動でつながる (S-50e) ので、ここが拾うのは中身が側などで少し違う箱 (例: 消去の後の「外れが消えた」プレ / サフィ)。
 * 手の窓で決めた手と、箱の「失敗」の印を、同じ外れのほかの箱にも同じ 1 つの組み替えで入れる (1 つ戻すで丸ごと戻る)
 */
import { ref } from "vue";
import type { PatchData } from "../../../services/craft-stage/engine";
import { sameHand, type Aim, type Hand, type HandKind, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { applyPick, holdLinks, onlyOf } from "./tree-hand-plan";
import { flag } from "../../../web/release-flags";

/** 手の窓の「同じ外れのほかの箱にも同じ手」の ☑ (窓を開くたびに既定の ☑ に戻す) */
export const junkSameOn = ref(true);
/** 同じ外れに数える結果の種類 (当たり・完成への道・塞がった箱は入れない) */
const KINDS = new Set(["junk", "junkGone", "lost", "any"]);
const open = (d: TreeDoc, id: string): boolean => { const b = d.boxes[id]; return !!b && KINDS.has(b.out) && !b.hand && !b.back && !b.done; };

/** id の箱と同じ外れの、まだ決めていないほかの箱 (木の並びの順)。id が決め済み・外れでなければ空 */
export function sameJunkOf(d: TreeDoc, id: string): string[] {
  if (!flag("junkSameHand") || !open(d, id)) return [];
  const ph = d.boxes[d.boxes[id]!.parent ?? ""]?.hand;
  if (!ph) return [];
  const out = d.boxes[id]!.out;
  return Object.values(d.boxes).filter((o) => o.id !== id && o.out === out && open(d, o.id) && !!o.parent && (() => { const h = d.boxes[o.parent!]?.hand; return !!h && sameHand(h, ph); })()).map((o) => o.id);
}

/** 決めた手を同じ外れのほかの箱にも置く (呼ぶ側の edit の中で、元の箱に置いた後)。間に自動でつながった箱は飛ばす */
export function pickSameJunk(data: PatchData, d: TreeDoc, ids: string[], h: Hand, kind: HandKind, aims: Aim[], pre: string | null): void {
  for (const id of ids) {
    if (!open(d, id)) continue;
    holdLinks(() => applyPick(d, id, h, kind, aims, pre, onlyOf(data, d, id, h, pre, aims)));
  }
}
