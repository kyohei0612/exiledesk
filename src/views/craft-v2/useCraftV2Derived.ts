/**
 * MOD 一覧画面の派生状態 (store → 画面ローカルの選択 / 絞り込み / 進捗)
 *
 * CraftDiscoveryV2B.vue から切り出し (2026-09-07)。取得状態は craftV2Store が持ち、
 * ここは「どのアセンダンシー / スロットを見ているか」と、その表示用の計算だけ。
 */
import { computed, ref, watch } from "vue";
import type {
  SkillUsage,
  AggregatedAscendancy,
  BaseEntry,
  ModEntry,
  SlotKey,
  SlotMods,
  UniqueUsage,
} from "../../services/craft-v2/types";
import { craftV2Store, nowMs } from "../../state/craft-v2-store";
import { LOW_COUNT_THRESHOLD, SLOT_TABS, TARGET_ASCENDANCY_COUNT } from "./helpers";

export function useCraftV2Derived() {
  const ascendancies = computed(() => craftV2Store.ascendancies);
  /** 上タブで選択中のアセンダンシー id */
  const activeAscendancyId = ref<string>("");
  /** 右上トグルで選択中のスロット */
  const activeSlot = ref<SlotKey>("ring");
  /** 「スキル」タブ (装備スロットの代わりに主流スキルを出す)。2026-09-12 */
  const skillsTab = ref(false);

  const activeAscendancy = computed<AggregatedAscendancy | null>(() => {
    if (ascendancies.value.length === 0) return null;
    return ascendancies.value.find((a) => a.id === activeAscendancyId.value) ?? ascendancies.value[0];
  });

  // 未選択 (空文字) かつ初到着のタイミングだけ最初の id を選ぶ
  watch(
    ascendancies,
    (list) => {
      if (!activeAscendancyId.value && list.length > 0) {
        activeAscendancyId.value = list[0].id;
      }
    },
    { immediate: true },
  );

  /** 使用率降順 (Rust 側も降順 emit するが並列受信時のブレを防ぐため UI 側でも明示 sort) */
  const sortedAscendancies = computed(() =>
    [...ascendancies.value].sort((a, b) => b.usagePercent - a.usagePercent),
  );

  const activeSlotMods = computed<SlotMods>(() => {
    const a = activeAscendancy.value;
    if (!a) return { prefix: [], suffix: [], bases: [] };
    return a[activeSlot.value];
  });

  /** 現在の activeSlot に装備されているユニークのみ (古いキャッシュで uniquesBySlot が無ければ空) */
  const activeUniques = computed<UniqueUsage[]>(() => {
    const a = activeAscendancy.value;
    if (!a) return [];
    return a.uniquesBySlot?.[activeSlot.value] ?? [];
  });

  const activeSlotLabel = computed<string>(() => SLOT_TABS.find((t) => t.key === activeSlot.value)?.label ?? "");
  /** 選択中アセのスキル使用率 (古いキャッシュでは空) */
  const activeSkills = computed<SkillUsage[]>(() => activeAscendancy.value?.skills ?? []);
  /** 選択中アセの poe.ninja スキル使用率 (そのクラスの全キャラ、古いキャッシュでは null) */
  const activeNinjaSkills = computed(() => activeAscendancy.value?.ninjaSkills ?? null);

  // ---- 低カウント折りたたみ (アセンダンシー × スロット 別に独立した state) ----
  const expandKey = computed<string>(() => `${activeAscendancyId.value}::${activeSlot.value}`);
  const showLowCountByKey = ref<Record<string, boolean>>({});
  const showLowCount = computed<boolean>({
    get: () => showLowCountByKey.value[expandKey.value] ?? false,
    set: (v: boolean) => {
      showLowCountByKey.value = { ...showLowCountByKey.value, [expandKey.value]: v };
    },
  });
  const showLowCountUniquesByKey = ref<Record<string, boolean>>({});
  const showLowCountUniques = computed<boolean>({
    get: () => showLowCountUniquesByKey.value[expandKey.value] ?? false,
    set: (v: boolean) => {
      showLowCountUniquesByKey.value = { ...showLowCountUniquesByKey.value, [expandKey.value]: v };
    },
  });

  // 既に集計時に降順ソート済みだが、防御的に再ソート
  const sortedPrefix = computed<ModEntry[]>(() => [...activeSlotMods.value.prefix].sort((a, b) => b.count - a.count));
  const sortedSuffix = computed<ModEntry[]>(() => [...activeSlotMods.value.suffix].sort((a, b) => b.count - a.count));
  const sortedBases = computed<BaseEntry[]>(() => [...activeSlotMods.value.bases].sort((a, b) => b.count - a.count));

  const visible = <T extends { count: number }>(list: T[], show: boolean): T[] =>
    show ? list : list.filter((m) => m.count >= LOW_COUNT_THRESHOLD);
  const lowCount = (list: Array<{ count: number }>): number => list.filter((m) => m.count < LOW_COUNT_THRESHOLD).length;

  const visiblePrefix = computed(() => visible(sortedPrefix.value, showLowCount.value));
  const visibleSuffix = computed(() => visible(sortedSuffix.value, showLowCount.value));
  const visibleBases = computed(() => visible(sortedBases.value, showLowCount.value));
  const visibleUniques = computed(() => visible(activeUniques.value, showLowCountUniques.value));
  const totalLowPrefixCount = computed(() => lowCount(sortedPrefix.value));
  const totalLowSuffixCount = computed(() => lowCount(sortedSuffix.value));
  const totalLowBasesCount = computed(() => lowCount(sortedBases.value));
  const totalLowUniquesCount = computed(() => lowCount(activeUniques.value));

  /**
   * ベースセクションを描画するスロット (オーナー指示: アミュレット / 指輪 のみ)。
   * 2026-09-12: スキルを付与するベース (王笏など) が集計に出ているスロットでも描画する。
   */
  const showBaseSection = computed<boolean>(
    () =>
      activeSlot.value === "ring" ||
      activeSlot.value === "amulet" ||
      sortedBases.value.some((b) => (b.skills?.length ?? 0) > 0),
  );

  /**
   * レアに表示すべき MOD が無いスロット (prefix / suffix とも 0 件、折りたたみ状態) で、
   * ユニーク採用が主流閾値以上なら「ユニーク優位」としてユニークカードを最上段に出す。
   */
  const isMostlyUniqueSlot = computed<boolean>(() => {
    if (showLowCount.value) return false;
    const topCount = activeUniques.value[0]?.count ?? 0;
    return visiblePrefix.value.length === 0 && visibleSuffix.value.length === 0 && topCount >= LOW_COUNT_THRESHOLD;
  });
  const topUniqueCount = computed<number>(() => activeUniques.value[0]?.count ?? 0);
  const topUniqueName = computed<string>(
    () => activeUniques.value[0]?.name ?? activeUniques.value[0]?.nameEn ?? "",
  );

  // ---- 進捗 ----
  /** 取得済 = fetchProgress が完了したアセンダンシー数 (未取得は含めない) */
  const completedAscendancyCount = computed<number>(() => {
    let c = 0;
    for (const a of ascendancies.value) {
      const fp = a.fetchProgress;
      if (!fp || fp.total <= 0 || fp.done >= fp.total) c += 1;
    }
    return c;
  });
  const progressFraction = computed<string>(() => `${completedAscendancyCount.value} / ${TARGET_ASCENDANCY_COUNT}`);

  /** 全体プログレスバー (0-100)。キャラ取得中も少しずつ伸びる。 */
  const overallProgressPercent = computed<number>(() => {
    let acc = 0;
    for (const a of ascendancies.value) {
      const fp = a.fetchProgress;
      if (!fp || fp.total <= 0) {
        acc += 1;
        continue;
      }
      acc += Math.min(1, fp.done / fp.total);
    }
    return Math.max(0, Math.min(100, (acc / TARGET_ASCENDANCY_COUNT) * 100));
  });

  /** フェーズ表示の経過秒数 (1Hz tick で UI が常時動く → 停止と区別できる) */
  const phaseStartedAt = ref<number>(Date.now());
  const phaseKey = computed<string>(() =>
    craftV2Store.currentPhase ? `${craftV2Store.currentPhase.ascendancy}::${craftV2Store.currentPhase.phase}` : "",
  );
  watch(phaseKey, () => {
    phaseStartedAt.value = Date.now();
  });
  const phaseElapsedSecs = computed<number>(() => {
    if (!craftV2Store.loading || !craftV2Store.currentPhase) return 0;
    return Math.floor((nowMs.value - phaseStartedAt.value) / 1000);
  });

  function pct(count: number): string {
    const a = activeAscendancy.value;
    if (!a || !a.sampleSize) return "-";
    return Math.round((count / a.sampleSize) * 100) + "%";
  }

  return {
    ascendancies,
    activeAscendancyId,
    activeSlot,
    activeAscendancy,
    sortedAscendancies,
    activeSlotMods,
    activeUniques,
    activeSlotLabel,
    showLowCount,
    showLowCountUniques,
    sortedPrefix,
    sortedSuffix,
    skillsTab,
    activeSkills,
    activeNinjaSkills,
    sortedBases,
    visiblePrefix,
    visibleSuffix,
    visibleBases,
    visibleUniques,
    totalLowPrefixCount,
    totalLowSuffixCount,
    totalLowBasesCount,
    totalLowUniquesCount,
    showBaseSection,
    isMostlyUniqueSlot,
    topUniqueCount,
    topUniqueName,
    progressFraction,
    overallProgressPercent,
    phaseElapsedSecs,
    pct,
  };
}
