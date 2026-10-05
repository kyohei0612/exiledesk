/**
 * fit-card.ts — 浮かぶカードを窓の中に収める (2026-10-05)
 *
 * オーナー「カードが表示時に枠内で収まるように。これはグローバルで設定してるはず」。装備のカード (GameItemCard.vue) と同じ決まり:
 * 実際の高さを測って、下にはみ出すなら上へずらし、それでも窓より高ければ縮める。右に入らなければ左へ。
 * 座標は拡大前の CSS ピクセル ([[zoom.ts]] の toCss)。クラフトステージの棚のカード・ユニークのツールチップが使う
 */
import { computed, ref, watch, type Ref } from "vue";
import { toCss } from "./zoom";

export const CARD_EDGE = 12;

/** 置きたい所: 基準の左右 (左右どちらかに出す) と上。どれも CSS ピクセル */
export interface CardAnchor { left: number; right: number; top: number }

export function useFitCard(el: Ref<HTMLElement | null>, anchor: () => CardAnchor, width: number, gap = 8) {
  const height = ref(0);
  watch(el, (node, _old, onCleanup) => {
    if (!node) { height.value = 0; return; }
    height.value = node.offsetHeight;
    const ro = new ResizeObserver(() => (height.value = node.offsetHeight));
    ro.observe(node);
    onCleanup(() => ro.disconnect());
  }, { immediate: true });
  return computed(() => {
    const vw = toCss(window.innerWidth);
    const vh = toCss(window.innerHeight);
    const scale = height.value > 0 ? Math.min(1, (vh - CARD_EDGE * 2) / height.value) : 1;
    const w = width * scale, h = height.value * scale;
    const a = anchor();
    let left = a.right + gap;
    if (left + w + CARD_EDGE > vw) left = Math.max(CARD_EDGE, a.left - w - gap);
    const top = Math.max(CARD_EDGE, Math.min(a.top, vh - h - CARD_EDGE));
    return {
      left: `${left}px`,
      top: `${top}px`,
      // 測り終わるまでは見せない (1 回目に下へはみ出した位置で一瞬出ないように)
      visibility: height.value > 0 ? ("visible" as const) : ("hidden" as const),
      ...(scale < 1 ? { transform: `scale(${scale})`, transformOrigin: "top left" } : {}),
    };
  });
}
