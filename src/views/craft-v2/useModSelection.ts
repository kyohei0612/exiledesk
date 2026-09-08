/**
 * MOD のチェック選択 / ティア指定 / trade2 一括検索
 *
 * CraftDiscoveryV2B.vue から切り出し (2026-09-07)。
 *   - クリックで toggle、選択 MOD は rawTemplate の Set で管理
 *   - 同 group の既選択は自動解除 (排他)、prefix / suffix 各 3 個上限
 *   - 新規選択時は使用率どおりのティア (usageTier、無ければ inferredTier) をデフォルトにする
 *   - 検索ボタンで stat ID に逆引き → trade2_search → ブラウザで開く
 */
import { computed, ref, watch, type Ref } from "vue";
import type { ModEntry, SlotKey, SlotMods } from "../../services/craft-v2/types";
import { openTrade2ForSelectedMods } from "../../services/trade2/open";
import { pushWarn } from "../../state/craft-v2-store";
import { MAX_AFFIX_PER_ITEM } from "./helpers";

export function useModSelection(deps: {
  activeSlot: Ref<SlotKey>;
  activeAscendancyId: Ref<string>;
  activeSlotMods: Ref<SlotMods>;
  /** trade2 に投げるリーグ (snapshot_name、kebab-case) */
  leagueName: () => string;
}) {
  const selectedMods = ref<Set<string>>(new Set());
  /** MOD ごとの「選択ティア index」(0-based、mod.tiers の index)。未設定 = 制限なし。 */
  const selectedTierIdxByMod = ref<Record<string, number>>({});
  /** 一括ティア dropdown の値 (0 = 制限なし、1..10 = T1..T10) */
  const bulkTierValue = ref<number>(0);
  /** trade2 検索の二重起動ガード (ユニーク行クリックと共有する) */
  const searching = ref<boolean>(false);

  // スロット / アセンダンシー切替で選択をリセット (混在検索防止)
  watch([deps.activeSlot, deps.activeAscendancyId], () => {
    selectedMods.value = new Set();
    selectedTierIdxByMod.value = {};
    bulkTierValue.value = 0;
  });

  function isModSelected(mod: ModEntry): boolean {
    return selectedMods.value.has(mod.rawTemplate);
  }

  /** 表示中の全 MOD (prefix + suffix) の rawTemplate → ModEntry (排他 group 検出用) */
  const allVisibleModsByTpl = computed<Map<string, ModEntry>>(() => {
    const m = new Map<string, ModEntry>();
    for (const e of deps.activeSlotMods.value.prefix) m.set(e.rawTemplate, e);
    for (const e of deps.activeSlotMods.value.suffix) m.set(e.rawTemplate, e);
    return m;
  });

  const prefixTplSet = computed<Set<string>>(() => new Set(deps.activeSlotMods.value.prefix.map((m) => m.rawTemplate)));
  const suffixTplSet = computed<Set<string>>(() => new Set(deps.activeSlotMods.value.suffix.map((m) => m.rawTemplate)));
  const countIn = (set: Set<string>): number => {
    let n = 0;
    for (const tpl of selectedMods.value) if (set.has(tpl)) n++;
    return n;
  };
  const prefixLimitReached = computed<boolean>(() => countIn(prefixTplSet.value) >= MAX_AFFIX_PER_ITEM);
  const suffixLimitReached = computed<boolean>(() => countIn(suffixTplSet.value) >= MAX_AFFIX_PER_ITEM);

  /** 同 affix 既選択 3 個に達してたら、未選択 mod のチェックを禁止する */
  function isModCheckDisabled(mod: ModEntry): boolean {
    if (isModSelected(mod)) return false;
    if (prefixTplSet.value.has(mod.rawTemplate)) return prefixLimitReached.value;
    if (suffixTplSet.value.has(mod.rawTemplate)) return suffixLimitReached.value;
    return false;
  }

  function toggleModSelect(mod: ModEntry): void {
    const next = new Set(selectedMods.value);
    const nextTiers: Record<string, number> = { ...selectedTierIdxByMod.value };
    if (next.has(mod.rawTemplate)) {
      next.delete(mod.rawTemplate);
      delete nextTiers[mod.rawTemplate];
      selectedMods.value = next;
      selectedTierIdxByMod.value = nextTiers;
      return;
    }

    const isPrefix = prefixTplSet.value.has(mod.rawTemplate);
    const isSuffix = suffixTplSet.value.has(mod.rawTemplate);
    if ((isPrefix && prefixLimitReached.value) || (isSuffix && suffixLimitReached.value)) {
      const affixLabel = isPrefix ? "プレフィックス" : "サフィックス";
      pushWarn("warn", `${affixLabel}は 1 装備に最大 ${MAX_AFFIX_PER_ITEM} 個までです (POE2 mod 枠制限)`, "mod-select");
      return;
    }

    // 同 group の既選択を探して自動解除
    const newGroups = mod.groupIds ?? [];
    if (newGroups.length > 0) {
      const ousted: string[] = [];
      const lookup = allVisibleModsByTpl.value;
      for (const tpl of [...next]) {
        if (tpl === mod.rawTemplate) continue;
        const other = lookup.get(tpl);
        if (!other || !other.groupIds || other.groupIds.length === 0) continue;
        if (other.groupIds.some((g) => newGroups.includes(g))) {
          next.delete(tpl);
          delete nextTiers[tpl];
          ousted.push(other.text || tpl);
        }
      }
      if (ousted.length > 0) {
        pushWarn("info", `同カテゴリの選択を自動解除しました: ${ousted.join(" / ")}`, "mod-select");
      }
    }
    next.add(mod.rawTemplate);
    // 新規選択時、使用率どおりのティア (最頻) をデフォルトにセット。算出不可なら平均ベース。
    const defaultTier = mod.usageTier ?? mod.inferredTier;
    if (defaultTier && mod.tiers && mod.tiers.length > 0) {
      const idx = defaultTier - 1;
      if (idx >= 0 && idx < mod.tiers.length) nextTiers[mod.rawTemplate] = idx;
    }
    selectedMods.value = next;
    selectedTierIdxByMod.value = nextTiers;
  }

  function clearSelectedMods(): void {
    selectedMods.value = new Set();
    selectedTierIdxByMod.value = {};
    bulkTierValue.value = 0;
  }

  /** ティア dropdown: idx === -1 = 「制限なし」 */
  function setModTier(mod: ModEntry, idx: number): void {
    const next = { ...selectedTierIdxByMod.value };
    if (idx < 0 || !mod.tiers || idx >= mod.tiers.length) delete next[mod.rawTemplate];
    else next[mod.rawTemplate] = idx;
    selectedTierIdxByMod.value = next;
  }

  function getModTierIdx(mod: ModEntry): number {
    const v = selectedTierIdxByMod.value[mod.rawTemplate];
    return typeof v === "number" ? v : -1;
  }

  /** 選択中の全 MOD のティアを bulkTierValue (1-based) に揃える。無いティアは最低ティア、0 は制限なし。 */
  function applyBulkTier(): void {
    const t = bulkTierValue.value;
    if (selectedMods.value.size === 0) return;
    const allMods = [...deps.activeSlotMods.value.prefix, ...deps.activeSlotMods.value.suffix];
    const next: Record<string, number> = { ...selectedTierIdxByMod.value };
    for (const mod of allMods) {
      if (!selectedMods.value.has(mod.rawTemplate)) continue;
      if (t === 0) {
        delete next[mod.rawTemplate];
        continue;
      }
      if (!mod.tiers || mod.tiers.length === 0) continue;
      const idx = t - 1;
      next[mod.rawTemplate] = idx < mod.tiers.length ? idx : mod.tiers.length - 1;
    }
    selectedTierIdxByMod.value = next;
  }

  async function searchSelectedMods(): Promise<void> {
    if (selectedMods.value.size === 0) return;
    if (searching.value) return;
    searching.value = true;
    try {
      const all = [...deps.activeSlotMods.value.prefix, ...deps.activeSlotMods.value.suffix];
      const chosen = all.filter((m) => selectedMods.value.has(m.rawTemplate));
      if (chosen.length === 0) return;

      const tierMinByMod: Record<string, number> = {};
      for (const mod of chosen) {
        const idx = selectedTierIdxByMod.value[mod.rawTemplate];
        if (typeof idx === "number" && mod.tiers && mod.tiers[idx]) {
          // 下限は全 stat の最低ロール平均 (trade2 の "Adds # to #" は平均値で絞る)
          tierMinByMod[mod.rawTemplate] = mod.tiers[idx].filterMin ?? mod.tiers[idx].min;
        }
      }
      try {
        const r = await openTrade2ForSelectedMods({
          selectedMods: chosen,
          slot: deps.activeSlot.value,
          league: deps.leagueName(),
          tierMinByMod,
        });
        if (r.missingMods.length > 0) {
          pushWarn("warn", `[trade2] stat ID 未マッピングでスキップした MOD: ${r.missingMods.join(" / ")}`, "trade2-search");
        }
      } catch (e) {
        console.warn("[CraftDiscoveryV2B] trade2 search failed:", e);
        pushWarn("warn", "trade2 検索失敗: " + (e instanceof Error ? e.message : String(e)), "trade2-search");
      }
    } finally {
      searching.value = false;
    }
  }

  return {
    selectedMods,
    bulkTierValue,
    searching,
    isModSelected,
    isModCheckDisabled,
    toggleModSelect,
    clearSelectedMods,
    setModTier,
    getModTierIdx,
    applyBulkTier,
    searchSelectedMods,
  };
}
