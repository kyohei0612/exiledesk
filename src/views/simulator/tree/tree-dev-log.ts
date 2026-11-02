/**
 * tree-dev-log.ts — 開発版の操作の記録 (U-33 の devLog) へ、ツリーの手の中身を足す (S-197、11-02 オーナー「このレシピにたどり着くまでの道とか一回消してもっかいつけたかもしれんやん」)。
 * 木を変える口 use-tree の edit の前後を比べるので、手を足す・変える・消す・戻す・完成はどの画面からでも 1 か所で残る。devLog は本番の作りでは空。
 */
import { devLog } from "../../../web/dev-log";
import type { Hand, TreeDoc } from "../../../services/simulator/tree/tree-model";

const handOf = (h: Hand): Record<string, unknown> => ({ currency: h.currency, omens: h.omens, ...(h.keep ? { keep: h.keep.map((a) => a.modId) } : {}), ...(h.free ? { free: true } : {}) });

/** before → after で変わった箱を 1 行ずつ残す */
export function logTreeEdit(before: TreeDoc, after: TreeDoc): void {
  const boxes = Object.keys(after.boxes).length;
  for (const [id, b] of Object.entries(after.boxes)) {
    const was = before.boxes[id];
    if (!was) continue; // 新しい箱は親の手の行の outs で分かる
    if (JSON.stringify(was.hand ?? null) !== JSON.stringify(b.hand ?? null)) devLog("tree-hand", { op: !b.hand ? "remove" : was.hand ? "change" : "add", box: id, hand: b.hand ? handOf(b.hand) : null, was: was.hand ? handOf(was.hand) : null, outs: b.outs, boxes });
    if ((was.back ?? null) !== (b.back ?? null)) devLog("tree-back", { box: id, to: b.back ?? null, boxes });
    if ((was.done ?? null) !== (b.done ?? null)) devLog("tree-done", { box: id, done: b.done ?? null, boxes });
  }
  const gone = Object.keys(before.boxes).filter((id) => !after.boxes[id]);
  if (gone.length) devLog("tree-gone", { n: gone.length, ids: gone.slice(0, 30), boxes });
}
