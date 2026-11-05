/**
 * tree-foresee.ts — ヒネコラの髪束の予見を木で組む「予見の枠」(S-39、開発版だけ。11-05 オーナー「予見って見えるのね、だから打つって言うかアイテムを使わん状態で持った状態で
 * 次の結果が分かるのよだから予見の枠」「ヒネコラ後は打つじゃなくて持つになる　そしてその状態でもっかい同じ枠に」)。
 * 予見はエンジンの印 (apply-extra の hinekora = StageItem.foreseen、アイテムを変えると消える)。木は動きを足さず組み方だけ: 予見したアイテムの箱の手は「持つ」(まだ使っていない)、
 * 枠の中にその手の結果を行で並べ、行ごとに「使う / 使わない」(TreeBox.seen = 使わない)。使わない行は 1 つの箱 (枠のつづき = 使わない行のまとめ先) へまとめ、
 * そこで別の手を持つ (「進む」)。使わない人は手を使わず (費用も無し)、打つ前のアイテムのまま (見本は tree-sample、回すのは tree-run)
 */
import type { TreeDoc } from "./tree-model";
import { tr } from "../../../i18n/lang";
import { DEV_BUILD } from "../../../web/release-flags";

/** 開発版だけ (オーナーの OK の後に本番へ出す時はデザイン部に release-flags のスイッチを頼む。棚のヒネコラ・神、予見の枠がこれを見る) */
export const FORESEE_ON = DEV_BUILD;

/**
 * 予見の枠の箱か (ここの手は「持つ」): ヒネコラの結果の箱と、使わない行のまとめ先 (枠のつづき)。木の形で決める
 * (見本で決めると、見本の引けない結果の箱が親の予見済みの見本のままで枠に見えた)
 */
export function holdsAt(doc: TreeDoc, id: string): boolean {
  const b = doc.boxes[id], p = b?.parent ? doc.boxes[b.parent] : undefined;
  return FORESEE_ON && !!b && (!!b.seen || p?.hand?.currency === "hinekora");
}

/** 使わない行のまとめ先 (枠のつづき): 使わない行のうち手のある物、無ければ親の結果の並びで最初の物 */
export function seenHub(doc: TreeDoc, parentId: string): string | null {
  const seen = (doc.boxes[parentId]?.outs ?? []).filter((o) => doc.boxes[o]?.seen);
  return seen.find((o) => doc.boxes[o]?.hand || doc.boxes[o]?.outs.length) ?? seen[0] ?? null;
}

/** 着いた使わない行から、人が進む箱 (まとめ先) */
export const seenTo = (doc: TreeDoc, id: string): string => { const p = doc.boxes[id]?.parent; return (p && seenHub(doc, p)) || id; };

/**
 * 使わない行を 1 つの箱へまとめ直す: まとめ先のほかは自動の ↩ でまとめ先へ (tree-merge-open の描かない箱と同じ印、線はまとめ先へ入る)。
 * 中身は親と同じ予見済みなので、親や別の箱へ自動でつながない (noAutoBack)
 */
export function regroupSeen(doc: TreeDoc, parentId: string): void {
  const hub = seenHub(doc, parentId);
  for (const o of doc.boxes[parentId]?.outs ?? []) {
    const b = doc.boxes[o];
    if (!b?.seen) continue;
    b.noAutoBack = true;
    b.done = null;
    delete b.handBack;
    if (o === hub) { b.back = null; delete b.autoBack; delete b.merged; continue; }
    b.back = hub;
    b.autoBack = true;
    b.merged = true;
  }
}

/**
 * 行の「使う / 使わない」を替える (on = 使わない)。まとめ先を使うに戻した時は、持った手と下の箱をつぎのまとめ先へ移す。
 * regroup = false は組み直しの途中 (手を打ち直す前。最後に regroupAllSeen)
 */
export function setSeen(doc: TreeDoc, id: string, on: boolean, regroup = true): void {
  const b = doc.boxes[id], pid = b?.parent;
  if (!b || !pid) return;
  if (on) {
    if (b.hand) return;
    b.seen = true;
    b.noAutoBack = true;
    b.done = null;
    b.back = null;
    delete b.autoBack; delete b.merged; delete b.handBack;
  } else {
    const wasHub = seenHub(doc, pid) === id;
    delete b.seen; delete b.noAutoBack;
    if (b.autoBack) { b.back = null; delete b.autoBack; delete b.merged; }
    const next = wasHub ? seenHub(doc, pid) : null, n = next ? doc.boxes[next] : undefined;
    if (n && (b.hand || b.outs.length)) {
      n.hand = b.hand; n.outs = b.outs; n.back = null;
      delete n.autoBack; delete n.merged;
      for (const o of n.outs) { const c = doc.boxes[o]; if (c) c.parent = n.id; }
      b.hand = null; b.outs = [];
    }
  }
  if (regroup) regroupSeen(doc, pid);
}

/** 木の全部の予見の枠をまとめ直す (組み直しの最後) */
export function regroupAllSeen(doc: TreeDoc): void {
  const parents = new Set(Object.values(doc.boxes).filter((b) => b.seen && b.parent).map((b) => b.parent!));
  for (const p of parents) regroupSeen(doc, p);
}

/** 予見で見た手のカレンシー (この箱から上へ続く使わない行の親の手) */
export function seenCurrencies(doc: TreeDoc, id: string): string[] {
  const out: string[] = [];
  for (let b = doc.boxes[id]; b?.seen && b.parent; b = doc.boxes[b.parent]) {
    const h = doc.boxes[b.parent]?.hand;
    if (h) out.push(h.currency);
  }
  return out;
}

/** 枠のつづきで、予見で見た手と同じカレンシーを持った時の理由 (予見の結果は決まっているので、使っても見た結果と同じ。木では別の乱数になるので持たせない) */
export function foreseeBlock(doc: TreeDoc, id: string, key: string): string | null {
  return seenCurrencies(doc, id).includes(key) ? tr("予見で見た手と同じ (使うと見た結果になる。使うなら前の行を「使う」に)", "Same as the foreseen craft (it would give the foreseen result; set that row to Use instead)") : null;
}
