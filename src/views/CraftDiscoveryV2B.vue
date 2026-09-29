<!--
  CraftDiscoveryV2B.vue — 上位プレイヤーMOD一覧 (poe.ninja 連携)
  ---------------------------------------------------------------------------
  2026-09-07 リファクタ: 1,881 行あった画面を分割した。この画面は配線とレイアウトだけ持つ。
  2026-09-29 作り直し: アセンダンシー → DPS 順のビルド 3 つ (BuildTabs、各 10 人) → 「スキル・持ち物 | 装備」の切り替え
    スキル・持ち物 (BuildLoadout、最初に開く。一番上の定番セットが答え) / 装備 (部位の絵のマス GearGrid → MOD 一覧)。
    集計は全体もビルドも同じ関数 (services/craft-v2/finalize.ts の aggregateOf)。
    views/craft-v2/useCraftV2Derived.ts   選択中アセ / スロットと表示用の派生状態
    views/craft-v2/useModSelection.ts     MOD チェック選択・ティア・trade2 一括検索
    views/craft-v2/useUniqueHover.ts      ユニークのホバー / クリック検索
    views/craft-v2/helpers.ts             定数・表示ヘルパー
    components/craft-v2/*.vue             ヘッダー / 警告履歴 / アセタブ / 検索バー / 各カード
  取得状態は state/craft-v2-store (シングルトン) が持ち、App.vue 起動時から fetch が走る。
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { addToBasket } from "../state/craft-basket";
import { isCraftableBase, prepareCraftData } from "../services/craft-v2/to-craft";
import UniqueTooltip from "../components/decor/UniqueTooltip.vue";
import CraftV2Header from "../components/craft-v2/CraftV2Header.vue";
import WarnHistoryPanel from "../components/craft-v2/WarnHistoryPanel.vue";
import AscendancyTabs from "../components/craft-v2/AscendancyTabs.vue";
import BuildTabs from "../components/craft-v2/BuildTabs.vue";
import GearGrid from "../components/craft-v2/GearGrid.vue";
import ModSearchBar from "../components/craft-v2/ModSearchBar.vue";
import ModListCard from "../components/craft-v2/ModListCard.vue";
import BaseListCard from "../components/craft-v2/BaseListCard.vue";
import UniqueUsageCard from "../components/craft-v2/UniqueUsageCard.vue";
import BuildLoadout from "../components/craft-v2/BuildLoadout.vue";
import { craftV2Store, ensureCraftV2Started, refreshCraftV2, forceRefetchCraftV2 } from "../state/craft-v2-store";
import { useCraftV2Derived } from "./craft-v2/useCraftV2Derived";
import { useModSelection } from "./craft-v2/useModSelection";
import { useUniqueHover } from "./craft-v2/useUniqueHover";

const store = craftV2Store;
const d = useCraftV2Derived();
const leagueName = () => store.snapshot?.snapshot_name ?? "fate-of-the-vaal";
const sel = useModSelection({
  activeSlot: d.activeSlot,
  activeAscendancyId: d.activeAscendancyId,
  activeSlotMods: d.activeSlotMods,
  leagueName,
});
const hover = useUniqueHover({
  activeSlot: d.activeSlot,
  activeAscendancyId: d.activeAscendancyId,
  searching: sel.searching,
  leagueName,
});

/**
 * クラフトのベース (2026-09-29「クラフトに追加 / クラフトへ」)。この部位で上位の人が使っていたレアのベースのうち、
 * 計算機にある物を人数順。部位を変えたら一番多い物に戻す
 */
const craftDataReady = ref(false);
const craftBases = computed(() =>
  craftDataReady.value ? d.sortedBases.value.filter((b) => isCraftableBase(b.nameEn)).map((b) => ({ en: b.nameEn, ja: b.name, count: b.count })) : [],
);
const craftBase = ref("");
watch(craftBases, (list) => {
  if (!list.some((b) => b.en === craftBase.value)) craftBase.value = list[0]?.en ?? "";
}, { immediate: true });
function addCraft(): void {
  const b = craftBases.value.find((x) => x.en === craftBase.value);
  if (!b) return;
  const all = [...d.activeSlotMods.value.prefix, ...d.activeSlotMods.value.suffix];
  const chosen = all.filter((m) => sel.selectedMods.value.has(m.rawTemplate)).map((mod) => ({ mod, tierIdx: sel.getModTierIdx(mod) }));
  addToBasket(b.en, b.ja, chosen);
  sel.clearSelectedMods();
}

