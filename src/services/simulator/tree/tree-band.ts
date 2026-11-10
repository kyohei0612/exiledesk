/**
 * tree-band.ts — 削減の手前の枠を「1 つの箱 + 下の帯」で見せる (S-65c ⑫、スイッチ whittleBands。11-10 オーナーが案 ③ に決めた:
 * 「下の枠に帯が汎用性高そう。それぞれ線伸ばしたらええやんね クリックしたらカードが出れば…下に枠が形成される仕組みが一番いいかもな」)。
 * データ (枠ごとの兄弟の箱・保存の札・回す人の行き先) は今のまま。見せ方だけ:
 *  - 同じ組 (tree-whittle-scene の frameGroupKey) の枠のうち 低い → 同じ → 高い の先頭の箱 (帯の頭) だけを描き、箱の下に枠ごとの帯を並べる
 *  - ほかの枠の箱は描かない (帯の頭に入る)。手と子は持ったまま、線はその枠の帯の真下から引く (手の名前は帯の中、札は出さない)
 *  - 並べ方では描かない枠の箱は幅 0 の列 (子の部分木はその下)
 */
import { flag } from "../../../web/release-flags";
import type { TreeBox, TreeDoc } from "./tree-model";
import { LV_ORDER, lvPart, type LvClass } from "./tree-whittle";
import { frameSiblings } from "./tree-whittle-scene";

/** 帯で見せるか (スイッチ) */
export const bandsOn = (): boolean => flag("whittleBands");

/** 枠の組の帯 (低い → 同じ → 高い の順)。箱 id が枠でなければ空 */
export function bandsOf(d: TreeDoc, id: string): Array<{ id: string; lv: LvClass }> {
  const b = d.boxes[id];
  if (!b || !lvPart(b.junkKey)) return [];
  return frameSiblings(d, id).map((x) => ({ id: x.id, lv: lvPart(x.junkKey)! })).filter((x) => !!x.lv).sort((a, z) => LV_ORDER.indexOf(a.lv) - LV_ORDER.indexOf(z.lv));
}
/** 帯の頭 (描く箱) の id。枠でない・スイッチが閉じていれば自分 */
export function bandHead(d: TreeDoc, id: string): string {
  if (!bandsOn()) return id;
  const bs = bandsOf(d, id);
  return bs.length > 1 ? bs[0]!.id : id;
}
/** 描かない枠の箱 (帯の頭に入る) */
export const bandAway = (d: TreeDoc, b: TreeBox | undefined): boolean => !!b && bandHead(d, b.id) !== b.id;
/** 帯の頭の箱なら帯の並び (2 つ以上)、ほかは空 */
export function headBands(d: TreeDoc, id: string): Array<{ id: string; lv: LvClass }> {
  if (!bandsOn()) return [];
  const bs = bandsOf(d, id);
  return bs.length > 1 && bs[0]!.id === id ? bs : [];
}
/** 帯の高さ (箱の下に足す、TreeBox の帯の行と同じ) */
export const BAND_H = 52;
/** 帯の真ん中の x (箱の左からの差)。帯の幅は箱の幅を帯の数で割った物 */
export const bandMidX = (boxW: number, i: number, n: number): number => (boxW / n) * (i + 0.5);
