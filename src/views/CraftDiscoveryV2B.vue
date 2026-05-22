<!--
  CraftDiscoveryV2B.vue — クラフト発見 V2 (実 API 接続版)
  ---------------------------------------------------------------------------
  Phase δ + ε:
    - データソースは poe.ninja (Rust 経由、`craft_v2_fetch_all`)
    - 起動時 (= マウント時) 自動 fetch、人気順 (使用率降順) でアセンダンシー単位の
      漸進 UI 更新を行う。Ring/Amulet トグル + prefix/suffix 二段表示は維持。

  関連:
    - 設計書: POE秘書/.company/research/topics/poe2-ninja-build-mod-extraction.md
    - Rust 側: src-tauri/src/poe_ninja_client.rs (craft_v2_fetch_all)
    - TS 集計層: src/services/craft-discovery-v2.ts (Phase γ)
-->
<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import BaseCard from "../components/decor/BaseCard.vue";
import UniqueTooltip from "../components/decor/UniqueTooltip.vue";
import {
  openTrade2ForSelectedMods,
  openTrade2ForUnique,
  type AggregatedAscendancy,
  type ModEntry,
  type SlotKey,
  type SlotMods,
  type UniqueUsage,
} from "../services/craft-discovery-v2";
// 2026-05-23 シームレス徹底:
//   従来 V2B.vue が抱えていた取得状態 (ascendancies / loading / warnHistory 等) は
//   `craftV2Store` (singleton) に移動した。App.vue 起動時にも fetch が始まるので、
//   この画面を開いた時にはすでにデータが揃っているケースが大半。
//   per-view な操作 state (selectedMods / activeAscendancyId / hovered* 等) のみ
//   ローカル ref で保持する。
import {
  craftV2Store,
  ensureCraftV2Started,
  refreshCraftV2,
  forceRefetchCraftV2,
  refetchWithSelectedLeague,
  runHealthCheck,
  pushWarn,
  clearWarns,
  toggleWarnDetail,
  nowMs as nowMsRef,
  MAX_WARN_HISTORY,
  type WarnEntry,
  type WarnLevel,
  type WarnSource,
} from "../state/craft-v2-store";

// ---------------------------------------------------------------------------
// メインタブ定義 (順序 + 日本語ラベル + アイコン)
// オーナー指示 2026-05-22: 指輪 / アミュレット / 武器1 / 武器2 / 兜 / 手袋 / 胴体 / 靴
// ---------------------------------------------------------------------------
type MainTabKey =
  | "ring"
  | "amulet"
  | "weapon"
  | "weapon2"
  | "helm"
  | "gloves"
  | "body"
  | "boots";

