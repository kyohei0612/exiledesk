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
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { type UnlistenFn } from "@tauri-apps/api/event";
import BaseCard from "../components/decor/BaseCard.vue";
import UniqueTooltip from "../components/decor/UniqueTooltip.vue";
import {
  startCraftDiscoveryV2,
  clearCraftV2Cache,
  openTrade2ForSelectedMods,
  openTrade2ForUnique,
  fetchEconomyLeagues,
  type AggregatedAscendancy,
  type LeagueInfo,
  type ModEntry,
  type SlotKey,
  type SlotMods,
  type SnapshotMeta,
  type UniqueUsage,
} from "../services/craft-discovery-v2";

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

/** 漸進取得結果。アセンダンシー id で merge する。 */
const ascendancies = ref<AggregatedAscendancy[]>([]);

/** 上タブで選択中のアセンダンシー id (英語クラス名 kebab) */
const activeAscendancyId = ref<string>("");

/** 右上トグル: Ring / Amulet */
const activeSlot = ref<SlotKey>("ring");

/** 取得中フラグ (onMounted で true、onDone で false) */
const loading = ref<boolean>(true);
/** 致命的エラー (invoke 自体が失敗) */
const fatalError = ref<string | null>(null);
/** 非致命的エラー (search/character/aggregate)、テキスト表示用に直近 1 件を保持 */
const lastWarn = ref<string | null>(null);

/** 完了スナップショット */
const snapshot = ref<SnapshotMeta | null>(null);
/** 完了時刻 (HH:MM:SS) */
const lastUpdatedAt = ref<string | null>(null);

/** 現在取得中のアセンダンシー名 (一番最後に来た progress 名で代用) */
const currentlyFetching = ref<string | null>(null);

// Phase ξ: poe.ninja リーグ選択
/** 動的取得した全リーグ一覧 (通常/HC/SSF/Standard 等、起動時 1 回 fetch) */
const availableLeagues = ref<LeagueInfo[]>([]);
/** dropdown 選択中のリーグ url (空文字 = メイン economyLeagues[0] = 現リーグ) */
const selectedLeagueUrl = ref<string>("");
/** リーグ一覧の取得失敗フラグ (dropdown 隠す判定用) */
const leaguesLoadFailed = ref<boolean>(false);

/**
 * Phase ζ: キャッシュから即時表示中フラグ。
 * - onCacheReady で true、最初の差分 progress (= 通常の onProgress) で false。
 * - UI ヘッダーに「(キャッシュから X 件即表示中、差分更新中…)」を出すために使う。
 */
const showingFromCache = ref<boolean>(false);
const cacheItemCount = ref<number>(0);

