/**
 * use-row-fit.ts — 同じ段の箱の縦の大きさを揃える (S-141b、スイッチ rowFit。10-28 深夜オーナー「枠の大きさで縦幅変わるなら大きい奴に合わせた方が良いかもね 見栄え的に」)。
 * 箱ごとの中身だけの高さ (下の行を下へ寄せる前の高さ) を TreeBox が測ってここに置き、同じ段 (深さ) で一番高い値をその段の箱の最低の高さにする。
 * 中身は上詰め、下の行 (完成・失敗・↩ の札・✎ ×) は TreeBox で箱の下の辺へ寄せる。品質だけの箱 (pass) は揃えない
 */
import { reactive } from "vue";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { depthRows } from "../../../services/simulator/tree/tree-row-tops";

const natural = reactive(new Map<string, number>());
/** 箱の中身だけの高さを置く (変わった時だけ) */
export function setNatural(id: string, h: number): void { if (natural.get(id) !== h) natural.set(id, h); }
/** その箱の段で一番高い中身の高さ (段の箱が測れていなければ 0) */
export function rowFitOf(d: TreeDoc, id: string): number {
  const rows = depthRows(d), r = rows.get(id);
  if (r == null) return 0;
  let max = 0;
  for (const [x, rr] of rows) if (rr === r && d.boxes[x]?.out !== "pass") max = Math.max(max, natural.get(x) ?? 0);
  return max;
}
