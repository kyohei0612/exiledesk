/**
 * 組んでいる間の兄弟の順の控え (S-142g)。兄弟の順そのものは tree-place-wide の wideOrder (S-142j ③)。
 * 前の順 S-142e (スイッチ treeDoneLeft) は treeWideFit の下で通らないので 11-14 に外した
 */
/** 組んでいる間の兄弟の順の控え (S-142g): 親の箱 → 前に並べた時の子の順 (もう無い箱も場所取りに残す) */
export type KeptOrder = Map<string, string[]>;

/**
 * (S-142g) 組んでいる間は、もう並んでいる兄弟の横の順を入れ替えない。ideal = 今の決まりどおりの順 (S-142d・S-142e)。
 * 前に並べた兄弟は前の順のまま、新しい箱だけ ideal で 1 つ前に来る兄弟のすぐ右 (前が無ければ左端) に足す。
 * 控えが無い親 (開いた時・手を付けたばかり) は ideal のまま。控えを空にするのは木を開いた時だけ (use-row-settle)
 */
export function keepOrder(kept: KeptOrder, parent: string, ideal: string[]): string[] {
  const was = kept.get(parent);
  if (!was) { kept.set(parent, [...ideal]); return ideal; }
  const list = [...was], at = new Set(was);
  ideal.forEach((k, i) => {
    if (at.has(k)) return;
    let prev: string | undefined;
    for (let j = i - 1; j >= 0 && !prev; j--) if (at.has(ideal[j]!)) prev = ideal[j];
    list.splice(prev ? list.indexOf(prev) + 1 : 0, 0, k);
    at.add(k);
  });
  kept.set(parent, list);
  const now = new Set(ideal);
  return list.filter((k) => now.has(k));
}