/** 見方の切り替え (skillsTab = スキル・持ち物) */
const VIEW_TABS = [
  { key: "loadout", label: "スキル・持ち物", skills: true },
  { key: "gear", label: "装備 (部位ごとの MOD)", skills: false },
] as const;
/** 折りたたむ人数 (この人数以下)。カードの「N 人以下」の表示 */
const lowLimit = computed<number>(() => d.lowThreshold.value - 1);

// 起動時に App.vue が呼んでいるので、ここでは念のため再度呼ぶ (冪等ガード済 = no-op)
onMounted(() => {
  void ensureCraftV2Started();
  void prepareCraftData().then(() => (craftDataReady.value = true));
});
</script>

<template>
  <section class="min-h-full block px-6 py-4 bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)]">
    <CraftV2Header
      :phase-elapsed-secs="d.phaseElapsedSecs.value"
      :progress-fraction="d.progressFraction.value"
      :overall-progress-percent="d.overallProgressPercent.value"
      @refresh="refreshCraftV2"
      @force-refetch="forceRefetchCraftV2"
    />

    <WarnHistoryPanel @retry="refreshCraftV2" />

    <AscendancyTabs v-model:active-ascendancy-id="d.activeAscendancyId.value" :sorted-ascendancies="d.sortedAscendancies.value" />

    <BuildTabs v-if="d.ascendancy.value" v-model="d.activeBuild.value" :asc="d.ascendancy.value" :league-url="store.snapshot?.league_url ?? null" />
    <!-- 見方の切り替え (2026-09-29 UI 見直し: 前は部位のマスの 1 つに紛れていた) -->
    <div v-if="d.activeAscendancy.value" class="mb-3 inline-flex rounded-lg bg-black/30 p-1 ring-1 ring-white/10" role="tablist">
      <button
        v-for="t in VIEW_TABS"
        :key="t.key"
        type="button"
        role="tab"
        :aria-selected="d.skillsTab.value === t.skills"
        class="rounded-md px-4 py-1.5 text-[13px] font-bold transition"
        :class="d.skillsTab.value === t.skills ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white'"
        @click="d.skillsTab.value = t.skills"
      >
        {{ t.label }}
      </button>
    </div>
    <GearGrid v-if="d.activeAscendancy.value && !d.skillsTab.value" v-model:active-slot="d.activeSlot.value" :agg="d.activeAscendancy.value" />

    <ModSearchBar
      v-if="store.ascendancies.length > 0 && !d.skillsTab.value"
      v-model:bulk-tier-value="sel.bulkTierValue.value"
      v-model:craft-base="craftBase"
      :craft-bases="craftBases"
      :selected-count="sel.selectedMods.value.size"
      :searching="sel.searching.value"
      @clear="sel.clearSelectedMods"
      @apply-bulk-tier="sel.applyBulkTier"
      @search="sel.searchSelectedMods"
      @add-craft="addCraft"
    />

    <!-- スクロール可能本体 (アセンダンシータブまでの固定エリアの下) -->
    <div class="flex-1 -mx-6 px-6 pb-2">
      <!-- 初回ロード中 (まだ 0 件) -->
      <div
        v-if="store.ascendancies.length === 0 && store.loading && !store.fatalError"
        class="py-12 text-center text-[var(--exile-color-text-secondary)] text-[13px]"
      >
        <div class="inline-flex items-center gap-2 font-display tracking-[0.08em]">
          <span class="inline-block w-2.5 h-2.5 rounded-full bg-[var(--exile-color-accent-focus)] animate-pulse" aria-hidden="true"></span>
          poe.ninja からアセンダンシー使用率と上位プレイヤー装備を取得しています…
        </div>
        <p class="mt-2 text-[11px] text-[var(--exile-color-text-tertiary)]">初回完了まで 90〜120 秒ほどかかります</p>
      </div>

      <!-- 取得完了したが 0 件 (空状態) — 真っ白防止 -->
      <div
        v-else-if="store.ascendancies.length === 0 && !store.loading && !store.fatalError"
        class="py-12 text-center text-[var(--exile-color-text-secondary)] text-[13px]"
      >
        <div class="font-display tracking-[0.08em]">データが取得できませんでした。</div>
        <p class="mt-2 text-[11px] text-[var(--exile-color-text-tertiary)]">
          poe.ninja に接続できなかった可能性があります。下のボタンで再取得してください。
        </p>
        <button
          type="button"
          @click="refreshCraftV2"
          class="mt-3 px-4 py-1.5 rounded-lg border border-amber-400/50 text-[13px] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] transition-colors"
        >
          <span aria-hidden="true">⟳</span> 更新
        </button>
      </div>

      <!-- スキル・持ち物: 選んだビルドの人のスキル構成 (メイン・サポート・リネージュ) とオーグメントなど (2026-09-29)。
           アセンダンシー全体のスキル使用率は自動ジェム監視へ移した -->
      <BuildLoadout v-if="d.activeAscendancy.value && d.skillsTab.value" :agg="d.activeAscendancy.value" />

      <!-- 本体: prefix / suffix / (ベース) / unique カード。ユニーク優位スロットでは order でユニークを最上段に。 -->
      <div v-if="d.activeAscendancy.value && !d.skillsTab.value" class="flex flex-col gap-4">
        <ModListCard
          affix="P"
          v-model:show-low-count="d.showLowCount.value"
          :mods="d.visiblePrefix.value"
          :total="d.sortedPrefix.value.length"
          :low-count="d.totalLowPrefixCount.value"
          :low-limit="lowLimit"
          :selected-count="sel.selectedMods.value.size"
          :is-selected="sel.isModSelected"
          :is-disabled="sel.isModCheckDisabled"
          :tier-idx="sel.getModTierIdx"
          :pct="d.pct"
          :order-class="d.isMostlyUniqueSlot.value ? 'order-2' : 'order-1'"
          @toggle="sel.toggleModSelect"
          @set-tier="sel.setModTier"
        />
        <ModListCard
          affix="S"
          v-model:show-low-count="d.showLowCount.value"
          :mods="d.visibleSuffix.value"
          :total="d.sortedSuffix.value.length"
          :low-count="d.totalLowSuffixCount.value"
          :low-limit="lowLimit"
          :selected-count="sel.selectedMods.value.size"
          :is-selected="sel.isModSelected"
          :is-disabled="sel.isModCheckDisabled"
          :tier-idx="sel.getModTierIdx"
          :pct="d.pct"
          :order-class="d.isMostlyUniqueSlot.value ? 'order-3' : 'order-2'"
          @toggle="sel.toggleModSelect"
          @set-tier="sel.setModTier"
        />
        <BaseListCard
          v-if="d.showBaseSection.value"
          v-model:show-low-count="d.showLowCount.value"
          :bases="d.visibleBases.value"
          :total="d.sortedBases.value.length"
          :low-count="d.totalLowBasesCount.value"
          :low-limit="lowLimit"
          :slot-label="d.activeSlotLabel.value"
          :pct="d.pct"
          :order-class="d.isMostlyUniqueSlot.value ? 'order-4' : 'order-3'"
        />
        <UniqueUsageCard
          v-model:show-low-count="d.showLowCountUniques.value"
          :uniques="d.visibleUniques.value"
          :total="d.activeUniques.value.length"
          :low-count="d.totalLowUniquesCount.value"
          :low-limit="lowLimit"
          :slot-label="d.activeSlotLabel.value"
          :is-mostly-unique-slot="d.isMostlyUniqueSlot.value"
          :top-unique-count="d.topUniqueCount.value"
          :top-unique-name="d.topUniqueName.value"
          :order-class="d.isMostlyUniqueSlot.value ? 'order-1 ring-1 ring-[var(--exile-color-accent-focus)]/50' : 'order-4'"
          @hover="hover.showUniqueTooltip"
          @move="hover.moveUniqueTooltip"
          @leave="hover.hideUniqueTooltip"
          @select="hover.searchUniqueOnTrade2"
        />
      </div>

      <UniqueTooltip :unique="hover.hoveredUnique.value" :x="hover.hoverX.value" :y="hover.hoverY.value" />

      <footer
        v-if="d.activeAscendancy.value"
        class="mt-4 pt-3 border-t border-[var(--exile-color-border-subtle)] text-[11px] text-[var(--exile-color-text-tertiary)] flex items-center gap-4 flex-wrap"
      >
        <span>サンプル: {{ d.ascendancy.value?.builds?.length ? "このビルドの DPS 上位" : "DPS 上位" }} {{ d.activeAscendancy.value.sampleSize }} 人 (アセンダンシー使用率 {{ d.activeAscendancy.value.usagePercent.toFixed(1) }}%)</span>
        <template v-if="!d.skillsTab.value">
        <span class="inline-flex items-center gap-1">
          <span class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] font-bold leading-none bg-[#9B7BCC]/25 text-[#C7A7E5] ring-1 ring-[#9B7BCC]/50">P</span>
          = プレフィックス
        </span>
        <span class="inline-flex items-center gap-1">
          <span class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] font-bold leading-none bg-[#B8956A]/25 text-[#D6B98A] ring-1 ring-[#B8956A]/50">S</span>
          = サフィックス
        </span>
        <span class="italic">MOD にチェック → 上の「trade2 検索」で一括検索</span>
        </template>
      </footer>
    </div>
  </section>
</template>
