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
/** 帯の手の比べ (札を 1 つにまとめる時の同じ手。見本で変わる品質・個数は見ない) */
const handKey = (b: TreeBox): string | null => {
  const h = b.hand;
  return !h ? null : JSON.stringify([h.currency, [...h.omens].sort(), h.catalyst, !!h.free, !!h.noUse, !!h.useHeld, (h.keep ?? []).map((a) => JSON.stringify(a)).sort()]);
};
/**
 * 同じ手の帯の組 (11-11 オーナー追い 6「3本とりあえず線をカオス削減に入れてから広がってもいいかも」): 帯の頭の並びのうち、この枠と同じ手の枠 (低い → 高い の順)。
 * 手の無い枠・帯でない箱は [自分] だけ。線はこの組で 1 つの札に入れてから結果の箱へ広げる (use-tree-edges)
 */
export function bandGroup(d: TreeDoc, id: string): string[] {
  const b = d.boxes[id], k = b ? handKey(b) : null;
  // 同じ手でもまとめず枠ごとに 1 本ずつ (S-65c ⑫、11-12 オーナー「この枠からでる削減をまとめずに枝だけわけるっていみ」、スイッチ treeLaneOwnHand)
  if (!k || flag("treeLaneOwnHand")) return [id];
  const bs = headBands(d, bandHead(d, id));
  return bs.length > 1 ? bs.map((x) => x.id).filter((x) => handKey(d.boxes[x]!) === k) : [id];
}
/**
 * 兄弟の並びで、帯の枠を帯の頭のすぐ右に 低い → 同じ → 高い の順で寄せる (S-65c ⑫、スイッチ treeLaneOwnHand)。
 * 1 つの箱 + 帯で見せる枠どうしが、兄弟の並べ替え (完成へ続く枝を左へ = S-142e、組んでいる間の順 = S-142g) で離れると、
 * 枠ごとの手の札と結果の箱が帯から箱いくつ分も遠くに出た (オーナーの木で 同じ・高い の結果が帯の箱の 2,000 以上左)。帯の無い並びはそのまま返す
 */
export function bandsTogether(d: TreeDoc, ks: string[]): string[] {
  if (!flag("treeLaneOwnHand") || !ks.some((k) => headBands(d, k).length > 1)) return ks;
  const away = new Set(ks.filter((k) => bandAway(d, d.boxes[k])));
  return ks.filter((k) => !away.has(k)).flatMap((k) => { const bs = headBands(d, k).map((x) => x.id).filter((x) => x === k || away.has(x)); return bs.length > 1 ? bs : [k]; });
}
/** 結果の箱がどの帯から来たか (まとめた箱の分も、低い → 高い の順)。帯から来ていなければ空 (追い 6「結果の箱にどの帯から来たかは読めるように」) */
export function bandsInto(d: TreeDoc, id: string, mergedFrom: (d: TreeDoc, b: TreeBox) => boolean): LvClass[] {
  if (!bandsOn()) return [];
  const own = d.boxes[id];
  if (!own) return [];
  const from = [own, ...Object.values(d.boxes).filter((b) => b.back === id && mergedFrom(d, b))];
  const out = new Set<LvClass>();
  for (const c of from) {
    const p = c.parent ? d.boxes[c.parent] : undefined;
    if (p && headBands(d, bandHead(d, p.id)).length > 1) { const lv = lvPart(p.junkKey); if (lv) out.add(lv); }
  }
  return LV_ORDER.filter((x) => out.has(x));
}
