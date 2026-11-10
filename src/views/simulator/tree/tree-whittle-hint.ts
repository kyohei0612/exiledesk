/**
 * tree-whittle-hint.ts — 次に打つ手の窓で、削減を含む手を持った時の分かれ方の一行 (S-65c ⑨、11-10 オーナー「ハズレMODがあった時点で削減カオスしたら
 * 両方色付きにして複数結果有りみたいな感じで教えてあげないとダメじゃね」→ 案 1「おすすめでおｋ」)。
 * 木の写しに置く前のそろえ (tree-whittle-pre の syncBeforeHand) を通し、この箱がどの枠 (低い・同じ・高い) になるか・ほかにどの枠ができるかを読むだけ。
 * 分からない (外れが無い・乱数の外れが無い・削減でない) 時は null
 */
import { toRaw } from "vue";
import type { PatchData } from "../../../services/craft-stage/engine";
import type { Hand, TreeDoc } from "../../../services/simulator/tree/tree-model";
import { isWhittleHand, LV_ORDER, lvNote, lvPart, type LvClass } from "../../../services/simulator/tree/tree-whittle";
import { frameSiblings } from "../../../services/simulator/tree/tree-whittle-scene";
import { syncBeforeHand } from "./tree-whittle-pre";

const WORD: Record<LvClass, [string, string]> = { lo: ["低い", "lower"], eq: ["同じ", "same"], hi: ["高い", "higher"] };

/** この箱に手 h を置いた時の枠: この箱の枠 own と、付きうる枠の全部 all (並びは 低い → 同じ → 高い)。削減の手でない・枠に分かれない箱は null */
export function whittleFrames(data: PatchData, doc: TreeDoc, boxId: string, h: Hand | null): { own: LvClass; all: LvClass[] } | null {
  if (!h || !isWhittleHand(h) || !doc.boxes[boxId]?.parent) return null;
  const d = structuredClone(toRaw(doc));
  syncBeforeHand(data, d, boxId, h);
  const b = d.boxes[boxId]!, own = lvPart(b.junkKey);
  if (!own) return null;
  // 兄弟の枠は同じ組 (種類・当たりの狙い・枠を外した鍵 = 枠を作る所と同じ tree-whittle-scene)
  const sib = new Set(frameSiblings(d, boxId).map((x) => lvPart(x.junkKey)));
  // 並べるのはこの場面のデータで付きうる枠だけ (S-65c ②。比べる相手より低い外れが付きえなければ「低い」は無い、など)。固定の 3 つにしない
  return { own, all: LV_ORDER.filter((c) => c === own || sib.has(c)) };
}

/** [日本語, 英語] の一行。削減の手でない・枠に分かれない箱は null */
export function whittleHint(data: PatchData, doc: TreeDoc, boxId: string, h: Hand | null): [string, string] | null {
  const f = whittleFrames(data, doc, boxId, h);
  if (!f) return null;
  const { own, all } = f;
  const [nj, ne] = lvNote(own);
  if (all.length === 1) return [`この手では結果は 1 通り: 外れの MOD レベルはこの場面では「${WORD[own][0]}」だけ (${nj})`, `One possible result for this craft: the miss's mod level can only be "${WORD[own][1]}" here (${ne})`];
  return [
    `外れの MOD レベルで結果が変わる: ${all.map((c) => `「${WORD[c][0]}」`).join("")}の ${all.length} つの枠に分かれる。この箱は「${WORD[own][0]}」の枠 (${nj})`,
    `The result depends on the miss's mod level: splits into ${all.length} frames (${all.map((c) => `"${WORD[c][1]}"`).join(", ")}). This box is the "${WORD[own][1]}" frame (${ne})`,
  ];
}
