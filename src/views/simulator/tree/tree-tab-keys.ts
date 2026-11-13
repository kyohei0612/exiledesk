/**
 * tree-tab-keys.ts — タブごとの変わらない番号 (S-09c、スイッチ tabKeep)。タブの並び (use-tree の tabDocs) は閉じると詰まり、
 * 木の中の tabNo はレシピを開くと替わるので、描き面 (TreeCanvas) をタブに結び付ける番号はここで振る。
 * 並びの変わり目は tree-tab-recipe の 3 つ (替える・閉じる・全部白紙) と同じ所で直す
 */
const keys: number[] = [];
let seq = 0;
/** i 番目のタブの番号 (まだ無ければ振る) */
export function tabKeyAt(i: number): number {
  while (keys.length <= i) keys.push(++seq);
  return keys[i]!;
}
/** タブを閉じた時 (並びを詰める) */
export const dropTabKey = (i: number): void => { keys.splice(i, 1); };
/** 全部のタブを白紙に戻した時 */
export const clearTabKeys = (): void => { keys.length = 0; };
