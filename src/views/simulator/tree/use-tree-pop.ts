/**
 * use-tree-pop.ts — 縮めて見ている時に押した箱の編集のポップアップ (等倍、箱でできる事が全部)。SimTreePage.vue から分けた (中の動きは同じ)。
 * 置き場は押した箱の真ん中に重ねる。枠はページの zoom を打ち消しているので、実ピクセル ÷ ページの zoom
 */
import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue";
import { BOX_H, BOX_W, type TreeBox as Box, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { useDismiss } from "../../../utils/use-dismiss";
import type { useTreeFlow } from "./use-tree-flow";
import { flag } from "../../../web/release-flags";

export function useTreePop(doc: Ref<TreeDoc>, v: ReturnType<typeof useTreeFlow>) {
  const { viewOnly, pageZ } = v;
  const pop = ref<string | null>(null);
  const popEl = ref<HTMLElement | null>(null);
  useDismiss(() => !!pop.value, [popEl], () => { pop.value = null; });
  watch(viewOnly, (on) => { if (!on) pop.value = null; });
  /** 浮き窓の大きさ (ページの CSS ピクセル) */
  const popSize = ref({ w: 0, h: 0 });
  /** 中の箱の本当の高さ (MOD の多い箱は最低の高さ BOX_H より高い)。スイッチ treePopFit: 窓の中の枠をこの高さにして、窓の地と置き場の数えが箱の下の「完成」「失敗」まで届く (S-147e2) */
  const boxH = ref(0);
  const popBoxH = computed(() => (flag("treePopFit") ? Math.max(BOX_H, boxH.value) : BOX_H));
  const popRo = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => { const e = popEl.value; if (e) { popSize.value = { w: e.offsetWidth, h: e.offsetHeight }; boxH.value = e.querySelector<HTMLElement>("[data-tree-box-wrap]")?.offsetHeight ?? 0; } });
  watch(popEl, (el) => { popRo?.disconnect(); if (el) { popRo?.observe(el); const w = el.querySelector("[data-tree-box-wrap]"); if (w) popRo?.observe(w); } else { popSize.value = { w: 0, h: 0 }; boxH.value = 0; } }, { flush: "post" });
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
    // スイッチ treePopFit (S-147j): 下の限りは木の枠の下の端、未設定の帯が出ていれば帯の上 (窓の高さは箱の本当の高さ込み = popBoxH)
    if (flag("treePopFit")) {
      const fr = popEl.value?.offsetParent as HTMLElement | null, bar = fr?.querySelector<HTMLElement>("[data-tree-unset-bar]")?.parentElement;
      const bottom = bar ? bar.offsetTop : fr?.clientHeight;
      if (bottom) top = Math.max(8, Math.min(top, bottom - ph - 8));
    }
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
  return { pop, popEl, popStyle, popDo, popBoxH };
}