interface SlotTab {
  key: MainTabKey;
  label: string;
  /** 錬金術記号ライクな絵文字 (Phase A の暖色トーンに合う) */
  icon: string;
}
// 2026-05-22 修正 (UI-H4):
//   trade2 のカテゴリは武器1/武器2 とも `weapon` に丸めるため (細分化しない方針)、
//   タブラベル側で「武器」「オフハンド」と意味分離して、検索結果に他武器種が混在
//   することを誤認させないようにする。
//     - 「武器」     : メイン武器 (Weapon / Weapon1)
//     - 「オフハンド」: サブ武器・盾・フォーカス・クィーバー (Weapon2/Offhand/Offhand2 統合)
const SLOT_TABS: readonly SlotTab[] = [
  { key: "ring", label: "指輪", icon: "○" },
  { key: "amulet", label: "アミュレット", icon: "◆" },
  { key: "weapon", label: "武器", icon: "⚔" },
  { key: "weapon2", label: "オフハンド", icon: "🛡" },
  { key: "helm", label: "兜", icon: "▲" },
  { key: "gloves", label: "手袋", icon: "✋" },
  { key: "body", label: "胴体", icon: "▮" },
  { key: "boots", label: "靴", icon: "▼" },
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
// 2026-05-23 シームレス徹底:
//   取得状態系は `craftV2Store` に集約済 (App.vue 起動時から走る)。
//   ここでは store の reactive プロパティを computed で「画面ローカル名」に
//   bind し直すことで、既存テンプレートを最小差分で動かす。
//   writable な双方向バインド (selectedLeagueUrl) は computed get/set で expose。

/** 漸進取得結果 (store プロキシ) */
const ascendancies = computed(() => craftV2Store.ascendancies);

/** 上タブで選択中のアセンダンシー id — per-view (画面ローカル) */
const activeAscendancyId = ref<string>("");

/** 右上トグル: Ring / Amulet / 他 — per-view */
const activeSlot = ref<SlotKey>("ring");

/** 取得中フラグ (store プロキシ) */
const loading = computed(() => craftV2Store.loading);
/** 致命的エラー (store プロキシ) */
const fatalError = computed(() => craftV2Store.fatalError);

/** 警告履歴 (store プロキシ) — UI 表示は store の reactive 配列を直接見る */
const warnHistory = computed(() => craftV2Store.warnHistory);
const expandedWarnTimestamps = computed(
  () => craftV2Store.expandedWarnTimestamps,
);

/** 完了スナップショット (store プロキシ) */
const snapshot = computed(() => craftV2Store.snapshot);
const lastUpdatedAt = computed(() => craftV2Store.lastUpdatedAt);
const currentlyFetching = computed(() => craftV2Store.currentlyFetching);
const currentPhase = computed(() => craftV2Store.currentPhase);

// 2026-05-23: 「動いてるか分からない」問題への対処。
//   フェーズ表示の経過秒数 + 1Hz tick で UI が常時動くようにする。
//   N/50 が retry で止まってても秒数は進む → 「停止 / エラー」と区別できる。
//   nowMsRef は store 側 (取得中だけ tick する) を共有。
const phaseStartedAt = ref<number>(Date.now());
const _phaseKey = computed<string>(() =>
  currentPhase.value
    ? `${currentPhase.value.ascendancy}::${currentPhase.value.phase}`
    : "",
);
watch(_phaseKey, () => {
  phaseStartedAt.value = Date.now();
});
const phaseElapsedSecs = computed<number>(() => {
  if (!loading.value || !currentPhase.value) return 0;
  return Math.floor((nowMsRef.value - phaseStartedAt.value) / 1000);
});

// Phase ξ: poe.ninja リーグ選択 (store プロキシ)
const availableLeagues = computed(() => craftV2Store.availableLeagues);
/** dropdown は writable 双方向バインドなので get/set 経由 */
const selectedLeagueUrl = computed<string>({
  get: () => craftV2Store.selectedLeagueUrl,
  set: (v: string) => {
    craftV2Store.selectedLeagueUrl = v;
  },
});
const leaguesLoadFailed = computed(() => craftV2Store.leaguesLoadFailed);

// Phase ζ: キャッシュ即時表示フラグ (store プロキシ)
const showingFromCache = computed(() => craftV2Store.showingFromCache);
const cacheItemCount = computed(() => craftV2Store.cacheItemCount);

// ネットワーク状態 (取得中だけ poll、store 側で 1Hz 更新) — テンプレで参照
const networkStatus = computed(() => craftV2Store.networkStatus);

// WarnLevel / WarnSource は warnLevelClasses / warnSourceLabel の引数型で使う。
// WarnEntry はテンプレ `v-for="w in warnHistory"` の `w` 推論に効くため import を維持する。
// (TypeScript 的には型のみの import なので、未使用なら ts-prune 警告を出すが、テンプレで参照あり)
void (null as WarnEntry | null);

// ---------------------------------------------------------------------------
// ネットワーク状態 (レート制限 + retry)
// ---------------------------------------------------------------------------
// 旧仕様では「取得中だけ 1Hz で get_network_status を poll」していたが、シームレス
// 起動 (App.vue 起動時 fetch) と整合させるため、polling 自体は store 側で管理する。
// ここでは store の `networkStatus` を computed 経由でテンプレに渡すのみ。
// (上の「const networkStatus = computed(...)」で定義済)。

// ---------------------------------------------------------------------------
// ユニーク MOD ホバーオーバーレイ State
// ---------------------------------------------------------------------------
/** 現在ホバー中のユニーク (null なら非表示) */
const hoveredUnique = ref<UniqueUsage | null>(null);
/** マウス座標 (画面端フリップ計算用) */
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

// M6: trade2 検索 (unique 行クリック / 一括 MOD 検索) の二重起動ガード。
//   - 連打でブラウザが複数枚開く / 不要な POST が走る現象を抑止。
//   - 行クリックと一括検索ボタンで同じ ref を共有 (どちらか進行中なら他方も無効化)。
const searching = ref<boolean>(false);

async function searchUniqueOnTrade2(u: UniqueUsage): Promise<void> {
  if (searching.value) return; // M6: 進行中なら無視
  // 2026-05-22 修正 (UI-H3):
  //   ブラウザを開いた直後にアプリへ戻ってきた時、tooltip が残り続ける不具合を防ぐ。
  //   ブラウザ起動の成否に関わらず確実にクリアしたいので try-finally でクリアする。
  hoveredUnique.value = null;
  hoverX.value = 0;
  hoverY.value = 0;
  searching.value = true;
  const league = snapshot.value?.snapshot_name ?? "Fate of the Vaal";
  try {
    // 2026-05-22: trade2 検索は representative.name (正式名 "Atziri's Splendour" 等) を優先。
    // 無ければ nameEn (= typeLine、ベース表示) で fallback、それも 400 なら baseType + rarity=unique
    const tradeName = u.representative?.name || u.nameEn;
    await openTrade2ForUnique({
      nameEn: tradeName,
      league,
      baseType: u.representative?.baseType,
    });
  } catch (e) {
    console.warn("[CraftDiscoveryV2B] unique trade2 search failed:", e);
    pushWarn(
      "warn",
      "trade2 検索失敗: " + (e instanceof Error ? e.message : String(e)),
      "trade2-search",
    );
  } finally {
    hoveredUnique.value = null;
    searching.value = false;
  }
}

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const activeAscendancy = computed<AggregatedAscendancy | null>(() => {
  if (ascendancies.value.length === 0) return null;
  return (
    ascendancies.value.find((a) => a.id === activeAscendancyId.value) ??
    ascendancies.value[0]
  );
});

// 2026-05-23 シームレス徹底:
//   旧 `mergeAscendancy` 内で「初回到着時に activeAscendancyId を自動選択」していたが、
//   集計マージは store 側に移動したので、こちらは store の ascendancies を watch して
//   「未選択 (空文字) かつ初到着」のタイミングだけ最初の id を選ぶ。
watch(
  ascendancies,
  (list) => {
    if (!activeAscendancyId.value && list.length > 0) {
      activeAscendancyId.value = list[0].id;
    }
  },
  { immediate: true },
);

const activeSlotMods = computed<SlotMods>(() => {
  const a = activeAscendancy.value;
  if (!a) return { prefix: [], suffix: [] };
  // 8 スロット分のフィールドを名前で直接引く (AggregatedAscendancy が SlotKey ごとにプロパティを持つ)
  return a[activeSlot.value];
});

/**
 * Phase μ (2026-05-22): 現在の `activeSlot` に装備されているユニークのみ表示する。
 *
 * 旧仕様 (全スロット合算) では「指輪タブを見ているのに兜のユニーク (Heatshiver 等) が
 * 混じる」現象が発生していたため、オーナー指示でスロット別フィルタに切替えた。
 * 旧 `uniques` (全スロット合算) は型上残してあるが、UI からはアクセスしない。
 *
 * `uniquesBySlot` が無い古いキャッシュ復元結果に当たった場合 (将来の互換) は
 * 空配列にフォールバック。
 */
const activeUniques = computed<UniqueUsage[]>(() => {
  const a = activeAscendancy.value;
  if (!a) return [];
  return a.uniquesBySlot?.[activeSlot.value] ?? [];
});

/** 現在のスロットの日本語ラベル (ユニーク使用率セクション見出し用) */
const activeSlotLabel = computed<string>(() => {
  const tab = SLOT_TABS.find((t) => t.key === activeSlot.value);
  return tab ? tab.label : "";
});

// ユニーク使用率も 10 人未満はデフォルト非表示 + クリックで展開
// 2026-05-22 修正: アセンダンシー × スロット 別の独立 state (Record でキー管理)
const showLowCountUniquesByKey = ref<Record<string, boolean>>({});
const uniqueExpandKey = computed<string>(
  () => `${activeAscendancyId.value}::${activeSlot.value}`,
);
const showLowCountUniques = computed<boolean>({
  get: () => showLowCountUniquesByKey.value[uniqueExpandKey.value] ?? false,
  set: (v: boolean) => {
    showLowCountUniquesByKey.value = {
      ...showLowCountUniquesByKey.value,
      [uniqueExpandKey.value]: v,
    };
  },
});
const visibleUniques = computed<UniqueUsage[]>(() =>
  showLowCountUniques.value
    ? activeUniques.value
    : activeUniques.value.filter((u) => u.count >= LOW_COUNT_THRESHOLD),
);
/** フィルタ前の低カウントユニーク数 (戻すボタン判定用、Phase ν) */
const totalLowUniquesCount = computed<number>(
  () => activeUniques.value.filter((u) => u.count < LOW_COUNT_THRESHOLD).length,
);

// 既に集計時に降順ソート済みだが、防御的に再ソート
const sortedPrefix = computed<ModEntry[]>(() =>
  [...activeSlotMods.value.prefix].sort((a, b) => b.count - a.count),
);
const sortedSuffix = computed<ModEntry[]>(() =>
  [...activeSlotMods.value.suffix].sort((a, b) => b.count - a.count),
);

// ニッチ MOD (5 人以下採用) はデフォルト非表示、クリックで展開
// 2026-05-22 修正: アセンダンシー × スロット 別の独立 state (Record でキー管理)
// 閾値 6: 50 人母集団なら 6 人以上 (12%以上) を「主流」とみなす。
// ニッチ = 「採用者 5 人以下 (= 10% 以下)」を隠す。
// 5 人「以下」を隠す = count < 6 を隠す = count >= 6 を表示。
const LOW_COUNT_THRESHOLD = 6;
const showLowCountByKey = ref<Record<string, boolean>>({});
const modExpandKey = computed<string>(
  () => `${activeAscendancyId.value}::${activeSlot.value}`,
);
const showLowCount = computed<boolean>({
  get: () => showLowCountByKey.value[modExpandKey.value] ?? false,
  set: (v: boolean) => {
    showLowCountByKey.value = {
      ...showLowCountByKey.value,
      [modExpandKey.value]: v,
    };
  },
});
const visiblePrefix = computed<ModEntry[]>(() =>
  showLowCount.value
    ? sortedPrefix.value
    : sortedPrefix.value.filter((m) => m.count >= LOW_COUNT_THRESHOLD),
);
const visibleSuffix = computed<ModEntry[]>(() =>
  showLowCount.value
    ? sortedSuffix.value
    : sortedSuffix.value.filter((m) => m.count >= LOW_COUNT_THRESHOLD),
);
/** フィルタ前の低カウント MOD 数 (戻すボタン判定用、Phase ν) */
const totalLowPrefixCount = computed<number>(
  () => sortedPrefix.value.filter((m) => m.count < LOW_COUNT_THRESHOLD).length,
);
const totalLowSuffixCount = computed<number>(
  () => sortedSuffix.value.filter((m) => m.count < LOW_COUNT_THRESHOLD).length,
);

/**
 * 2026-05-22: ニッチ閾値を 5 人以下に上げた結果、レアにめぼしい MOD が無い
 * スロット (= prefix も suffix も「表示できる MOD なし」) が増える。
 * その場合は「ユニーク装備のほうが採用率が高い」と判断し、ユニーク BaseCard を
 * 最上段に並び替えてバッジ強調する。
 *
 * 判定:
 *   - showLowCount で展開されていない (デフォ折りたたみ状態)
 *   - visiblePrefix と visibleSuffix が両方 0 件
 *   - ユニーク採用が 1 件以上ある
 */
const isMostlyUniqueSlot = computed<boolean>(() => {
  if (showLowCount.value) return false; // ユーザーがレア展開中なら通常順
  const prefixEmpty = visiblePrefix.value.length === 0;
  const suffixEmpty = visibleSuffix.value.length === 0;
  // L2: ユニークの top カウントが LOW_COUNT_THRESHOLD 以上ある時のみ「優位」とみなす。
  //   旧仕様だと「ユニーク 1 人だけ採用」でも逆転表示されて誤誘導するため、
  //   レアと同じ閾値 (6 人以上 = 主流) を満たす場合のみ最上段に持ち上げる。
  const topCount = activeUniques.value[0]?.count ?? 0;
  const hasMainstreamUnique = topCount >= LOW_COUNT_THRESHOLD;
  return prefixEmpty && suffixEmpty && hasMainstreamUnique;
});
/** ユニーク採用率トップの人数 (バッジ表示用) */
const topUniqueCount = computed<number>(() =>
  activeUniques.value.length > 0 ? (activeUniques.value[0]?.count ?? 0) : 0,
);
const topUniqueName = computed<string>(() =>
  activeUniques.value.length > 0
    ? (activeUniques.value[0]?.name ?? activeUniques.value[0]?.nameEn ?? "")
    : "",
);

/** 進捗率 (取得済アセンダンシー数 / 想定 10)
 *
 * M5: 「取得済」= fetchProgress が完了したアセンダンシー数。
 * 未取得 (fetchProgress 無し or done==total に達していない) は含めない。
 * これで「全 10 件着信したが内部キャラ取得は途中」という状態が
 * 「10 / 10 取得中…」と矛盾表示されるのを防ぐ。
 */
const TARGET_ASCENDANCY_COUNT = 10;
const completedAscendancyCount = computed<number>(() => {
  let c = 0;
  for (const a of ascendancies.value) {
    const fp = a.fetchProgress;
    // fetchProgress 無 = キャッシュ即時表示 or done 後の差分集計分 → 完了扱い
    if (!fp || fp.total <= 0 || fp.done >= fp.total) c += 1;
  }
  return c;
});
const progressFraction = computed<string>(() => {
  return `${completedAscendancyCount.value} / ${TARGET_ASCENDANCY_COUNT}`;
});

/**
 * Phase θ: 全体プログレスバーの 0-100 値。
 *
 * 計算根拠:
 *   - アセンダンシーごとに `fetchProgress` (現在の done/total) があれば加算
 *   - 完了済 (fetchProgress 無し or done===total) は 1 アセンダンシー分まるごと加算
 *   - 未到着のアセンダンシーは 0 として扱う
 *   - 全体: TARGET_ASCENDANCY_COUNT アセンダンシー分を分母とする
 *
 * これにより「キャラ取得中も少しずつバーが伸びる」UX になる。
 */
const overallProgressPercent = computed<number>(() => {
  const total = TARGET_ASCENDANCY_COUNT;
  if (total <= 0) return 0;
  let acc = 0;
  for (const a of ascendancies.value) {
    const fp = a.fetchProgress;
    if (!fp || fp.total <= 0) {
      // キャッシュ由来 or 完了済 (progress event 終了後の差分集計分)
      acc += 1;
      continue;
    }
    acc += Math.min(1, fp.done / fp.total);
  }
  // 表示数は最大 100% でクランプ
  return Math.max(0, Math.min(100, (acc / total) * 100));
});

// ---------------------------------------------------------------------------
// 取得トリガー (store ラッパー)
// ---------------------------------------------------------------------------
// 2026-05-23 シームレス徹底:
//   実体は `craft-v2-store.ts` に集約。ここでは「テンプレ参照の互換名」を維持しつつ
//   store 関数を呼ぶ薄いラッパー。
//   - `startFetch(true)`        → 「更新」ボタン (差分更新)
//   - `forceRefetch()`          → 「全取得」ボタン (キャッシュ削除 + 全取得)
//   - `refetchWithSelectedLeague` → 「このリーグで再取得」ボタン
async function startFetch(_useCache: boolean = true): Promise<void> {
  await refreshCraftV2();
}
async function forceRefetch(): Promise<void> {
  await forceRefetchCraftV2();
}

// ---------------------------------------------------------------------------
// 表示ヘルパー
// ---------------------------------------------------------------------------
function formatHms(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Phase ο-B: 警告履歴行の表示色クラス。visual-concept §5/§8 の暖色トーンに合わせる。
 */
function warnLevelClasses(level: WarnLevel): string {
  switch (level) {
    case "error":
      return "text-red-200 border-l-2 border-red-600/60";
    case "warn":
      return "text-amber-200 border-l-2 border-amber-600/60";
    case "info":
    default:
      return "text-[var(--exile-color-text-secondary)] border-l-2 border-[var(--exile-color-border-subtle)]";
  }
}

function warnSourceLabel(source?: WarnSource): string {
  switch (source) {
    case "health-check":
      return "健全性";
    case "dict-check":
      return "辞書";
    case "fetch-character":
      return "キャラ取得";
    case "trade2-search":
      return "trade2";
    case "craft-fetch":
      return "クラフト取得";
    case "mod-select":
      return "MOD 選択";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
// 2026-05-23 シームレス徹底:
//   App.vue 起動時に `ensureCraftV2Started` が走っているので、ここでは念のため
//   再度呼ぶ (冪等ガード済 = 既に走ってれば no-op)。
//   既存 onBeforeUnmount で持っていた unlisten / poller cleanup は store 側に
//   moved (= 画面遷移で取得を止めない / グローバル singleton として動き続ける)。
onMounted(() => {
  void ensureCraftV2Started();
});

// ---------------------------------------------------------------------------
// trade2 検索 (将来用、現状は console.log + alert に留める)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// アセンダンシータブの表示順 (使用率降順)
// Rust 側は使用率降順で逐次 emit するが、並列受信時のブレを防ぐため UI 側でも明示 sort。
// ---------------------------------------------------------------------------
const sortedAscendancies = computed(() =>
  [...ascendancies.value].sort((a, b) => b.usagePercent - a.usagePercent),
);

// ---------------------------------------------------------------------------
// MOD 選択 + trade2 一括検索
// クリックで toggle、選択された MOD は rawTemplate を Set で管理。
// 検索ボタン押下で:
//   1. 選択 MOD を stat ID に逆引き
//   2. trade2_search POST で search id を取得
//   3. id 付き trade2 URL を OS デフォルトブラウザで開く (旧 openClusterInTrade2 と同じ挙動)
// オーナー指示 2026-05-22:「前作った押したらトレード行く感じの挙動で」
// ---------------------------------------------------------------------------
const selectedMods = ref<Set<string>>(new Set());

/**
 * Phase ι: MOD ごとの「選択ティア index」(0-based)。
 * - キー: ModEntry.rawTemplate
 * - 値  : `mod.tiers` 配列のインデックス (0 = T1 = 強)
 * - undefined / 未設定 = ティア指定なし (= trade2 query に min を詰めない)
 *
 * 排他選択で MOD を解除する時にここからも削除する (古いティア設定が残らないように)。
 */
const selectedTierIdxByMod = ref<Record<string, number>>({});

// 2026-05-22 オーナー指示: スロット切替で MOD 選択リセット
// (指輪でチェック → アミュレットでチェック → 検索すると全 MOD が混在検索される問題への対策)
// activeAscendancy 切替時もリセット (アセが違えば MOD の意味も実質変わるため)
//
// 2026-05-22 修正 (UI-H3):
//   ユニーク tooltip の `hoveredUnique` が、スロット/アセ切替後も前画面の絵柄で
//   残る不具合 (mouseleave がカード破棄で発火しない) を防ぐため、watch 内で
//   明示的にクリアする。
watch([activeSlot, activeAscendancyId], () => {
  selectedMods.value = new Set();
  selectedTierIdxByMod.value = {};
  // M1: 一括ティア値もリセット (スロット/アセ切替で前選択が UI に残らないように)
  bulkTierValue.value = 0;
  hoveredUnique.value = null;
  hoverX.value = 0;
  hoverY.value = 0;
});

function isModSelected(mod: ModEntry): boolean {
  return selectedMods.value.has(mod.rawTemplate);
}

/**
 * 現在表示中の全 MOD (prefix + suffix) から rawTemplate → ModEntry の逆引きを作る。
 * 排他 group 検出 / tier dropdown / 検索ボタンで共用する。
 */
const allVisibleModsByTpl = computed<Map<string, ModEntry>>(() => {
  const m = new Map<string, ModEntry>();
  for (const e of activeSlotMods.value.prefix) m.set(e.rawTemplate, e);
  for (const e of activeSlotMods.value.suffix) m.set(e.rawTemplate, e);
  return m;
});

/**
 * 2026-05-22 オーナー指示: POE2 装備は prefix/suffix 各 3 枠まで。
 * 4 つ目のチェックは物理的にあり得ない (耐性 4 種同時不可、等) のでガードする。
 */
const MAX_AFFIX_PER_ITEM = 3;
/** prefix 側 rawTemplate の Set (per-slot) — selected カウント用 */
const prefixTplSet = computed<Set<string>>(
  () => new Set(activeSlotMods.value.prefix.map((m) => m.rawTemplate)),
);
const suffixTplSet = computed<Set<string>>(
  () => new Set(activeSlotMods.value.suffix.map((m) => m.rawTemplate)),
);
const selectedPrefixCount = computed<number>(() => {
  let n = 0;
  for (const tpl of selectedMods.value) {
    if (prefixTplSet.value.has(tpl)) n++;
  }
  return n;
});
const selectedSuffixCount = computed<number>(() => {
  let n = 0;
  for (const tpl of selectedMods.value) {
    if (suffixTplSet.value.has(tpl)) n++;
  }
  return n;
});
const prefixLimitReached = computed<boolean>(
  () => selectedPrefixCount.value >= MAX_AFFIX_PER_ITEM,
);
const suffixLimitReached = computed<boolean>(
  () => selectedSuffixCount.value >= MAX_AFFIX_PER_ITEM,
);
/**
 * mod が prefix 側か suffix 側かを判定 (チェックボックス :disabled で使用)。
 * 同 affix 既選択 3 個に達してたら、未選択 mod のチェックを禁止する。
 */
function isModCheckDisabled(mod: ModEntry): boolean {
  if (isModSelected(mod)) return false; // 既選択は解除のため disabled しない
  if (prefixTplSet.value.has(mod.rawTemplate)) return prefixLimitReached.value;
  if (suffixTplSet.value.has(mod.rawTemplate)) return suffixLimitReached.value;
  return false;
}

/**
 * Phase ι: MOD カテゴリ排他選択。
 * - 解除動作はそのまま (チェック外し)
 * - 新規選択時、同 group の既選択 MOD があれば自動で解除
 *   (= グループ排他切替。disabled よりも UX が滑らかとオーナー指示で確定)
 * - 自動解除した MOD は `lastWarn` に表示してユーザーに通知
 */
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

  // 2026-05-22 オーナー指示: prefix/suffix 各 3 個上限ガード (POE2 mod 枠制限)
  const isPrefix = prefixTplSet.value.has(mod.rawTemplate);
  const isSuffix = suffixTplSet.value.has(mod.rawTemplate);
  if (
    (isPrefix && prefixLimitReached.value) ||
    (isSuffix && suffixLimitReached.value)
  ) {
    const affixLabel = isPrefix ? "プレフィックス" : "サフィックス";
    pushWarn(
      "warn",
      `${affixLabel}は 1 装備に最大 ${MAX_AFFIX_PER_ITEM} 個までです (POE2 mod 枠制限)`,
      "mod-select",
    );
    return;
  }

  // ---- 新規選択: 同 group の既選択を探して自動解除 ----
  const newGroups = mod.groupIds ?? [];
  if (newGroups.length > 0) {
    const ousted: string[] = [];
    const lookup = allVisibleModsByTpl.value;
    for (const tpl of [...next]) {
      if (tpl === mod.rawTemplate) continue;
      const other = lookup.get(tpl);
      if (!other || !other.groupIds || other.groupIds.length === 0) continue;
      // group 配列の共通要素があれば排他とみなす (大半は 1 要素同士の比較)
      const conflict = other.groupIds.some((g) => newGroups.includes(g));
      if (conflict) {
        next.delete(tpl);
        delete nextTiers[tpl];
        ousted.push(other.text || tpl);
      }
    }
    if (ousted.length > 0) {
      pushWarn(
        "info",
        `同カテゴリの選択を自動解除しました: ${ousted.join(" / ")}`,
        "mod-select",
      );
    }
  }
  next.add(mod.rawTemplate);
  selectedMods.value = next;
  selectedTierIdxByMod.value = nextTiers;
}

function clearSelectedMods(): void {
  selectedMods.value = new Set();
  selectedTierIdxByMod.value = {};
  // M1: 一括ティアも初期化 (選択解除と同時に dropdown も「制限なし」に戻す)
  bulkTierValue.value = 0;
}

/**
 * Phase ι: ティア dropdown の onChange ハンドラ。
 * - `idx === -1` = 「制限なし」、Record から削除
 * - それ以外     = `mod.tiers[idx]` を選択ティアとして保存
 */
function setModTier(mod: ModEntry, idx: number): void {
  const next = { ...selectedTierIdxByMod.value };
  if (idx < 0 || !mod.tiers || idx >= mod.tiers.length) {
    delete next[mod.rawTemplate];
  } else {
    next[mod.rawTemplate] = idx;
  }
  selectedTierIdxByMod.value = next;
}

/** dropdown の選択 index 取得 (未設定なら -1 = 制限なし) */
function getModTierIdx(mod: ModEntry): number {
  const v = selectedTierIdxByMod.value[mod.rawTemplate];
  return typeof v === "number" ? v : -1;
}

/**
 * 一括ティア変更 (オーナー指示 2026-05-22):
 * 選択中の全 MOD のティアを `targetTier` (1-based) に揃える。
 * - 該当ティアが存在しない MOD はその MOD の最後 (最低) ティアを選ぶ
 * - targetTier === 0 → 全 MOD のティアを「制限なし」(クリア)
 */
const bulkTierValue = ref<number>(0);
function applyBulkTier(): void {
  const t = bulkTierValue.value;
  if (selectedMods.value.size === 0) return;
  const allMods = [...activeSlotMods.value.prefix, ...activeSlotMods.value.suffix];
  const next: Record<string, number> = { ...selectedTierIdxByMod.value };
  if (t === 0) {
    // 制限なしで全クリア (選択中の MOD のみ)
    for (const mod of allMods) {
      if (selectedMods.value.has(mod.rawTemplate)) {
        delete next[mod.rawTemplate];
      }
    }
  } else {
    const idx = t - 1; // 1-based → 0-based
    for (const mod of allMods) {
      if (!selectedMods.value.has(mod.rawTemplate)) continue;
      if (!mod.tiers || mod.tiers.length === 0) continue;
      const safeIdx = idx < mod.tiers.length ? idx : mod.tiers.length - 1;
      next[mod.rawTemplate] = safeIdx;
    }
  }
  selectedTierIdxByMod.value = next;
}

async function searchSelectedMods(): Promise<void> {
  if (selectedMods.value.size === 0) return;
  if (searching.value) return; // M6: 進行中なら無視
  searching.value = true;
  try {
    const slot = activeSlot.value;
    const all = [...activeSlotMods.value.prefix, ...activeSlotMods.value.suffix];
    const chosen = all.filter((m) => selectedMods.value.has(m.rawTemplate));
    if (chosen.length === 0) return;

    // Phase ι: 各 MOD の選択ティアから min を計算 → tierMinByMod として渡す
    const tierMinByMod: Record<string, number> = {};
    for (const mod of chosen) {
      const idx = selectedTierIdxByMod.value[mod.rawTemplate];
      if (typeof idx === "number" && mod.tiers && mod.tiers[idx]) {
        tierMinByMod[mod.rawTemplate] = mod.tiers[idx].min;
      }
    }

    const league = snapshot.value?.snapshot_name ?? "fate-of-the-vaal";

    try {
      const r = await openTrade2ForSelectedMods({
        selectedMods: chosen,
        slot,
        league,
        tierMinByMod,
      });
      // 確認ダイアログ不要 (オーナー指示 2026-05-22): trade2 へ直接遷移
      // missing mods があれば警告履歴に静かに通知
      if (r.missingMods.length > 0) {
        pushWarn(
          "warn",
          `[trade2] stat ID 未マッピングでスキップした MOD: ${r.missingMods.join(" / ")}`,
          "trade2-search",
        );
      }
    } catch (e) {
      console.warn("[CraftDiscoveryV2B] trade2 search failed:", e);
      pushWarn(
        "warn",
        "trade2 検索失敗: " + (e instanceof Error ? e.message : String(e)),
        "trade2-search",
      );
    }
  } finally {
    // M6: ガード解除 (例外/早期 return すべてのパスでリセット)
    searching.value = false;
  }
}

// 旧: 行クリックで個別 trade2 検索 (alert モック) → 選択 toggle に統合済

// ---------------------------------------------------------------------------
// エラーメッセージ日本語化 (Rust 側 / 内部の英語メッセージをユーザー向けに変換)
// ---------------------------------------------------------------------------
function localizeError(msg: string): string {
  if (!msg) return "";
  let s = msg;
  // フェーズタグ
  s = s.replace(/\[character\]/g, "[キャラ取得]");
  s = s.replace(/\[search\]/g, "[検索]");
  s = s.replace(/\[join\]/g, "[並列タスク]");
  s = s.replace(/\[aggregate\]/g, "[集計]");
  // HTTP エラー
  s = s.replace(
    /HTTP 429 after (\d+) retries for (\S+?):/,
    "レート制限超過 ($1 回リトライ失敗): $2 → ",
  );
  s = s.replace(/HTTP 429 after (\d+) retries for (\S+)/, "レート制限超過 ($1 回リトライ失敗): $2");
  s = s.replace(/HTTP (\d+) Not Found for (\S+)/, "見つかりません ($1): $2");
  s = s.replace(/HTTP (\d+) for (\S+)/, "HTTP $1 エラー: $2");
  s = s.replace(/network error on (\S+):/, "ネットワークエラー: $1:");
  // Cloudflare
  s = s.replace(/error code: 1015/g, "→ Cloudflare レート制限");
  s = s.replace(/error code: (\d+)/g, "→ エラーコード $1");
  // JSON / 構造系
  s = s.replace(/character json parse error/g, "キャラデータの JSON 解析失敗");
  s = s.replace(/json parse error/g, "JSON 解析失敗");
  s = s.replace(/build-index-state: leagueBuilds[^ ]* missing/g, "リーグ別ビルド一覧が見つかりません");
  s = s.replace(/statistics missing in leagueBuilds/g, "アセンダンシー使用率データが見つかりません");
  s = s.replace(/index-state: economyLeagues[^ ]* missing/g, "現リーグ情報が取得できません");
  s = s.replace(/semaphore closed/g, "セマフォ閉鎖");
  s = s.replace(/unreachable backoff loop for/g, "バックオフループ異常:");
  return s;
}

function pct(count: number): string {
  const a = activeAscendancy.value;
  if (!a || !a.sampleSize) return "-";
  return Math.round((count / a.sampleSize) * 100) + "%";
}
</script>

<template>
  <section
    class="h-full flex flex-col px-6 py-4 bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)]"
  >
    <!-- ============================================================
      ヘッダー: タイトル + 進捗 + Ring/Amulet トグル + 更新ボタン
    ============================================================ -->
    <header class="flex items-start justify-between mb-3 gap-4 flex-wrap">
      <div class="min-w-0">
        <h1
          class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]"
        >
          上位プレイヤーMOD一覧
          <span class="text-[var(--exile-color-text-secondary)] text-sm"
            >(poe.ninja 連携 / 上位 10 アセンダンシー × 50 人)</span
          >
        </h1>
        <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">
          上位プレイヤーのレア指輪 / レアアミュレットの explicit MOD を prefix / suffix で集計 (人数降順)
        </p>
        <p class="text-xs text-[var(--exile-color-text-secondary)] mt-0.5">
          ※ 数値は実際に取れた人数分の平均値
        </p>

        <!-- Phase ξ: リーグ選択 dropdown (動的取得、デフォは現リーグ) -->
        <div
          v-if="!leaguesLoadFailed && availableLeagues.length > 0"
          class="mt-2 flex items-center gap-2 text-[11px]"
        >
          <label
            for="league-select"
            class="text-[var(--exile-color-text-secondary)]"
            >リーグ:</label
          >
          <select
            id="league-select"
            v-model="selectedLeagueUrl"
            :disabled="loading"
            class="bg-[var(--exile-color-bg-elevated)] border border-[var(--exile-color-border-brass)] rounded px-2 py-0.5 text-[var(--exile-color-text-primary)] focus:outline-none focus:border-[var(--exile-color-accent-focus)] disabled:opacity-50"
          >
            <option
              v-for="l in availableLeagues"
              :key="l.url"
              :value="l.url"
            >
              {{ l.name }}
            </option>
          </select>
          <button
            type="button"
            @click="refetchWithSelectedLeague"
            :disabled="loading"
            class="px-2 py-0.5 rounded border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)] hover:bg-[var(--exile-color-bg-surface)] hover:text-[var(--exile-color-accent-focus)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="選択中のリーグで再取得 (キャッシュは上書き)"
          >
            このリーグで再取得
          </button>
        </div>

        <!-- 進捗・最終更新 -->
        <div class="mt-2 flex items-center gap-3 flex-wrap text-[11px]">
          <span
            v-if="loading"
            class="inline-flex items-center gap-1.5 text-[var(--exile-color-accent-focus)]"
          >
            <span
              class="inline-block w-2 h-2 rounded-full bg-[var(--exile-color-accent-focus)] animate-pulse"
              aria-hidden="true"
            ></span>
            <template v-if="showingFromCache">
              キャッシュから {{ cacheItemCount }} 件即表示中、最新データ取得中…
            </template>
            <template v-else>
              取得中… {{ progressFraction }} アセンダンシー
              <span
                v-if="currentlyFetching"
                class="text-[var(--exile-color-text-secondary)]"
                >(直近: {{ currentlyFetching }})</span
              >
            </template>
          </span>
          <!--
            2026-05-23: per-character 進捗フェーズ表示。
            ユーザー指摘「取得中ってのは新しいキャラを取り込むときの取得中の事だよ?
            何で何も取得中に待ってる感じにしてんの」への対応。

            phase 別の配色 (visual-concept §5/§8 暖色基調と整合):
              - search   : 青系 (sky)  = 探索フェーズ
              - fetching : 緑系 (emerald) = 取得フェーズ
              - rate-limit (別 span) : amber 系 = ペナルティ待機

            レート制限と共存可能 (= 「リミット待機中 + 直近フェーズ」を同時表示)。
          -->
          <span
            v-if="loading && currentPhase && currentPhase.phase === 'search'"
            class="inline-flex items-center gap-1 text-[11px] text-sky-300 font-medium"
            :title="`${currentPhase.ascendancy} の上位プレイヤーを検索中`"
          >
            <span aria-hidden="true" class="animate-pulse">🔍</span>
            上位プレイヤー検索中
            <span class="text-sky-200/80 text-[10px]"
              >({{ currentPhase.ascendancy }})</span
            >
            <span class="text-sky-200/60 text-[10px] tabular-nums">
              ⏱ {{ phaseElapsedSecs }} 秒
            </span>
          </span>
          <span
            v-else-if="loading && currentPhase && currentPhase.phase === 'fetching'"
            class="inline-flex items-center gap-1 text-[11px] text-emerald-300 font-medium"
            :title="`${currentPhase.ascendancy} のキャラ装備を取得中`"
          >
            <span aria-hidden="true" class="animate-pulse">📥</span>
            キャラ取得中
            <span class="text-emerald-200/90 tabular-nums"
              >{{ currentPhase.ascendancy }}:
              {{ currentPhase.charactersDone }}/{{ currentPhase.charactersTotal }}</span
            >
            <span
              v-if="currentPhase.currentConcurrency > 0"
              class="text-emerald-200/70 text-[10px] tabular-nums"
            >
              ({{ currentPhase.currentConcurrency }} 並列)
            </span>
            <span class="text-emerald-200/60 text-[10px] tabular-nums">
              ⏱ {{ phaseElapsedSecs }} 秒
            </span>
          </span>

          <!--
            2026-05-23: レート制限ペナルティ中の残秒数表示。
            取得中 (loading=true) かつグローバルペナルティ待機中のみ表示。
            暖色トーンに合わせて amber 系 (visual-concept §5/§8 と整合)。
            per-character 進捗とは別 span なので両方並んで表示される。
          -->
          <span
            v-if="loading && networkStatus?.globalPenaltyWaiting"
            class="inline-flex items-center gap-1 text-[11px] text-amber-300 font-medium"
            :title="
              networkStatus.globalPenaltyReason
                ? `Cloudflare/サーバから ${networkStatus.globalPenaltyReason} を受信、自動再開を待機中`
                : 'サーバからのレート制限解除を待機中'
            "
          >
            <span aria-hidden="true" class="animate-pulse">⏱</span>
            リミット制限待機中（{{ networkStatus.globalPenaltyRemainingSecs }} 秒）
            <span
              v-if="networkStatus.globalPenaltyReason"
              class="text-amber-200/70 text-[10px]"
            >
              ({{ networkStatus.globalPenaltyReason }})
            </span>
          </span>

          <!--
            2026-05-23: retry sleep 中タスク数表示。
            4 並列のうち 1-2 件が 5xx/429 backoff で sleep 中だと「N/50 が止まって
            見える」問題への対応。retry 中タスク数 + 直近 retry 理由 + 残秒数を可視化。
            色は orange-300/200 (retry イメージ、rate-limit の amber より淡い橙)。
            rate-limit (グローバルペナルティ) と retry (個別タスク) は別軸なので同時表示可。
          -->
          <span
            v-if="loading && networkStatus && networkStatus.activeRetryCount > 0"
            class="inline-flex items-center gap-1 text-[11px] text-orange-300 font-medium"
            :title="
              networkStatus.lastRetryReason
                ? `直近の再試行理由: ${networkStatus.lastRetryReason} (sleep 終了まで ${networkStatus.lastRetryRemainingSecs} 秒)`
                : 'サーバ応答エラーで再試行待機中'
            "
          >
            <span aria-hidden="true" class="animate-pulse">🔁</span>
            再試行中 {{ networkStatus.activeRetryCount }} 件
            <span
              v-if="networkStatus.lastRetryReason"
              class="text-orange-200/70 text-[10px]"
            >
              ({{ networkStatus.lastRetryReason }} 残 {{ networkStatus.lastRetryRemainingSecs }} 秒)
            </span>
          </span>
          <span
            v-if="
              lastUpdatedAt &&
              !(loading && networkStatus?.globalPenaltyWaiting) &&
              !(loading && networkStatus && networkStatus.activeRetryCount > 0)
            "
            class="text-[var(--exile-color-text-secondary)]"
          >
            最終更新: {{ lastUpdatedAt }}
            <span
              v-if="snapshot"
              class="ml-1 text-[var(--exile-color-text-tertiary)]"
              >({{ snapshot.snapshot_name }})</span
            >
          </span>
        </div>

        <!--
          Phase θ: 全体プログレスバー (取得中だけ表示、完了したら自然消失)。
          差分更新中も showingFromCache の時に最新データ取得中として表示される。
        -->
        <div
          v-if="loading"
          class="mt-2 w-full max-w-[420px] h-1.5 rounded-full overflow-hidden bg-[var(--exile-color-bg-elevated)] border border-[var(--exile-color-border-subtle)]"
          :aria-label="`全体進捗 ${Math.round(overallProgressPercent)}%`"
          role="progressbar"
          :aria-valuenow="Math.round(overallProgressPercent)"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div
            class="h-full bg-gradient-to-r from-[var(--exile-color-accent-focus)] to-[var(--exile-color-accent-focus-hover)] transition-[width] duration-500 ease-out"
            :style="{ width: overallProgressPercent + '%' }"
          ></div>
        </div>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <!-- 8 スロット横並びタブ (オーナー指示 2026-05-22) -->
        <div
          class="flex border border-[var(--exile-color-border-subtle)] rounded overflow-hidden text-[12px] font-display tracking-[0.04em]"
          role="tablist"
          aria-label="スロット切替"
        >
          <button
            v-for="(tab, idx) in SLOT_TABS"
            :key="tab.key"
            type="button"
            role="tab"
            :aria-selected="activeSlot === tab.key"
            @click="activeSlot = tab.key"
            :class="[
              'px-2.5 py-1.5 transition-colors inline-flex items-center gap-1 leading-none whitespace-nowrap',
              idx > 0 ? 'border-l border-[var(--exile-color-border-subtle)]' : '',
              activeSlot === tab.key
                ? 'bg-[var(--exile-color-bg-elevated)] text-[var(--exile-color-accent-focus)]'
                : 'text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)]',
            ]"
            :title="tab.label"
          >
            <span aria-hidden="true">{{ tab.icon }}</span>
            <span>{{ tab.label }}</span>
          </button>
        </div>

        <!-- 更新ボタン (キャッシュあり時は差分更新、なしは全取得) -->
        <button
          type="button"
          @click="() => startFetch(true)"
          :disabled="loading"
          :class="[
            'px-3 py-1.5 rounded border text-[13px] font-display tracking-[0.06em] transition-colors',
            loading
              ? 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-tertiary)] cursor-not-allowed opacity-60'
              : 'border-[var(--exile-color-border-brass)] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)]',
          ]"
          :title="loading ? '取得中…' : 'poe.ninja から差分更新 (キャッシュ活用)'"
        >
          <span aria-hidden="true">⟳</span> 更新
        </button>
        <!-- キャッシュ削除 + 全取得 (Phase ζ) -->
        <button
          type="button"
          @click="forceRefetch"
          :disabled="loading"
          :class="[
            'px-3 py-1.5 rounded border text-[12px] font-display tracking-[0.06em] transition-colors',
            loading
              ? 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-tertiary)] cursor-not-allowed opacity-60'
              : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)] hover:text-[var(--exile-color-text-primary)]',
          ]"
          :title="loading ? '取得中…' : 'キャッシュ削除 + 全取得 (リーグ更新等のリカバリ用)'"
        >
          <span aria-hidden="true">⌫</span> 全取得
        </button>
      </div>
    </header>

    <!-- ============================================================
      致命的エラー / 警告バナー
    ============================================================ -->
    <div
      v-if="fatalError"
      class="mb-3 px-3 py-2 rounded border border-red-600/60 bg-red-900/20 text-[12px] text-red-200"
    >
      <strong class="font-display tracking-[0.05em]">致命的エラー:</strong>
      {{ localizeError(fatalError) }}
      <button
        type="button"
        @click="() => startFetch(true)"
        class="ml-2 underline text-red-100 hover:text-white"
      >
        再試行
      </button>
    </div>
    <!--
      Phase ο-B: 警告履歴 (最新 5 件、起動時 health-check / dict-check / fetch エラーを一括表示)。
      旧 lastWarn 単一バナーから多件スタックに拡張。再チェック / クリアボタン付き。
    -->
    <div
      v-else-if="warnHistory.length > 0"
      class="mb-3 px-3 py-2 rounded border border-[var(--exile-color-border-brass)]/60 bg-[var(--exile-color-bg-elevated)] text-[11px]"
    >
      <div class="flex items-center justify-between mb-1.5">
        <strong
          class="font-display tracking-[0.05em] text-[var(--exile-color-accent-focus)]"
        >
          警告履歴
          <span
            class="ml-1 text-[10px] tabular-nums text-[var(--exile-color-text-secondary)]"
            >({{ warnHistory.length }} / {{ MAX_WARN_HISTORY }})</span
          >
        </strong>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            @click="runHealthCheck"
            class="px-2 py-0.5 rounded border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-surface)] hover:bg-[var(--exile-color-bg-canvas)] hover:text-[var(--exile-color-accent-focus)] transition-colors text-[10px]"
            title="外部 API の健全性を再チェック"
          >
            再チェック
          </button>
          <button
            type="button"
            @click="clearWarns"
            class="px-2 py-0.5 rounded border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] hover:bg-[var(--exile-color-bg-canvas)] hover:text-[var(--exile-color-text-primary)] transition-colors text-[10px] text-[var(--exile-color-text-secondary)]"
            title="警告履歴をクリア"
          >
            クリア
          </button>
        </div>
      </div>
      <ul class="space-y-0.5">
        <li
          v-for="w in warnHistory"
          :key="w.timestamp"
          :class="['px-2 py-0.5 leading-snug', warnLevelClasses(w.level)]"
        >
          <!--
            Phase ο-C: 詳細リスト (details) がある行は「▶/▼」アコーディオンを
            行頭に出してクリックで具体値 (未知 inv_id の内訳等) を展開できるようにする。
            details が無い行は従来通り 1 行表示。
          -->
          <div
            :class="[
              'flex items-start gap-1',
              w.details && w.details.length > 0
                ? 'cursor-pointer hover:text-[var(--exile-color-accent-focus)]'
                : '',
            ]"
            @click="
              w.details && w.details.length > 0
                ? toggleWarnDetail(w.timestamp)
                : null
            "
            :title="
              w.details && w.details.length > 0
                ? 'クリックで詳細表示'
                : ''
            "
          >
            <span
              v-if="w.details && w.details.length > 0"
              class="select-none w-3 shrink-0 text-[10px] tabular-nums"
              aria-hidden="true"
              >{{ expandedWarnTimestamps.has(w.timestamp) ? "▼" : "▶" }}</span
            >
            <div class="flex-1 min-w-0">
              <span
                class="tabular-nums text-[10px] text-[var(--exile-color-text-tertiary)] mr-1"
                >[{{ formatHms(new Date(w.timestamp)) }}]</span
              >
              <span
                v-if="warnSourceLabel(w.source)"
                class="text-[10px] text-[var(--exile-color-text-secondary)] mr-1"
                >{{ warnSourceLabel(w.source) }}:</span
              >
              {{ localizeError(w.message) }}
            </div>
          </div>
          <ul
            v-if="
              w.details &&
              w.details.length > 0 &&
              expandedWarnTimestamps.has(w.timestamp)
            "
            class="mt-1 ml-4 pl-2 border-l border-[var(--exile-color-border-subtle)] space-y-0.5 text-[10px] text-[var(--exile-color-text-secondary)]"
          >
            <li
              v-for="(d, di) in w.details"
              :key="di"
              class="tabular-nums leading-tight"
            >
              {{ d }}
            </li>
          </ul>
        </li>
      </ul>
    </div>

    <!-- ============================================================
      アセンダンシータブ (横並び、使用率併記)
    ============================================================ -->
    <nav
      v-if="ascendancies.length > 0"
      class="shrink-0 flex flex-wrap gap-1.5 mb-4 pt-2 pb-3 border-b border-[var(--exile-color-border-subtle)] overflow-x-auto"
      role="tablist"
      aria-label="アセンダンシー切替"
    >
      <button
        v-for="asc in sortedAscendancies"
        :key="asc.id"
        type="button"
        role="tab"
        :aria-selected="asc.id === activeAscendancyId"
        @click="activeAscendancyId = asc.id"
        :class="[
          'group relative flex flex-col items-stretch gap-1 px-3 py-2 border rounded transition-colors font-display tracking-[0.05em] text-[13px] shrink-0',
          asc.id === activeAscendancyId
            ? 'border-[var(--exile-color-accent-focus)] bg-[var(--exile-color-bg-elevated)] text-[var(--exile-color-accent-focus)]'
            : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-primary)] hover:border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-surface)]',
        ]"
        :title="
          asc.fetchProgress && asc.fetchProgress.done < asc.fetchProgress.total
            ? `${asc.fetchProgress.done} / ${asc.fetchProgress.total} キャラ取得中`
            : asc.name
        "
      >
        <span class="flex items-center gap-2">
          <span class="text-lg leading-none" aria-hidden="true">{{ asc.icon }}</span>
          <span class="leading-none">{{ asc.name }}</span>
          <span
            class="leading-none text-[11px] tabular-nums"
            :class="
              asc.id === activeAscendancyId
                ? 'text-[var(--exile-color-accent-focus-hover)]'
                : 'text-[var(--exile-color-text-secondary)]'
            "
            >{{ asc.usagePercent.toFixed(1) }}%</span
          >
        </span>

        <!--
          Phase θ: アセンダンシータブ毎の小プログレスバー (N/M キャラ取得状況)。
          fetchProgress があり、かつ完了 (done < total) 状態の時のみ表示。
        -->
        <span
          v-if="asc.fetchProgress && asc.fetchProgress.done < asc.fetchProgress.total"
          class="flex items-center gap-1.5 text-[10px] tabular-nums text-[var(--exile-color-text-secondary)]"
        >
          <span
            class="flex-1 h-1 rounded-full overflow-hidden bg-[var(--exile-color-bg-canvas)] border border-[var(--exile-color-border-subtle)]"
            aria-hidden="true"
          >
            <span
              class="block h-full bg-[var(--exile-color-accent-focus)] transition-[width] duration-300 ease-out"
              :style="{
                width:
                  asc.fetchProgress.total > 0
                    ? (asc.fetchProgress.done / asc.fetchProgress.total) * 100 + '%'
                    : '0%',
              }"
            ></span>
          </span>
          <span>{{ asc.fetchProgress.done }}/{{ asc.fetchProgress.total }}</span>
        </span>
      </button>
      <!-- 取得中インジケータ (未到着分、固定エリアのアセンダンシータブ内) -->
      <span
        v-if="loading && ascendancies.length < TARGET_ASCENDANCY_COUNT"
        class="inline-flex items-center gap-1.5 px-3 py-2 text-[11px] text-[var(--exile-color-text-secondary)] italic"
      >
        <span
          class="inline-block w-2 h-2 rounded-full bg-[var(--exile-color-accent-focus)] animate-pulse"
          aria-hidden="true"
        ></span>
        残り取得中…
      </span>
    </nav>

    <!-- ============================================================
      MOD 選択 → trade2 検索コントロール (アセンダンシータブと一緒に固定エリア、shrink-0)
    ============================================================ -->
    <div
      class="shrink-0 mb-3 flex items-center gap-3 px-3 py-2 rounded border border-[var(--exile-color-accent-focus)]/50 bg-[var(--exile-color-bg-elevated)] shadow-md"
    >
      <span
        v-if="selectedMods.size > 0"
        class="text-[13px] tabular-nums text-[var(--exile-color-accent-focus)]"
      >
        {{ selectedMods.size }} 件選択中
      </span>
      <span
        v-else
        class="text-[13px] text-[var(--exile-color-text-secondary)]"
      >
        MOD をチェックして trade2 で検索 →
      </span>
      <button
        v-if="selectedMods.size > 0"
        type="button"
        @click="clearSelectedMods"
        class="text-[12px] text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-text-primary)] underline"
      >
        すべて解除
      </button>
      <div class="flex-1"></div>
      <!-- 一括ティア変更 (オーナー指示 2026-05-22) -->
      <div
        v-if="selectedMods.size > 0"
        class="flex items-center gap-1.5"
        title="選択中の全 MOD のティアを一括設定"
      >
        <label class="text-[11px] text-[var(--exile-color-text-secondary)]">
          一括ティア
        </label>
        <select
          v-model.number="bulkTierValue"
          @change="applyBulkTier"
          class="px-2 py-1 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)] text-[12px] tabular-nums focus:outline-none focus:border-[var(--exile-color-accent-focus)]"
        >
          <option :value="0">制限なし</option>
          <option v-for="t in 10" :key="t" :value="t">T{{ t }}</option>
        </select>
      </div>
      <button
        type="button"
        @click="searchSelectedMods"
        :disabled="selectedMods.size === 0 || searching"
        :class="[
          'px-4 py-1.5 rounded font-medium text-[12px] transition',
          selectedMods.size > 0 && !searching
            ? 'bg-[var(--exile-color-accent-focus)] text-black hover:bg-[var(--exile-color-accent-focus-hover)]'
            : 'bg-[var(--exile-color-bg-surface)] text-[var(--exile-color-text-tertiary)] cursor-not-allowed border border-[var(--exile-color-border-subtle)]',
        ]"
      >
        {{ searching ? '検索中…' : '🔍 選択 MOD で trade2 検索' }}
      </button>
    </div>

    <!-- ============================================================
      スクロール可能本体ラッパー (アセンダンシータブまでの固定エリアの下、エクセル風完全固定)
    ============================================================ -->
    <div class="flex-1 overflow-y-auto -mx-6 px-6 pb-2">

    <!-- ============================================================
      初回ロード中 (まだ 0 件)
    ============================================================ -->
    <div
      v-if="ascendancies.length === 0 && loading && !fatalError"
      class="py-12 text-center text-[var(--exile-color-text-secondary)] text-[13px]"
    >
      <div
        class="inline-flex items-center gap-2 font-display tracking-[0.08em]"
      >
        <span
          class="inline-block w-2.5 h-2.5 rounded-full bg-[var(--exile-color-accent-focus)] animate-pulse"
          aria-hidden="true"
        ></span>
        poe.ninja からアセンダンシー使用率と上位プレイヤー装備を取得しています…
      </div>
      <p class="mt-2 text-[11px] text-[var(--exile-color-text-tertiary)]">
        初回完了まで 90〜120 秒ほどかかります
      </p>
    </div>

    <!-- ============================================================
      本体: prefix / suffix / unique 三段カード (アセンダンシー選択時のみ)
      2026-05-22: isMostlyUniqueSlot 時は CSS order でユニークを最上段に逆転表示。
      flex + order で並び替え (space-y-* は order 跨ぎだと意図しない隙間になるので gap-4)
    ============================================================ -->
    <div v-if="activeAscendancy" class="flex flex-col gap-4">
      <!-- ---------- プレフィックス ---------- -->
      <BaseCard :class="isMostlyUniqueSlot ? 'order-2' : 'order-1'">
        <div class="p-4 pl-5">
          <div class="flex items-baseline justify-between mb-2">
            <h2
              class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base flex items-center gap-2"
            >
              <span
                class="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold leading-none bg-[#9B7BCC]/25 text-[#C7A7E5] ring-1 ring-[#9B7BCC]/50"
                aria-hidden="true"
                >P</span
              >
              <span>プレフィックス</span>
              <span
                class="text-[10px] tracking-wider text-[var(--exile-color-text-secondary)]"
                >人数降順</span
              >
            </h2>
            <span
              class="text-[11px] tabular-nums text-[var(--exile-color-text-secondary)]"
              >n={{ sortedPrefix.length }}</span
            >
          </div>
          <ul class="space-y-1">
            <li
              v-for="(mod, i) in visiblePrefix"
              :key="'prefix-' + i + '-' + mod.rawTemplate"
              class="group cursor-pointer grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-3 py-1 px-1 -mx-1 rounded transition-colors hover:bg-[var(--exile-color-bg-elevated)]"
              :class="isModSelected(mod) ? 'bg-[var(--exile-color-bg-elevated)] ring-1 ring-[var(--exile-color-accent-focus)]/40' : ''"
              @click="toggleModSelect(mod)"
              :title="`クリックで選択 / 解除 (現在 ${selectedMods.size} 件選択中)`"
            >
              <input
                type="checkbox"
                :checked="isModSelected(mod)"
                :disabled="isModCheckDisabled(mod)"
                @click.stop="toggleModSelect(mod)"
                class="w-3.5 h-3.5 accent-[var(--exile-color-accent-focus)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="MOD を選択"
              />
              <span
                class="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold leading-none bg-[#9B7BCC]/25 text-[#C7A7E5] ring-1 ring-[#9B7BCC]/50"
                aria-label="接頭辞"
                >P</span
              >
              <span class="truncate text-[13px]">
                {{ mod.text }}
                <span
                  v-if="mod.inferredTier"
                  class="ml-1 text-[10px] text-[var(--exile-color-accent-focus)] tabular-nums"
                  :title="`平均値から推定ティア (T1 が最高)`"
                >T{{ mod.inferredTier }}</span>
              </span>
              <span
                class="shrink-0 tabular-nums text-[12px] text-[var(--exile-color-text-secondary)] group-hover:text-[var(--exile-color-accent-focus)]"
              >
                {{ mod.count }}人
                <span class="text-[10px] text-[var(--exile-color-text-tertiary)]"
                  >({{ pct(mod.count) }})</span
                >
              </span>
              <!-- Phase ι: ティアドロップダウン (選択中のみ表示) -->
              <select
                v-if="isModSelected(mod) && mod.tiers && mod.tiers.length > 0"
                :value="getModTierIdx(mod)"
                @click.stop
                @change="(ev) => setModTier(mod, Number((ev.target as HTMLSelectElement).value))"
                class="shrink-0 text-[11px] tabular-nums bg-[var(--exile-color-bg-canvas)] border border-[var(--exile-color-border-subtle)] rounded px-1 py-0.5 text-[var(--exile-color-text-primary)] focus:outline-none focus:border-[var(--exile-color-accent-focus)]"
                :title="`このMODのティア下限値を trade2 検索に適用 (T1=最強)`"
              >
                <option :value="-1">デフォ (制限なし)</option>
                <option v-for="(t, ti) in mod.tiers" :key="ti" :value="ti">{{ t.label }}</option>
              </select>
              <span
                v-else-if="isModSelected(mod)"
                class="shrink-0 text-[10px] text-[var(--exile-color-text-tertiary)] italic"
                :title="`bundle に該当なし / ティア情報無し`"
              >ティア無</span>
              <span v-else class="shrink-0"></span>
            </li>
            <li
              v-if="sortedPrefix.length === 0"
              class="text-[12px] text-[var(--exile-color-text-tertiary)] italic"
            >
              該当 MOD なし
            </li>
            <li
              v-if="totalLowPrefixCount > 0"
              class="pt-1"
            >
              <button
                type="button"
                @click.stop="showLowCount = !showLowCount"
                class="text-[11px] text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)] underline tabular-nums"
              >
                {{ showLowCount ? `▲ 5 人以下を隠す` : `▼ もっと見る (5 人以下 ${totalLowPrefixCount} 件)` }}
              </button>
            </li>
          </ul>
        </div>
      </BaseCard>

      <!-- ---------- サフィックス ---------- -->
      <BaseCard :class="isMostlyUniqueSlot ? 'order-3' : 'order-2'">
        <div class="p-4 pl-5">
          <div class="flex items-baseline justify-between mb-2">
            <h2
              class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base flex items-center gap-2"
            >
              <span
                class="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold leading-none bg-[#B8956A]/25 text-[#D6B98A] ring-1 ring-[#B8956A]/50"
                aria-hidden="true"
                >S</span
              >
              <span>サフィックス</span>
              <span
                class="text-[10px] tracking-wider text-[var(--exile-color-text-secondary)]"
                >人数降順</span
              >
            </h2>
            <span
              class="text-[11px] tabular-nums text-[var(--exile-color-text-secondary)]"
              >n={{ sortedSuffix.length }}</span
            >
          </div>
          <ul class="space-y-1">
            <li
              v-for="(mod, i) in visibleSuffix"
              :key="'suffix-' + i + '-' + mod.rawTemplate"
              class="group cursor-pointer grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-3 py-1 px-1 -mx-1 rounded transition-colors hover:bg-[var(--exile-color-bg-elevated)]"
              :class="isModSelected(mod) ? 'bg-[var(--exile-color-bg-elevated)] ring-1 ring-[var(--exile-color-accent-focus)]/40' : ''"
              @click="toggleModSelect(mod)"
              :title="`クリックで選択 / 解除 (現在 ${selectedMods.size} 件選択中)`"
            >
              <input
                type="checkbox"
                :checked="isModSelected(mod)"
                :disabled="isModCheckDisabled(mod)"
                @click.stop="toggleModSelect(mod)"
                class="w-3.5 h-3.5 accent-[var(--exile-color-accent-focus)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="MOD を選択"
              />
              <span
                class="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold leading-none bg-[#B8956A]/25 text-[#D6B98A] ring-1 ring-[#B8956A]/50"
                aria-label="接尾辞"
                >S</span
              >
              <span class="truncate text-[13px]">
                {{ mod.text }}
                <span
                  v-if="mod.inferredTier"
                  class="ml-1 text-[10px] text-[var(--exile-color-accent-focus)] tabular-nums"
                  :title="`平均値から推定ティア (T1 が最高)`"
                >T{{ mod.inferredTier }}</span>
              </span>
              <span
                class="shrink-0 tabular-nums text-[12px] text-[var(--exile-color-text-secondary)] group-hover:text-[var(--exile-color-accent-focus)]"
              >
                {{ mod.count }}人
                <span class="text-[10px] text-[var(--exile-color-text-tertiary)]"
                  >({{ pct(mod.count) }})</span
                >
              </span>
              <!-- Phase ι: ティアドロップダウン (選択中のみ表示) -->
              <select
                v-if="isModSelected(mod) && mod.tiers && mod.tiers.length > 0"
                :value="getModTierIdx(mod)"
                @click.stop
                @change="(ev) => setModTier(mod, Number((ev.target as HTMLSelectElement).value))"
                class="shrink-0 text-[11px] tabular-nums bg-[var(--exile-color-bg-canvas)] border border-[var(--exile-color-border-subtle)] rounded px-1 py-0.5 text-[var(--exile-color-text-primary)] focus:outline-none focus:border-[var(--exile-color-accent-focus)]"
                :title="`このMODのティア下限値を trade2 検索に適用 (T1=最強)`"
              >
                <option :value="-1">デフォ (制限なし)</option>
                <option v-for="(t, ti) in mod.tiers" :key="ti" :value="ti">{{ t.label }}</option>
              </select>
              <span
                v-else-if="isModSelected(mod)"
                class="shrink-0 text-[10px] text-[var(--exile-color-text-tertiary)] italic"
                :title="`bundle に該当なし / ティア情報無し`"
              >ティア無</span>
              <span v-else class="shrink-0"></span>
            </li>
            <li
              v-if="sortedSuffix.length === 0"
              class="text-[12px] text-[var(--exile-color-text-tertiary)] italic"
            >
              該当 MOD なし
            </li>
            <li
              v-if="totalLowSuffixCount > 0"
              class="pt-1"
            >
              <button
                type="button"
                @click.stop="showLowCount = !showLowCount"
                class="text-[11px] text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)] underline tabular-nums"
              >
                {{ showLowCount ? `▲ 5 人以下を隠す` : `▼ もっと見る (5 人以下 ${totalLowSuffixCount} 件)` }}
              </button>
            </li>
          </ul>
        </div>
      </BaseCard>

      <!-- ---------- ユニーク使用率 (スロット切替に依存しない、全装備で集計) ---------- -->
      <!-- 2026-05-22: レアに表示すべき MOD なし時は最上段に逆転 (isMostlyUniqueSlot) -->
      <BaseCard :class="isMostlyUniqueSlot ? 'order-1 ring-1 ring-[var(--exile-color-accent-focus)]/50' : 'order-3'">
        <div class="p-4 pl-5">
          <div class="flex items-baseline justify-between mb-2">
            <h2
              class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base flex items-center gap-2"
            >
              <span
                class="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold leading-none bg-[#D6B98A]/25 text-[#E8D2A4] ring-1 ring-[#D6B98A]/50"
                aria-hidden="true"
                >U</span
              >
              <span>ユニーク使用率</span>
              <span
                class="text-[10px] tracking-wider text-[var(--exile-color-text-secondary)]"
                >{{ activeSlotLabel }} / 人数降順</span
              >
              <!-- レアに表示すべき MOD が無いスロットでは採用率優位バッジを表示 -->
              <span
                v-if="isMostlyUniqueSlot"
                class="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums bg-[var(--exile-color-accent-focus)]/15 text-[var(--exile-color-accent-focus)] ring-1 ring-[var(--exile-color-accent-focus)]/40"
                :title="topUniqueName ? `最多採用: ${topUniqueName}` : ''"
                >採用率優位 · 最高 {{ topUniqueCount }} 人</span
              >
            </h2>
            <span
              class="text-[11px] tabular-nums text-[var(--exile-color-text-secondary)]"
              >n={{ activeUniques.length }}</span
            >
          </div>
          <ul class="space-y-1">
            <li
              v-for="(u, i) in visibleUniques"
              :key="'uniq-' + i + '-' + u.nameEn"
              class="group grid grid-cols-[auto_1fr_auto] items-center gap-3 py-1 px-1 -mx-1 rounded transition-colors hover:bg-[var(--exile-color-bg-elevated)] cursor-pointer"
              @mouseenter="(ev) => showUniqueTooltip(u, ev)"
              @mousemove="moveUniqueTooltip"
              @mouseleave="hideUniqueTooltip"
              @click="searchUniqueOnTrade2(u)"
            >
              <img
                v-if="u.icon"
                :src="u.icon"
                :alt="u.nameEn"
                class="w-6 h-6 object-contain shrink-0"
                referrerpolicy="no-referrer"
              />
              <span
                v-else
                class="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold leading-none bg-[#D6B98A]/25 text-[#E8D2A4] ring-1 ring-[#D6B98A]/50"
                aria-hidden="true"
                >U</span
              >
              <!-- M8: 行 <li> に cursor-pointer がついているので cursor-help 重複を解除 (統一) -->
              <span
                class="truncate text-[13px] text-[var(--exile-color-accent-focus)]"
                >{{ u.name }}</span
              >
              <span
                class="shrink-0 tabular-nums text-[12px] text-[var(--exile-color-text-secondary)] group-hover:text-[var(--exile-color-accent-focus)]"
              >
                {{ u.count }}人
                <span class="text-[10px] text-[var(--exile-color-text-tertiary)]"
                  >({{ Math.round(u.percentage * 100) }}%)</span
                >
              </span>
            </li>
            <li
              v-if="activeUniques.length === 0"
              class="text-[12px] text-[var(--exile-color-text-tertiary)] italic"
            >
              {{ activeSlotLabel }}にユニーク装備なし
            </li>
            <li v-if="totalLowUniquesCount > 0" class="pt-1">
              <button
                type="button"
                @click.stop="showLowCountUniques = !showLowCountUniques"
                class="text-[11px] text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)] underline tabular-nums"
              >
                {{ showLowCountUniques ? `▲ 5 人以下を隠す` : `▼ もっと見る (5 人以下 ${totalLowUniquesCount} 件)` }}
              </button>
            </li>
          </ul>
        </div>
      </BaseCard>
    </div>

    <!-- ============================================================
      ユニーク MOD ホバーオーバーレイ (Teleport で body 直下に出る)
    ============================================================ -->
    <UniqueTooltip :unique="hoveredUnique" :x="hoverX" :y="hoverY" />

    <!-- ============================================================
      フッター注記
    ============================================================ -->
    <footer
      v-if="activeAscendancy"
      class="mt-4 pt-3 border-t border-[var(--exile-color-border-subtle)] text-[11px] text-[var(--exile-color-text-tertiary)] flex items-center gap-4 flex-wrap"
    >
      <span>
        サンプル: 上位 {{ activeAscendancy.sampleSize }} 人 (使用率 {{ activeAscendancy.usagePercent.toFixed(1) }}%)
      </span>
      <span class="inline-flex items-center gap-1">
        <span
          class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] font-bold leading-none bg-[#9B7BCC]/25 text-[#C7A7E5] ring-1 ring-[#9B7BCC]/50"
          >P</span
        >
        = Prefix
      </span>
      <span class="inline-flex items-center gap-1">
        <span
          class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] font-bold leading-none bg-[#B8956A]/25 text-[#D6B98A] ring-1 ring-[#B8956A]/50"
          >S</span
        >
        = Suffix
      </span>
      <span class="italic">チェック → 上部「trade2 検索」ボタンで一括検索</span>
    </footer>

    </div><!-- /scrollable body -->
  </section>
</template>