/** unlisten 関数 (UI cleanup 用) */
let unlistenRef: UnlistenFn | null = null;

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
    await openTrade2ForUnique({ nameEn: u.nameEn, league });
  } catch (e) {
    console.warn("[CraftDiscoveryV2B] unique trade2 search failed:", e);
    lastWarn.value =
      "trade2 検索失敗: " + (e instanceof Error ? e.message : String(e));
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
// 進捗マージ + 漸進更新
// ---------------------------------------------------------------------------

function mergeAscendancy(agg: AggregatedAscendancy): void {
  const idx = ascendancies.value.findIndex((a) => a.id === agg.id);
  if (idx >= 0) {
    // 既存を置き換え (同一 id の上書きは「更新」ボタン経由で起こりうる)
    ascendancies.value.splice(idx, 1, agg);
  } else {
    ascendancies.value.push(agg);
  }
  // 初回到着時は自動でタブ選択
  if (!activeAscendancyId.value) {
    activeAscendancyId.value = agg.id;
  }
  // M4: 並列受信時の逆順表示防止。
  //   - fetchProgress 完了済 (done >= total) のアセンダンシーは「直近: 〜」表示から外す
  //   - 未完了 (取得進行中) のアセンダンシーだけ「直近: 〜」に出す
  const fp = agg.fetchProgress;
  if (fp && fp.total > 0 && fp.done < fp.total) {
    currentlyFetching.value = agg.name;
  } else if (currentlyFetching.value === agg.name) {
    // 自分が finished に転じた瞬間は表示から除去 (別の未完了アセが拾うのを待つ)
    currentlyFetching.value = null;
  }
}

// ---------------------------------------------------------------------------
// 取得トリガー
// ---------------------------------------------------------------------------

/**
 * Phase ζ: 取得トリガー。
 * - useCache=true (default): ディスクキャッシュロード → 即時表示 → 差分更新
 * - useCache=false: キャッシュ無視で全取得 (「キャッシュ削除 + 全取得」ボタン用)
 */
async function startFetch(useCache: boolean = true): Promise<void> {
  // 前回 listen を破棄してからスタート
  if (unlistenRef) {
    unlistenRef();
    unlistenRef = null;
  }
  ascendancies.value = [];
  activeAscendancyId.value = "";
  loading.value = true;
  fatalError.value = null;
  lastWarn.value = null;
  snapshot.value = null;
  lastUpdatedAt.value = null;
  currentlyFetching.value = null;
  showingFromCache.value = false;
  cacheItemCount.value = 0;

  const un = await startCraftDiscoveryV2({
    topNAscendancies: TARGET_ASCENDANCY_COUNT,
    topNPerAscendancy: 50,
    useCache,
    leagueUrl: selectedLeagueUrl.value || undefined,
    onCacheReady: (cachedAggs, cache) => {
      // Phase ζ: キャッシュ即時表示
      ascendancies.value = [...cachedAggs];
      if (cachedAggs.length > 0 && !activeAscendancyId.value) {
        activeAscendancyId.value = cachedAggs[0].id;
      }
      showingFromCache.value = true;
      cacheItemCount.value = cachedAggs.length;
      // snapshot は cache から仮埋め (差分更新後に上書き)
      snapshot.value = {
        league_url: cache.league_url,
        snapshot_name: cache.snapshot_name,
        version: cache.snapshot_version,
      };
      if (cache.saved_at) {
        lastUpdatedAt.value =
          formatHms(new Date(cache.saved_at * 1000)) + " (キャッシュ)";
      }
    },
    onProgress: (agg) => {
      // 差分 progress が初めて届いた時点でキャッシュ表示ラベルを下げる
      if (showingFromCache.value) {
        showingFromCache.value = false;
        // M3: キャッシュ表示中の "(キャッシュ)" ラベルを「差分取得中…」に上書き
        // (onDone で `formatHms(new Date())` に再上書きされる)
        lastUpdatedAt.value = "差分取得中…";
      }
      mergeAscendancy(agg);
    },
    onError: (msg) => {
      // 非致命的エラーは loading 継続、最新 1 件だけ画面表示
      lastWarn.value = msg;
      // L8: 「直近: 〜」表示がエラー後も残るのを防ぐ (実際の取得は続行)
      currentlyFetching.value = null;
    },
    onDone: (snap) => {
      snapshot.value = snap;
      loading.value = false;
      currentlyFetching.value = null;
      lastUpdatedAt.value = formatHms(new Date());
      showingFromCache.value = false;
    },
    onFatal: (msg) => {
      fatalError.value = msg;
      loading.value = false;
      currentlyFetching.value = null;
      showingFromCache.value = false;
    },
  });
  unlistenRef = un;
}

/**
 * Phase ζ: キャッシュ削除 + 全取得 (snapshot_version 変動時と同じ動き)。
 * オーナー指示で「リーグ更新の検知が漏れた」「キャッシュが壊れた」ケースのリカバリ用に用意。
 */
async function forceRefetch(): Promise<void> {
  await clearCraftV2Cache();
  await startFetch(false);
}

/**
 * Phase ξ: dropdown で選択中のリーグで再取得する。
 * - キャッシュは単一ファイル。Rust 側で league_url が一致しない時は流用しないので、
 *   別リーグに切替えると差分モードに入らず フル取得 → キャッシュ上書きになる。
 * - 同じリーグに戻すと、saveCraftV2Cache が上書きしたデータが流用される。
 */
async function refetchWithSelectedLeague(): Promise<void> {
  if (unlistenRef) {
    try {
      unlistenRef();
    } catch {
      /* noop */
    }
    unlistenRef = null;
  }
  // キャッシュは消さず、Rust 側の league_url 不一致判定に任せる (流用無効 → 再取得 → 上書き)
  await startFetch(true);
}

function formatHms(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(async () => {
  // Phase ξ: リーグ一覧を先に取得して dropdown を埋める。
  // 失敗しても致命的ではない (selectedLeagueUrl='' で従来通り economyLeagues[0] が使われる)。
  try {
    const leagues = await fetchEconomyLeagues();
    availableLeagues.value = leagues;
    leaguesLoadFailed.value = false;
    // 初期選択は「メイン (現リーグ)」= 空文字 = Rust 側で economyLeagues[0] にフォールバック
    if (!selectedLeagueUrl.value && leagues.length > 0) {
      selectedLeagueUrl.value = leagues[0].url;
    }
  } catch (err) {
    console.warn("[CraftDiscoveryV2B] fetchEconomyLeagues failed:", err);
    leaguesLoadFailed.value = true;
  }
  // 起動時自動 trigger (Phase ε)
  void startFetch();
});

onBeforeUnmount(() => {
  if (unlistenRef) {
    try {
      unlistenRef();
    } catch {
      /* noop */
    }
    unlistenRef = null;
  }
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
      lastWarn.value = `同カテゴリの選択を自動解除しました: ${ousted.join(" / ")}`;
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
      // missing mods があれば警告バナーに静かに通知
      if (r.missingMods.length > 0) {
        lastWarn.value =
          `[trade2] stat ID 未マッピングでスキップした MOD: ${r.missingMods.join(" / ")}`;
      }
    } catch (e) {
      console.warn("[CraftDiscoveryV2B] trade2 search failed:", e);
      lastWarn.value =
        "trade2 検索失敗: " + (e instanceof Error ? e.message : String(e));
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
          <span
            v-else-if="lastUpdatedAt"
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
    <div
      v-else-if="lastWarn"
      class="mb-3 px-3 py-1.5 rounded border border-amber-700/50 bg-amber-900/15 text-[11px] text-amber-200"
    >
      <strong class="font-display tracking-[0.05em]">警告:</strong>
      {{ localizeError(lastWarn) }}
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
                @click.stop="toggleModSelect(mod)"
                class="w-3.5 h-3.5 accent-[var(--exile-color-accent-focus)] cursor-pointer"
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
                @click.stop="toggleModSelect(mod)"
                class="w-3.5 h-3.5 accent-[var(--exile-color-accent-focus)] cursor-pointer"
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
