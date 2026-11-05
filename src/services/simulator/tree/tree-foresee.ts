/**
 * tree-foresee.ts — ヒネコラの髪束の予見を木で組む (S-39、開発版だけ。11-05 オーナー「ヒネコラ追加してヒネコラ予見時のUIだね」「一旦作ってみて」)。
 * 予見はエンジンの印 (apply-extra の hinekora = StageItem.foreseen、アイテムを変えると消える)。木は動きを足さず、予見したアイテムに打った手の結果の箱へ
 * 「打たない (予見で見ただけ)」の印 (TreeBox.seen) を付けられるだけ。その箱の人は手を使わず (費用も無し)、打つ前のアイテムのまま、その箱の手 (神のオーブ・別のカオスなど) を
 * エンジンで 1 回打つ (見本は tree-sample、回すのは tree-run)
 */
import type { StageItem } from "../../craft-stage/engine";
import type { TreeDoc } from "./tree-model";
import { tr } from "../../../i18n/lang";
import { DEV_BUILD } from "../../../web/release-flags";

/** 開発版だけ (オーナーの OK の後に本番へ出す時はデザイン部に release-flags のスイッチを頼む。棚のヒネコラ・神、箱の「打たない」がこれを見る) */
export const FORESEE_ON = DEV_BUILD;

/** 「打たない」を付けられる箱か: 手の無い結果の箱で、親に手があり、親のアイテム (見本) が予見済み。付けた箱は外せる */
export function canSee(doc: TreeDoc, id: string, parentItem: StageItem | null | undefined): boolean {
  const b = doc.boxes[id], p = b?.parent ? doc.boxes[b.parent] : undefined;
  if (!b || !p?.hand || b.hand || b.split) return false;
  return !!b.seen || !!parentItem?.foreseen;
}

/**
 * 印を付け外す。付ける時は完成 / 失敗・戻りを外す (打たない人はこの箱の手へ進むので、続きは人が決める)。
 * 自動の ↩ も付けない (noAutoBack)。中身が親と同じ予見済みなので、親へ自動でつなぐと同じ予見を別の乱数で引き直す輪になる
 */
export function setSeen(doc: TreeDoc, id: string, on: boolean): void {
  const b = doc.boxes[id];
  if (!b || b.hand) return;
  if (!on) { delete b.seen; delete b.noAutoBack; return; }
  b.seen = true;
  b.noAutoBack = true;
  b.done = null;
  b.back = null;
  delete b.autoBack; delete b.merged; delete b.handBack;
}

/** 予見で見た手のカレンシー (この箱から上へ続く「打たない」の箱の親の手) */
export function seenCurrencies(doc: TreeDoc, id: string): string[] {
  const out: string[] = [];
  for (let b = doc.boxes[id]; b?.seen && b.parent; b = doc.boxes[b.parent]) {
    const h = doc.boxes[b.parent]?.hand;
    if (h) out.push(h.currency);
  }
  return out;
}

/** 「打たない」の箱で、予見で見た手と同じカレンシーを持った時の理由 (予見の結果は決まっているので、打っても見た結果と同じ。木では別の乱数になるので打たせない) */
export function foreseeBlock(doc: TreeDoc, id: string, key: string): string | null {
  return seenCurrencies(doc, id).includes(key) ? tr("予見で見た手と同じ (打つと見た結果になる。打つなら打たないを外す)", "Same as the foreseen craft (it would give the foreseen result; unmark Not used to use it)") : null;
}
