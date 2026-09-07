/**
 * ユニーク行のホバーオーバーレイ + 行クリックでの trade2 検索
 *
 * CraftDiscoveryV2B.vue から切り出し (2026-09-07)。
 */
import { ref, watch, type Ref } from "vue";
import type { SlotKey, UniqueUsage } from "../../services/craft-v2/types";
import { openTrade2ForUnique } from "../../services/trade2/open";
import { pushWarn } from "../../state/craft-v2-store";

export function useUniqueHover(deps: {
  activeSlot: Ref<SlotKey>;
  activeAscendancyId: Ref<string>;
  /** MOD 一括検索と共有する二重起動ガード */
  searching: Ref<boolean>;
  leagueName: () => string;
}) {
  const hoveredUnique = ref<UniqueUsage | null>(null);
  const hoverX = ref<number>(0);
  const hoverY = ref<number>(0);

  function showUniqueTooltip(u: UniqueUsage, ev: MouseEvent): void {
    hoveredUnique.value = u;
    hoverX.value = ev.clientX;
    hoverY.value = ev.clientY;
  }
  function moveUniqueTooltip(ev: MouseEvent): void {
    if (!hoveredUnique.value) return;
    hoverX.value = ev.clientX;
    hoverY.value = ev.clientY;
  }
  function hideUniqueTooltip(): void {
    hoveredUnique.value = null;
  }
  function clearHover(): void {
    hoveredUnique.value = null;
    hoverX.value = 0;
    hoverY.value = 0;
  }

  // スロット / アセ切替後に前画面の tooltip が残る (mouseleave がカード破棄で発火しない) のを防ぐ
  watch([deps.activeSlot, deps.activeAscendancyId], clearHover);

  async function searchUniqueOnTrade2(u: UniqueUsage): Promise<void> {
    if (deps.searching.value) return;
    // ブラウザを開いた直後にアプリへ戻ったとき tooltip が残らないよう、成否に関わらずクリア
    clearHover();
    deps.searching.value = true;
    try {
      // 正式名 (representative.name) を優先、無ければ typeLine、それも 400 なら baseType で fallback
      const tradeName = u.representative?.name || u.nameEn;
      await openTrade2ForUnique({ nameEn: tradeName, league: deps.leagueName(), baseType: u.representative?.baseType });
    } catch (e) {
      console.warn("[CraftDiscoveryV2B] unique trade2 search failed:", e);
      pushWarn("warn", "trade2 検索失敗: " + (e instanceof Error ? e.message : String(e)), "trade2-search");
    } finally {
      hoveredUnique.value = null;
      deps.searching.value = false;
    }
  }

  return { hoveredUnique, hoverX, hoverY, showUniqueTooltip, moveUniqueTooltip, hideUniqueTooltip, searchUniqueOnTrade2 };
}
