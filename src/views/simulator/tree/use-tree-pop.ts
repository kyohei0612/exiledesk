/**
 * use-tree-pop.ts — 縮めて見ている時に押した箱の編集のポップアップ (等倍、箱でできる事が全部)。SimTreePage.vue から分けた (中の動きは同じ)。
 * 置き場は押した箱の真ん中に重ねる。枠はページの zoom を打ち消しているので、実ピクセル ÷ ページの zoom
 */
import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue";
import { BOX_H, BOX_W, type TreeBox as Box, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { useDismiss } from "../../../utils/use-dismiss";
import type { useTreeFlow } from "./use-tree-flow";

export function useTreePop(doc: Ref<TreeDoc>, v: ReturnType<typeof useTreeFlow>) {
  const { viewOnly, pageZ } = v;
  const pop = ref<string | null>(null);
  const popEl = ref<HTMLElement | null>(null);
  useDismiss(() => !!pop.value, [popEl], () => { pop.value = null; });
  watch(viewOnly, (on) => { if (!on) pop.value = null; });
  /** 浮き窓の大きさ (ページの CSS ピクセル) */
  const popSize = ref({ w: 0, h: 0 });
  const popRo = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => { const e = popEl.value; if (e) popSize.value = { w: e.offsetWidth, h: e.offsetHeight }; });
  watch(popEl, (el, old) => { if (old) popRo?.unobserve(old); if (el) popRo?.observe(el); else popSize.value = { w: 0, h: 0 }; });
  onBeforeUnmount(() => popRo?.disconnect());
  /** ポップアップの置き場 */
  const popStyle = computed(() => {
    const b = pop.value ? doc.value.boxes[pop.value] : null;
    if (!b) return {};
    const { x, y, zoom: z } = v.flow.viewport.value, Z = pageZ.value;
    // 枠の中に収める (ポップアップの大きさ = 箱 + 余白 12・右 28・下 48)
    const { width: W, height: H } = v.flow.dimensions.value;
    // 大きさは測った物 (中のアイテムの枠で箱より高い。前は箱の最低の高さで見積もり、下の端が右下の倍率の道具にかかった、10-26 モンキー 8 の 5)
    const pw = popSize.value.w || BOX_W + 40, ph = popSize.value.h || BOX_H + 60, top0 = 44 / Z;
    let left = Math.max(8, Math.min(W / Z - pw - 8, ((b.x + BOX_W / 2) * z + x) / Z - BOX_W / 2 - 12));
    let top = Math.max(8, Math.min(top0 + H / Z - ph - 8, ((b.y + BOX_H / 2) * z + y) / Z - BOX_H / 2 - 12));
    // 右下の道具 (ミニマップ・倍率) にかかる時は道具の上へ、上に入らなければ左へ
    // (道具は 10-26 夜から木の枠の外の右の列。枠の中に戻した時のために残す)
    const tools = document.querySelector<HTMLElement>("[data-tree-frame] [data-tree-tools]");
    if (tools) {
      const tl = tools.offsetLeft, tt = tools.offsetTop;
      if (left + pw > tl && top + ph > tt) { if (tt - ph - 8 >= 8) top = tt - ph - 8; else left = Math.max(8, tl - pw - 8); }
    }
    return { left: `${left}px`, top: `${top}px` };
  });
  /** ポップアップの中で押した物は、閉じてからいつもの動きへ */
  function popDo(f: (id: string, b: Box) => void): void { const id = pop.value, b = id ? doc.value.boxes[id] : null; pop.value = null; if (id && b) f(id, b); }
  return { pop, popEl, popStyle, popDo };
}
