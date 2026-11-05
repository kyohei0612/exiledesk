/**
 * tree-foresee.ts — ヒネコラの髪束の予見を木で組む (S-39、開発版だけ。11-05 オーナー「普通にヒネコラ打って次の枠は予見の結果によるものすべて表示でおｋだよ
 * ただ枠を紫にしようかヒネコラで持ってる挙動」)。予見はエンジンの印 (apply-extra の hinekora = StageItem.foreseen、アイテムを変えると消える)。
 * 木は動きも組み方も足さない (手はエンジンの applyCurrency を 1 回ずつ、結果の箱はいつもの分け方)。違うのは見た目だけ: ヒネコラで持っている所の枠を紫に
 */
import type { TreeDoc } from "./tree-model";
import { DEV_BUILD } from "../../../web/release-flags";

/** 開発版だけ (オーナーの OK の後に本番へ出す時はデザイン部に release-flags のスイッチを頼む。棚のヒネコラ・神、紫の枠がこれを見る) */
export const FORESEE_ON = DEV_BUILD;

/** ヒネコラの結果の箱 (予見したアイテム。ここの手は「持つ」) */
export function holdsAt(doc: TreeDoc, id: string): boolean {
  const b = doc.boxes[id], p = b?.parent ? doc.boxes[b.parent] : undefined;
  return FORESEE_ON && !!b && p?.hand?.currency === "hinekora";
}

/** 予見で見えた結果の箱 (ヒネコラの結果の箱に持った手の結果) */
export const foreseenAt = (doc: TreeDoc, id: string): boolean => { const p = doc.boxes[id]?.parent; return !!p && holdsAt(doc, p); };
