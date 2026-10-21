/**
 * use-tree-merge.ts — SimTreePage のまとめた見え方の動き (2026-10-22、SimTreePage が 500 行を超えるので分けた): 札から行き先へ流れ込む線
 * (tree-merge.ts の mergeReqs → tree-lines の routeBacks、同じ行き先は束ねる)・&lines=a の「線を全部表示」・乗せている箱とホバーのカード
 */
import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import type { TreeBox, TreeDoc } from "../../../services/simulator/tree/tree-model";
import { routeBacks, type Seg } from "./tree-lines";
import { mergeReqs, sizeOf } from "./tree-merge";

export function useTreeMerge(o: {
  doc: Ref<TreeDoc>; pills: ComputedRef<Set<string>>; posOf: (b: TreeBox) => { x: number; y: number }; segs: () => Seg[];
  chipW: Ref<Record<string, number>>; inv: ComputedRef<number>;
  /** カードを出さない・消す時 (引っ張っている・画面が動いた・欄を開いた) */ busy: () => boolean; reset: () => unknown;
}) {
  const merged = computed(() => {
    const d = o.doc.value;
    const pos = (id: string) => ({ ...o.posOf(d.boxes[id]!), ...sizeOf(o.pills.value, id) });
    const chip = (id: string): number | null => { const b = d.boxes[id]!; return b.hand && b.outs.length ? (o.chipW.value[id] ?? 120) * o.inv.value : null; };
    const { reqs, lines } = mergeReqs(d, o.pills.value, pos, chip);
    return { lines, paths: routeBacks(reqs, Object.keys(d.boxes).map(pos), o.segs(), { bundle: true }) };
  });
  /** 帯の「線を全部表示」(このブラウザに覚える) */
  const KEY = "exiledesk.tree.lines-all";
  const linesAll = ref((() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } })());
  watch(linesAll, (on) => { try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* 覚えられなくても使える */ } });
  /** 乗せている箱・札 (線を濃く) と、少し待ってから出すホバーのカード */
  const hoverBox = ref<string | null>(null);
  const cardBox = ref<string | null>(null);
  let t = 0;
  watch(hoverBox, (id) => { clearTimeout(t); cardBox.value = null; if (id && !o.pills.value.has(id)) t = window.setTimeout(() => { if (hoverBox.value === id && !o.busy()) cardBox.value = id; }, 350); });
  watch(o.reset, () => { cardBox.value = null; });
  return { merged, linesAll, hoverBox, cardBox };
}
