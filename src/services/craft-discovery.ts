/**
 * クラフト発見君 Phase 1 集計ロジック v2
 *
 * オーナー指示 (2026-05-19):
 *   「トレードで沢山出品されてる中で、同じMODが複数被ってる（ティアは無視）
 *    ものを可視化して教えるツール」
 *
 * v2 改修点 (A/B クロスレビュー反映, 2026-05-19):
 *   - 正規化を段階パイプライン化（過剰縮約防止、JA 特有エッジ対応）
 *   - fetch レスポンスから mod を取り出す関数を多段 fallback
 *   - sort 単位の try/catch で部分成功設計
 *   - 429 検出時の指数 backoff retry（最大 3 回）
 *   - de-dup 率 / 空 mod 率を結果に含める
 *
 * Phase 1 集計:
 *   1. trade2 search を 3 ソート（indexed:desc / price:asc / price:desc）で投げる
 *   2. listing id 列を 10 件 batch で trade2 fetch
 *   3. 各 listing の explicit mod 群を fallback 付きで取り出す
 *   4. 数値除去でティア非依存 modKey を生成
 *   5. modKey ごとに出現回数カウント、降順返却
 */

import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  translateModText,
  getModStatIds,
  getModAffixType,
} from "../data/mod-translations";
import { isTauriRuntime } from "../utils/isTauriRuntime";

// ━━ trade2 API 型 ━━

interface SearchResponse {
  id?: string;
  total?: number;
  result?: string[];
}

interface FetchedListing {
  id: string;
  listing?: {
    indexed?: string;
    price?: {
      amount?: number;
      currency?: string;
    };
  };
  item?: {
    explicitMods?: string[];
    implicitMods?: string[];
    enchantMods?: string[];
    craftedMods?: string[];
    runeMods?: string[];
    extended?: {
      /**
       * stat_id と explicitMods 内 index の対応表。
       * 各エントリ: [stat_id, [mod_index_array]]
       * 例: ["explicit.stat_1573130764", [3]] = stat_1573130764 は explicitMods[3] に対応
       */
      hashes?: {
        explicit?: Array<[string, number[]]>;
        implicit?: Array<[string, number[]]>;
      };
      mods?: {
        explicit?: Array<{
          name?: string;
          tier?: string;
          /**
           * 各 magnitude エントリ:
           *   hash: 対応する stat_id
           *   min/max: その stat の実 roll 値（min/max ですが string 型で返ってくることに注意）
           */
          magnitudes?: Array<{
            hash?: string;
            min?: string | number;
            max?: string | number;
          }>;
        }>;
      };
    };
  };
}

interface FetchResponse {
  result?: FetchedListing[];
}

// ━━ 公開型 ━━

export interface ModCount {
  /** ティア除去後の正規化 key（出現一致判定に使う） */
  modKey: string;
  /** ランキング表示用のサンプル原文（最初に出会った listing の原文） */
  rawSample: string;
  /** 出現回数（全 listing 横断、explicit のみ集計） */
  count: number;
}

export interface ClusterCount {
  /** sorted modKey を join した一意 hash */
  clusterHash: string;
  /** クラスタを構成する modKey 列（sorted） */
  modKeys: string[];
  /** modKeys[i] に対応する代表原文（最初に出会った listing の原文、表示用） */
  rawSamples: string[];
  /** このクラスタ構成を持つ listing 数 */
  count: number;
  /** 表示用 listing id サンプル（最大 10 件） */
  listingIds: string[];
  /** 過去 RECENT_WINDOW_HOURS (12h) 以内に indexed された listing 数 */
  recentCount: number;
  /** 価格中央値（divine 建てのみ）、null は集計対象なし */
  priceMedian: number | null;
  /** 25 パーセンタイル */
  priceP25: number | null;
  /** 75 パーセンタイル */
  priceP75: number | null;
  /** 中央値計算に使った listing 数（divine 建てに限る） */
  pricedCount: number;
  /** 新鮮率 = recentCount / count（売れ筋判定の主指標、オーナー判断 2026-05-19） */
  freshRate: number;
  /**
   * modKeys[i] に対応する stat ID 列（trade2 サイト遷移時のフィルタ用）。
   * 最初に出会った listing の hashes から取得、bundle 逆引き不要 = 100% 正確。
   * 空配列は「stat ID が listing レスポンスに無かった」状態（古い listing 等）。
   */
  statIdsPerMod: string[][];
  /**
   * stat_id ごとに、cluster 内 listing で観測された roll 値のうち **最大値**。
   * オーナー指示 2026-05-19: 「2件被ってたら数値の高い方で検索かけちゃっていい」。
   * trade2 search クエリの stat filter に value.min として入れる
   * → cluster の最高スペック listing と同等以上が検索対象になる（高品質オプション狙い）。
   */
  statMinValues: Record<string, number>;
  /**
   * Phase 1.5: modKeys[i] に対応する prefix/suffix 区分。
   * bundle 逆引きで判定。同 text_en で曖昧な 7 件と bundle 非ヒット mod は "unknown"。
   * affixMode="merged" のとき全要素 "unknown" となる（後方互換動作）。
   */
  affixTypes: Array<"prefix" | "suffix" | "unknown">;
  /** Phase 1.5: クラスタ内 prefix 数（modKeys のうち type="prefix" の件数） */
  prefixCount: number;
  /** Phase 1.5: クラスタ内 suffix 数 */
  suffixCount: number;
  /** Phase 1.5: クラスタ内 affix 不明数 */
  affixUnknownCount: number;
}

/** 「直近」判定の時間窓（オーナー指示 2026-05-19: 過去 12 時間） */
export const RECENT_WINDOW_HOURS = 12;

// ━━ Phase 1 manual-controls 追加: 価格レンジ / 取得件数 / ホット閾値 ━━

/**
 * 価格レンジ（Phase 1, manual-controls.md §1）。
 * Phase 1 は通貨を **divine 固定**（オーナー指示 2026-05-21）。
 * Phase 2 で chaos/exalt 切替を残課題 #1 として再評価予定。
 */
export interface PriceRange {
  /** divine 建て下限（含む）、1 以上 */
  min: number;
  /** divine 建て上限（含む）、max <= 2000 */
  max: number;
}

/**
 * ホット判定設定（manual-controls.md §3）。
 * - countModClusters / buildResultFromState の派生計算で参照。
 * - **再 fetch 不要**: 累積 state があれば slider を動かすだけで瞬時再集計可。
 */
export interface HotConfig {
  /** ホット判定の時間窓 (hours). 1 / 3 / 6 / 12 のいずれか */
  windowHours: 1 | 3 | 6 | 12;
  /** 「ホット印」を付ける recentCount の下限（5-50, step 5 推奨） */
  minCount: number;
}

/** Phase 1 規定値（既存 RECENT_WINDOW_HOURS=12 と整合、破壊的変更を避ける） */
export const DEFAULT_HOT_CONFIG: HotConfig = {
  windowHours: 12,
  minCount: 20,
};

/** Phase 1 価格レンジ規定値（既存実装の "1-2000 div" を踏襲） */
export const DEFAULT_PRICE_RANGE: PriceRange = {
  min: 1,
  max: 2000,
};

/**
 * カテゴリ → trade2 API category option 文字列マップ。
 * Phase 1 では ring/amulet のみ実装、Phase 2a で防具 5 種・2b で武器を追加する hook。
 * manual-controls.md §4 の `categoryToOption()` 切り出し（A/B 統合案で B 採用）。
 *
 * 戻り値が null の場合 = Phase 1 未対応カテゴリ。呼び側で例外 or fallback すること。
 */
export function categoryToOption(cat: DiscoveryCategory): string {
  // Phase 1 では 2 種類のみ。Phase 2a/2b で追加する場合はここを拡張:
  //   case "belt":        return "accessory.belt";
  //   case "gloves":      return "armour.gloves";
  //   case "helmet":      return "armour.helmet";
  //   case "boots":       return "armour.boots";
  //   case "body_armour": return "armour.chest";
  //   case "weapon.onesword": return "weapon.onesword";  // Phase 2b でベース種別分岐
  switch (cat) {
    case "ring":
      return "accessory.ring";
    case "amulet":
      return "accessory.amulet";
  }
}

/** クラスタサイズ (1-6 mod 被り、オーナー指示 2026-05-19) */
export type ClusterSize = 1 | 2 | 3 | 4 | 5 | 6;

export const CLUSTER_SIZES: ClusterSize[] = [1, 2, 3, 4, 5, 6];

/**
 * 取得件数の技術上限 (1 サイクルあたり).
 *
 * Phase 1 manual-controls.md §2 拡張 (2026-05-21):
 *   - 300/500/800/1000 の 4 プリセットに拡張
 *   - 1 sort = 100 件上限なので、500=5 sort, 800=8 sort, 1000=10 sort 必要
 *   - 但し trade2 search の sort kind 数は実質 indexed-desc / price-asc / price-desc の 3 種
 *     500+ 件は 1 sort で 100 件取得 + ソート切替 + 累積モードで段階的に取る必要あり
 *     → 現状 sorts = ceil(targetCount / 100) で 1-10 まで sortRound として扱う
 *     （4 round 目以降は indexed-desc を再叩きするだけ = 累積モード時の冗長化と等価）
 *   - 1000 件は 15 分 + paginate 非対応 + 価格帯偏りで実態 600-800 件、UI 警告必須
 */
export const MAX_LISTINGS_PER_CYCLE = 1000;

/** 取得件数プリセット（UI ボタン用、Phase 1 manual-controls.md §2 採用） */
export const LISTING_COUNT_PRESETS: number[] = [300, 500, 800, 1000];

/** デフォルト取得件数 */
export const DEFAULT_LISTING_COUNT = 300;

/** 警告モーダル必須の閾値（1000 件は 15 分・全損リスクで意思確認必要） */
export const TARGET_COUNT_WARN_THRESHOLD = 1000;

// 後方互換 (旧名)
export const ACCUMULATION_LIMIT = MAX_LISTINGS_PER_CYCLE;

export interface DiscoveryProgress {
  phase: "search" | "fetch" | "aggregate" | "done" | "retry";
  message: string;
  searchedSorts?: number;
  fetchedListings?: number;
}

export interface DiscoveryResult {
  /** 累積 unique listing 数（state.allListings.length と一致） */
  totalListings: number;
  /** 直近サイクルで新規追加された listing 数 */
  newListingsThisCycle: number;
  /** 取得サイクル数（state.cycleCount） */
  cycleCount: number;
  /** search レスポンスの最大 total（母集団規模の参考値、直近サイクル分） */
  populationTotal: number;
  /** 累積データに対する 単一 mod ランキング（rawSample 付きの素朴版、デバッグ確認用に残置） */
  modRanking: ModCount[];
  /** 累積データに対する listing クラスタリング (N = 1 / 2 / 3 / 4 / 5 / 6) */
  clustersBySize: Record<ClusterSize, ClusterCount[]>;
  /** ISO datetime */
  fetchedAt: string;
  category: "ring" | "amulet";
  /** 累積中、explicitMods が空 / 取れなかった listing の割合 (0.0-1.0) */
  emptyModRate: number;
  /** 直近サイクルで「既に持ってた listing」が新規取得候補の何割だったか (0.0-1.0) */
  dedupRate: number;
  /** 部分失敗した sort 列（直近サイクル、空なら全成功） */
  failedSorts: string[];
  /** 次回呼び出しに渡す state（累積データの本体） */
  state: DiscoveryState;
}

export type DiscoveryCategory = "ring" | "amulet";

/**
 * 累積取得用の引き継ぎ state。
 * オーナー仕様 (2026-05-19): 「最新から 300 件ずつ取り込みまくる」
 *   = 取得を繰り返すたびに seenIds と allListings を引き継ぎ、新規分のみ追加。
 */
export interface DiscoveryState {
  /** 既に fetch 済みの listing id（重複弾き用） */
  seenIds: Set<string>;
  /** 累積した listing 群 */
  allListings: FetchedListing[];
  /** 取得サイクル数（何回 runDiscovery を回したか） */
  cycleCount: number;
  /** 累積中のカテゴリ（途中で違うカテゴリを混ぜるのを防ぐ） */
  category: DiscoveryCategory;
}

export function createEmptyState(category: DiscoveryCategory): DiscoveryState {
  return {
    seenIds: new Set<string>(),
    allListings: [],
    cycleCount: 0,
    category,
  };
}

// ━━ JSON 永続化（オーナー指示 2026-05-19: 自動保存） ━━

interface SavedDiscovery {
  version: number;
  savedAt: string;
  category: DiscoveryCategory;
  league: string;
  cycleCount: number;
  /** FetchedListing の配列をそのまま JSON 透過保存 */
  listings: FetchedListing[];
}

/** Rust 経由で <app_data_dir>/discovery-<cat>-<league>.json に保存 */
export async function saveDiscoveryState(
  state: DiscoveryState,
  league: string,
): Promise<void> {
  // dev-server (browser) では Tauri 環境ではないためスキップ（no-op で型上は成功扱い）
  if (!isTauriRuntime()) return;
  const payload: SavedDiscovery = {
    version: 1,
    savedAt: new Date().toISOString(),
    category: state.category,
    league,
    cycleCount: state.cycleCount,
    listings: state.allListings,
  };
  await invoke("discovery_save", {
    category: state.category,
    league,
    payload,
  });
}

/** ファイルが無ければ null。バージョン違い / カテゴリ不一致も null 扱い */
export async function loadDiscoveryState(
  category: DiscoveryCategory,
  league: string,
): Promise<DiscoveryState | null> {
  // dev-server (browser) では Tauri 環境ではないためスキップ（呼び側は null で「未保存扱い」）
  if (!isTauriRuntime()) return null;
  const result = await invoke<SavedDiscovery | null>("discovery_load", {
    category,
    league,
  });
  if (!result) return null;
  if (result.version !== 1) return null;
  if (result.category !== category) return null;
  const listings = Array.isArray(result.listings) ? result.listings : [];
  return {
    seenIds: new Set(
      listings.map((l) => l.id).filter((id): id is string => !!id),
    ),
    allListings: listings,
    cycleCount: result.cycleCount ?? 0,
    category,
  };
}

export async function clearDiscoveryState(
  category: DiscoveryCategory,
  league: string,
): Promise<void> {
  // dev-server (browser) では Tauri 環境ではないためスキップ
  if (!isTauriRuntime()) return;
  await invoke("discovery_clear", { category, league });
}

// （即売れ判定 / snapshot 差分ロジックはオーナー指示 2026-05-19 で削除済。
//   代わりに ClusterCount.recentCount で「直近 12h 内 indexed listing 数」を使う。）

// ━━ クラスタを trade2 サイトで開く（オーナー指示 2026-05-19） ━━

/**
 * クラスタの mod 群を stat フィルタにして trade2 検索クエリを構築。
 *
 * @param cluster クラスタ（rawSamples or 元の trade2 text）
 * @returns trade2 search クエリ。stat ID 逆引きに失敗した mod は無視。
 */
function buildClusterSearchQuery(
  cluster: ClusterCount,
  category: DiscoveryCategory,
  priceRange: PriceRange = DEFAULT_PRICE_RANGE,
): { query: unknown; missingMods: string[] } {
  const statFilters: Array<{
    id: string;
    value: { min: number };
    disabled: boolean;
  }> = [];
  const missingMods: string[] = [];
  const seenStatIds = new Set<string>();

  // 優先: listing 直接由来の stat ID (cluster.statIdsPerMod) を使う = 100% 正確
  // フォールバック: bundle 逆引き (古い listing で hashes 無い場合)
  for (let i = 0; i < cluster.modKeys.length; i++) {
    let statIds: string[] = cluster.statIdsPerMod?.[i] ?? [];
    if (statIds.length === 0) {
      const sample = cluster.rawSamples[i];
      if (sample) statIds = getModStatIds(sample);
      if (statIds.length === 0) {
        const modKey = cluster.modKeys[i];
        if (modKey) statIds = getModStatIds(modKey);
      }
    }
    if (statIds.length === 0) {
      missingMods.push(cluster.rawSamples[i] ?? cluster.modKeys[i] ?? "");
      continue;
    }
    for (const sid of statIds) {
      if (seenStatIds.has(sid)) continue;
      seenStatIds.add(sid);
      // 観測された最小 roll 値があれば使う（cluster 内全 listing が含まれる検索条件）
      // 無い場合は min: 1（fallback、ほぼ全 listing にヒット）
      const observedMin = cluster.statMinValues?.[sid];
      const minValue =
        typeof observedMin === "number" && isFinite(observedMin)
          ? observedMin
          : 1;
      statFilters.push({
        id: sid,
        value: { min: minValue },
        disabled: false,
      });
    }
  }

  const categoryOption = categoryToOption(category);

  // 6 mod 縛り（オーナー指示 2026-05-19: 「絞るために 2 mod 検索でも 6 mod 付いてるものだけ」）
  const sixModFilter = {
    id: "pseudo.pseudo_number_of_affix_mods",
    value: { min: 6 },
    disabled: false,
  };

  return {
    query: {
      query: {
        status: { option: "any" },
        stats: [
          { type: "and", filters: [...statFilters, sixModFilter] },
        ],
        filters: {
          type_filters: {
            filters: {
              category: { option: categoryOption },
              rarity: { option: "rare" },
            },
          },
          // INSTANT BUYOUT + 価格レンジ（Phase 1 で priceRange 引数化、取得時と同じ条件）
          //   sale_type: priced = 即決のみ
          //   price: priceRange (default 1-2000 div) = Mirror tier 外れ値を弾く
          trade_filters: {
            filters: {
              sale_type: { option: "priced" },
              price: {
                min: priceRange.min,
                max: priceRange.max,
                option: "divine",
              },
            },
          },
          misc_filters: {
            filters: { corrupted: { option: "false" } },
          },
        },
      },
      sort: { indexed: "desc" },
    },
    missingMods,
  };
}

interface SearchPostResponse {
  id?: string;
}

/**
 * クラスタを trade2 サイトで開く（OS デフォルトブラウザ）。
 *
 * 1. cluster.rawSamples / modKeys から stat ID 群を bundle で逆引き
 * 2. trade2_search を POST → search id を取得
 * 3. trade2 サイト URL を組み立てて openUrl で開く
 *
 * 失敗時はエラーメッセージを throw（呼び側で UI に表示）。
 */
export async function openClusterInTrade2(args: {
  cluster: ClusterCount;
  league: string;
  category: DiscoveryCategory;
  /** Phase 1 manual-controls 拡張: trade2 サイト遷移時にも同じ価格レンジを反映 */
  priceRange?: PriceRange;
}): Promise<{ openedUrl: string; missingMods: string[]; statCount: number }> {
  const { cluster, league, category, priceRange } = args;
  const { query, missingMods } = buildClusterSearchQuery(
    cluster,
    category,
    priceRange ?? DEFAULT_PRICE_RANGE,
  );

  // dev-server (browser) では Tauri 環境ではないためスキップ（呼び側は throw で挙動表現）
  if (!isTauriRuntime()) {
    throw new Error(
      "trade2 連携は Tauri ネイティブ環境でのみ動作します（ブラウザ dev では無効）",
    );
  }

  // stat filter が 0 件だと検索条件無しになるので、せめてカテゴリ filter で開く
  const search = await invoke<SearchPostResponse>("trade2_search", {
    req: { league, query },
  });

  if (!search.id) {
    throw new Error("trade2_search にレスポンス id がありません");
  }

  // URL 構築（リーグ名は URL エンコード必要）
  const url = `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(league)}/${search.id}`;
  await openUrl(url);

  const queryNested = (query as { query?: { stats?: Array<{ filters?: unknown[] }> } }).query;
  const statCount = queryNested?.stats?.[0]?.filters?.length ?? 0;

  return { openedUrl: url, missingMods, statCount };
}

// ━━ サンプルデータ（動作確認用、オーナー指示 2026-05-19） ━━

/**
 * オーナーが共有した指輪 2 枚（巨大な指 / 死肉の変化）を含む 10 件のサンプル。
 * 集計ロジックの動作確認用。trade2 取得を待たずに UI で結果が見られる。
 *
 * 6mod 構成を意図的に被らせて、5mod 被り / 4mod 被りが検出されるよう作ってある。
 */
export function getSampleListings(): FetchedListing[] {
  const mk = (id: string, mods: string[]): FetchedListing => ({
    id,
    listing: {
      indexed: "2026-05-19T12:00:00Z",
      price: { amount: 5, currency: "divine" },
    },
    item: { explicitMods: mods },
  });

  return [
    // 1. 巨大な指 金の指輪（オーナー画像 1）
    mk("sample-001", [
      "見つかるアイテムのレアリティが14%増加する",
      "13から22の火ダメージをアタックに追加する",
      "火ダメージが28%増加する",
      "冷気ダメージが28%増加する",
      "知性 +31",
      "火耐性 +31%",
      "冷気耐性 +34%",
    ]),
    // 2. 死肉の変化 プリズムの指輪（オーナー画像 2）
    mk("sample-002", [
      "12から24の物理ダメージをアタックに追加する",
      "火ダメージが27%増加する",
      "冷気ダメージが24%増加する",
      "見つかるアイテムのレアリティが18%増加する",
      "雷耐性 +38%",
      "冷気と混沌耐性 +15%",
    ]),
    // 3. 1 と同 5mod 構成（属性束ね効果確認用、物理 → 火 にすると 4mod 被り）
    mk("sample-003", [
      "見つかるアイテムのレアリティが12%増加する",
      "15から25の火ダメージをアタックに追加する", // 数値違い、束ね対象
      "火ダメージが30%増加する",
      "冷気ダメージが22%増加する",
      "知性 +28",
      "火耐性 +29%",
      "冷気耐性 +30%",
    ]),
    // 4. 1 と完全 6mod 一致（数値だけ違う、ティア無視で完全同一）
    mk("sample-004", [
      "見つかるアイテムのレアリティが16%増加する",
      "14から20の火ダメージをアタックに追加する",
      "火ダメージが25%増加する",
      "冷気ダメージが30%増加する",
      "知性 +33",
      "火耐性 +28%",
      "冷気耐性 +32%",
    ]),
    // 5. 別構成: ライフ系
    mk("sample-005", [
      "最大ライフ +75",
      "全ての能力値 +12",
      "全ての元素耐性 +12%",
      "見つかるアイテムのレアリティが10%増加する",
      "10から18の雷ダメージをアタックに追加する",
      "敏捷性 +24",
    ]),
    // 6. 5 と類似 (5mod 被り)
    mk("sample-006", [
      "最大ライフ +80",
      "全ての能力値 +14",
      "全ての元素耐性 +15%",
      "見つかるアイテムのレアリティが12%増加する",
      "12から22の雷ダメージをアタックに追加する",
      "力 +26",
    ]),
    // 7. 攻撃速度構成
    mk("sample-007", [
      "攻撃速度が10%増加する",
      "クリティカルストライクのチャンスが30%増加する",
      "クリティカルダメージのボーナスが20%増加する",
      "11から23の物理ダメージをアタックに追加する",
      "正確性 +180",
      "火耐性 +35%",
    ]),
    // 8. 7 と類似
    mk("sample-008", [
      "攻撃速度が8%増加する",
      "クリティカルストライクのチャンスが28%増加する",
      "クリティカルダメージのボーナスが18%増加する",
      "10から20の冷気ダメージをアタックに追加する", // 7 では物理、束ね対象
      "正確性 +160",
      "冷気耐性 +38%",
    ]),
    // 9. 全く別構成（1 と被らせない）
    mk("sample-009", [
      "マナの最大値 +50",
      "マナリチャージ率が20%増加する",
      "発動速度が8%増加する",
      "知性 +35",
      "雷耐性 +40%",
      "混沌耐性 +18%",
    ]),
    // 10. 9 と類似
    mk("sample-010", [
      "マナの最大値 +45",
      "マナリチャージ率が22%増加する",
      "発動速度が10%増加する",
      "知性 +30",
      "雷耐性 +35%",
      "混沌耐性 +20%",
    ]),
  ];
}


/**
 * 既存 listing 配列から DiscoveryResult を生成（ロード時の表示再構築用）。
 *
 * Phase 1 manual-controls.md §3: hotConfig を渡すと recent 判定の時間窓・件数閾値を
 * 反映した cluster を返す（再 fetch 不要、UI スライダー変更で即呼び直し可能）。
 */
export function buildResultFromState(
  state: DiscoveryState,
  hotConfig: HotConfig = DEFAULT_HOT_CONFIG,
  affixMode: AffixMode = DEFAULT_AFFIX_MODE,
): DiscoveryResult {
  const { ranking, emptyCount } = countModOccurrences(state.allListings);
  const denom = state.allListings.length || 1;
  const emptyModRate = emptyCount / denom;
  const clustersBySize = {
    1: countModClusters(state.allListings, 1, hotConfig, affixMode),
    2: countModClusters(state.allListings, 2, hotConfig, affixMode),
    3: countModClusters(state.allListings, 3, hotConfig, affixMode),
    4: countModClusters(state.allListings, 4, hotConfig, affixMode),
    5: countModClusters(state.allListings, 5, hotConfig, affixMode),
    6: countModClusters(state.allListings, 6, hotConfig, affixMode),
  } as Record<ClusterSize, ClusterCount[]>;

  return {
    totalListings: state.allListings.length,
    newListingsThisCycle: 0,
    cycleCount: state.cycleCount,
    populationTotal: 0,
    modRanking: ranking,
    clustersBySize,
    fetchedAt: new Date().toISOString(),
    category: state.category,
    emptyModRate,
    dedupRate: 0,
    failedSorts: [],
    state,
  };
}

// ━━ 内部ユーティリティ ━━

const SLEEP_BETWEEN_REQ_MS = 7_000;
const MAX_RETRY_ON_429 = 3;

/**
 * 中止対応の sleep。AbortSignal が abort されたら即 reject。
 * 待機中に 500ms ごとに残時間を notify する（カウントダウン UI 用）。
 */
async function sleepCancellable(
  ms: number,
  signal?: AbortSignal,
  onTick?: (remainingMs: number) => void,
): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const remaining = end - Date.now();
    onTick?.(remaining);
    await new Promise<void>((r) => setTimeout(r, Math.min(500, remaining)));
  }
}

/** AbortError かどうか判定 */
function isAbortError(e: unknown): boolean {
  return (
    e instanceof DOMException && e.name === "AbortError"
  ) || (e instanceof Error && e.name === "AbortError");
}

/** 中止用エラー（user に AbortError として送出） */
export class DiscoveryAbortedError extends Error {
  constructor() {
    super("クラフト発見の取得が中止されました");
    this.name = "DiscoveryAbortedError";
  }
}

/**
 * mod text 正規化（段階パイプライン、A/B クロスレビュー反映 v2）。
 *
 * 段階:
 *   1. 全角数字・全角記号 → 半角（POE2 JA テキスト対策）
 *   2. en-dash / em-dash / 波線 → ASCII hyphen
 *   3. 全角空白 → 半角空白
 *   4. 括弧内の範囲 (a-b) / (a..b) を (N) に縮約
 *   5. 括弧外の素 a-b 範囲を N に縮約
 *   6. 残った符号付き小数を N に置換
 *   7. 連続空白整理
 *
 * % は維持する（攻撃% と命中% は別 mod、key を分けたい）。
 * "+47% の冷気耐性" → "+N% の冷気耐性"
 * "(4-7) から (66-71) の火炎ダメージを加える" → "(N) から (N) の火炎ダメージを加える"
 * "最大ライフ +75" → "最大ライフ +N"
 */
export function normalizeModText(modText: string): string {
  let s = modText;

  // 1) 全角数字・全角記号 → 半角
  s = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  s = s.replace(/＋/g, "+").replace(/－/g, "-");
  s = s.replace(/％/g, "%");
  s = s.replace(/（/g, "(").replace(/）/g, ")");

  // 2) en-dash / em-dash / 波線 → ASCII hyphen
  s = s.replace(/[‐-―−〜～]/g, "-");

  // 3) 全角空白 → 半角空白
  s = s.replace(/　/g, " ");

  // 4) 括弧内の範囲表記 (a-b) / (a..b) / 単数 (a) を (N) に縮約
  s = s.replace(
    /\(\s*[+\-]?\d+(?:\.\d+)?(?:\s*(?:-|\.\.)\s*[+\-]?\d+(?:\.\d+)?)?\s*\)/g,
    "(N)",
  );

  // 5) 括弧外の素 a-b 範囲（例: "60-71"）→ N に潰す（範囲表記の名残対策）
  s = s.replace(/[+\-]?\d+(?:\.\d+)?\s*-\s*[+\-]?\d+(?:\.\d+)?/g, "N");

  // 6) 残った符号付き小数を N に統一
  s = s.replace(/[+\-]?\d+(?:\.\d+)?/g, "N");

  // 7) 連続空白整理
  s = s.replace(/\s{2,}/g, " ").trim();

  // 8) 属性束ね（オーナー判断 2026-05-19、画像での実例に基づく）
  //    「アタックに追加するダメージ」系は属性違っても同 mod 扱い
  //    例: 「Nから Nの火ダメージをアタックに追加する」「Nから Nの物理ダメージをアタックに追加する」 → 同 key
  //    一方で「火耐性 +N%」「冷気耐性 +N%」 や 「火ダメージが N% 増加する」 は別 mod のまま
  s = applyAttributeBundling(s);

  return s;
}

/**
 * 属性束ね正規化（特定フレーズのみ属性を [元素] に統一）。
 * オーナー実例 (2026-05-19): 火/冷気/物理ダメ追加は構成として等価扱いしたい。
 */
const ATTRIBUTE_BUNDLE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // 日本語: 「Nから Nの 〇〇 ダメージをアタックに追加する」
  // POE2 JA で属性 + 「ダメージをアタックに追加する」 = 物理/火/冷気/雷/混沌 / カオス
  {
    pattern: /(から N\s*の )(物理|火|冷気|雷|混沌|カオス)( ダメージをアタックに追加する)/,
    replacement: "$1[元素]$3",
  },
  // 半角空白なしバリエーション（normalize 後の空白整理によりブレうる）
  {
    pattern: /(から N\s*の)(物理|火|冷気|雷|混沌|カオス)( ダメージをアタックに追加する)/,
    replacement: "$1 [元素]$3",
  },
  // 英語: "Adds N to N <Element> Damage to Attacks"
  {
    pattern: /(Adds N to N )(Physical|Fire|Cold|Lightning|Chaos)( Damage to Attacks)/,
    replacement: "$1[Element]$3",
  },
];

function applyAttributeBundling(modKey: string): string {
  for (const { pattern, replacement } of ATTRIBUTE_BUNDLE_PATTERNS) {
    const result = modKey.replace(pattern, replacement);
    if (result !== modKey) return result;
  }
  return modKey;
}

/**
 * trade2 API は mod text に `[token|display]` 形式のテンプレートタグを含む場合がある。
 * これを `display` 部分だけ抽出して人間に読める形に展開する。
 *
 * 例:
 *   "Adds 12 to 24 [Physical|Physical] Damage to [Attack|Attacks]"
 *     → "Adds 12 to 24 Physical Damage to Attacks"
 *   "18% increased [ItemRarity|Rarity of Items] found"
 *     → "18% increased Rarity of Items found"
 */
export function expandTradeTags(s: string): string {
  return s.replace(/\[([^|\]]+)\|([^\]]+)\]/g, (_, _token, display) => display);
}

/**
 * mod text 内の数値リストを抽出（正負・小数対応）。
 * 例: "Adds 13 to 22 Fire damage" → [13, 22]
 *     "+31 to Intelligence" → [31]
 *     "12% increased Cold Damage" → [12]
 */
function extractNumbersFromText(text: string): number[] {
  const matches = text.match(/[+\-]?\d+(?:\.\d+)?/g);
  if (!matches) return [];
  return matches
    .map((s) => parseFloat(s))
    .filter((n) => isFinite(n));
}

/**
 * fetch レスポンス listing から explicit mod を text + stat ID + 実 roll 値 ペアで取り出す。
 *
 * **重要 (2026-05-19 バグ修正)**: hashes.explicit の index は `mods.explicit` の index で、
 * `explicitMods` の index とは別。なので **数値マッチング**で対応を取る:
 *
 *   explicitMods[i] のテキスト内数値リスト ↔ mods.explicit[j].magnitudes の min-max
 *   → 全数値が範囲内に収まる j を採用、その mod の magnitudes.hash から stat ID 取得
 *
 * 戻り値: [{ text, statIds, statValues: {[statId]: { min, max }} }]
 */
function extractExplicitModsWithStats(
  listing: FetchedListing,
): Array<{
  text: string;
  statIds: string[];
  statValues: Record<string, { min: number; max: number }>;
}> {
  const item = listing.item;
  if (!item) return [];

  const sourceMods = Array.isArray(item.explicitMods) ? item.explicitMods : [];
  const modsExplicit = item.extended?.mods?.explicit ?? [];

  // sourceMods が空 + extended にも mods.explicit 無し → 何も無い
  if (sourceMods.length === 0) {
    return [];
  }

  // 数値マッチングで対応を取る（mods.explicit を消費しながら処理）
  const usedModIndices = new Set<number>();
  const out: Array<{
    text: string;
    statIds: string[];
    statValues: Record<string, { min: number; max: number }>;
  }> = [];

  for (let i = 0; i < sourceMods.length; i++) {
    const raw = sourceMods[i];
    if (typeof raw !== "string" || raw.length === 0) continue;

    // テキストから [token|display] タグを展開してから数値抽出
    //   タグ込みのままだと "[Physical|Physical]" 等が parse 邪魔だが、
    //   "(N-N)" のようなテンプレート文字は trade2 raw text には基本ない（実値）
    const expanded = raw.replace(
      /\[([^|\]]+)\|([^\]]+)\]/g,
      (_, _t, d) => d,
    );
    const textNumbers = extractNumbersFromText(expanded);

    // mods.explicit の中で「未使用 & 数値が全部 magnitudes の範囲に収まる」mod を探す
    let matchedModIdx = -1;
    if (Array.isArray(modsExplicit) && modsExplicit.length > 0) {
      for (let j = 0; j < modsExplicit.length; j++) {
        if (usedModIndices.has(j)) continue;
        const mod = modsExplicit[j];
        const mags = Array.isArray(mod?.magnitudes) ? mod.magnitudes : [];
        if (mags.length === 0) continue;
        // テキスト内の数値が magnitudes の数と一致 OR テキストの方が多い場合のみ照合
        // ただし magnitudes は通常テキスト内数値と同数（ハイブリッド mod 等）
        if (textNumbers.length < mags.length) continue;
        // 全 magnitude について、テキスト先頭 mags.length 個の数値が範囲内か
        const allMatch = mags.every((mag, k) => {
          const minN =
            typeof mag.min === "number" ? mag.min : parseFloat(String(mag.min));
          const maxN =
            typeof mag.max === "number" ? mag.max : parseFloat(String(mag.max));
          if (!isFinite(minN) || !isFinite(maxN)) return false;
          const n = textNumbers[k];
          // n の絶対値が範囲内（符号は POE の表示由来で複雑、絶対値で寛容判定）
          const nAbs = Math.abs(n);
          const minAbs = Math.min(Math.abs(minN), Math.abs(maxN));
          const maxAbs = Math.max(Math.abs(minN), Math.abs(maxN));
          return nAbs >= minAbs && nAbs <= maxAbs;
        });
        if (allMatch) {
          matchedModIdx = j;
          break;
        }
      }
    }

    if (matchedModIdx === -1) {
      // マッチ無し: mod text だけ採用、stat ID 空
      out.push({
        text: translateModText(raw),
        statIds: [],
        statValues: {},
      });
      continue;
    }
    usedModIndices.add(matchedModIdx);

    // 一致した mod から stat ID と値を抽出
    const matchedMod = modsExplicit[matchedModIdx];
    const statIds: string[] = [];
    const statValues: Record<string, { min: number; max: number }> = {};
    for (const mag of matchedMod.magnitudes ?? []) {
      const sid = mag?.hash;
      if (typeof sid !== "string" || sid.length === 0) continue;
      if (!statIds.includes(sid)) statIds.push(sid);
      const minN =
        typeof mag.min === "number" ? mag.min : parseFloat(String(mag.min));
      const maxN =
        typeof mag.max === "number" ? mag.max : parseFloat(String(mag.max));
      if (!isFinite(minN) || !isFinite(maxN)) continue;
      const prev = statValues[sid];
      if (!prev) {
        statValues[sid] = { min: minN, max: maxN };
      } else {
        statValues[sid] = {
          min: Math.min(prev.min, minN),
          max: Math.max(prev.max, maxN),
        };
      }
    }

    out.push({
      text: translateModText(raw),
      statIds,
      statValues,
    });
  }

  return out;
}

/** 後方互換: text 配列だけ欲しい場合の薄いラッパー */
function extractExplicitMods(listing: FetchedListing): string[] {
  return extractExplicitModsWithStats(listing).map((m) => m.text);
}

/**
 * listing 群から modKey の出現回数を集計、降順返却。
 * 空 mod の listing 数も併せて返す（emptyModRate 算出用）。
 */
export function countModOccurrences(listings: FetchedListing[]): {
  ranking: ModCount[];
  emptyCount: number;
} {
  const map = new Map<string, { count: number; raw: string }>();
  let emptyCount = 0;
  for (const l of listings) {
    const mods = extractExplicitMods(l);
    if (mods.length === 0) {
      emptyCount++;
      continue;
    }
    for (const m of mods) {
      const key = normalizeModText(m);
      if (key.length === 0) continue;
      const cur = map.get(key);
      if (cur) {
        cur.count++;
      } else {
        map.set(key, { count: 1, raw: m });
      }
    }
  }
  // 同 count の tie-breaker は modKey 辞書順で安定化
  const ranking = Array.from(map.entries())
    .map(([modKey, v]) => ({ modKey, rawSample: v.raw, count: v.count }))
    .sort(
      (a, b) => b.count - a.count || a.modKey.localeCompare(b.modKey),
    );
  return { ranking, emptyCount };
}

// ━━ listing クラスタリング (N mod 被りグループ集計) ━━

/**
 * 配列 arr から k 個選ぶ組合せ全列挙（順序保持、ヘッド固定再帰）。
 * C(6, 4) = 15 / C(6, 5) = 6 / C(6, 6) = 1 程度なので軽量。
 */
function combinations<T>(arr: T[], k: number): T[][] {
  if (k > arr.length || k <= 0) return [];
  if (k === arr.length) return [arr.slice()];
  if (k === 1) return arr.map((x) => [x]);
  const result: T[][] = [];
  for (let i = 0; i <= arr.length - k; i++) {
    const head = arr[i];
    const tails = combinations(arr.slice(i + 1), k - 1);
    for (const tail of tails) {
      result.push([head, ...tail]);
    }
  }
  return result;
}

/** sorted modKey の区切り文字（mod text に出現しないコードポイント） */
const CLUSTER_HASH_SEP = "";

/**
 * Phase 1.5 prefix/suffix 集計モード:
 *   - "merged" : 全 mod を区別せずまとめる（後方互換、affixTypes は全 "unknown" になる）
 *   - "split"  : modKey ごとに bundle 逆引きで prefix/suffix を判定し、クラスタ情報に付与
 */
export type AffixMode = "merged" | "split";

/** Phase 1.5 デフォルト集計モード: split（オーナー指示）。 */
export const DEFAULT_AFFIX_MODE: AffixMode = "split";

/**
 * listing 群から「N mod が一致するクラスタ」を集計、件数降順返却。
 *
 * 各 listing の explicit mod から正規化 modKey 配列を作り、
 * C(modCount, N) の全組合せを sorted hash 化、同 hash の listing 数を数える。
 *
 * @param clusterSize 一致させたい mod 数 (4 / 5 / 6)
 * @param hotConfig Phase 1 manual-controls.md §3: 時間窓 + ホット件数閾値（再 fetch 不要、派生指標）。
 *   省略時は DEFAULT_HOT_CONFIG（既存 12h / 20 件を踏襲）。
 *   この関数自体は recentCount を算出するだけで「ホット判定 flag」は付けず、
 *   呼び側 UI で `recentCount >= hotConfig.minCount` をもって判定する。
 * @param affixMode Phase 1.5: "split" で prefix/suffix 区別、"merged" で従来動作。
 */
export function countModClusters(
  listings: FetchedListing[],
  clusterSize: ClusterSize,
  hotConfig: HotConfig = DEFAULT_HOT_CONFIG,
  affixMode: AffixMode = DEFAULT_AFFIX_MODE,
): ClusterCount[] {
  // 「直近 N 時間以内」の閾値（現在時刻 - windowHours h）
  const recentThresholdMs = Date.now() - hotConfig.windowHours * 3600 * 1000;

  const map = new Map<
    string,
    {
      count: number;
      modKeys: string[];
      rawSamples: string[];
      listingIds: string[];
      recentCount: number;
      pricesDivine: number[]; // divine 建ての price 全件
      statIdsByKey: Map<string, string[]>; // modKey → stat ID 列
      // stat_id ごとの「観測された roll 値の最小」（cluster 内の最低 listing が拾える検索条件）
      statMinValues: Map<string, number>;
    }
  >();

  for (const l of listings) {
    if (!l.id) continue;
    const modsWithStats = extractExplicitModsWithStats(l);
    if (modsWithStats.length < clusterSize) continue;

    // modKey 化 + 同 listing 内重複は dedup（raw text、stat IDs、stat 実値）
    const keyToRaw = new Map<string, string>();
    const keyToStatIds = new Map<string, string[]>();
    const listingStatValues = new Map<string, { min: number; max: number }>(); // この listing 内の stat_id → roll 値
    for (const m of modsWithStats) {
      const key = normalizeModText(m.text);
      if (key.length === 0) continue;
      if (!keyToRaw.has(key)) {
        keyToRaw.set(key, m.text);
        keyToStatIds.set(key, m.statIds);
      }
      // stat_id 値を listing 単位で記録
      for (const sid of m.statIds) {
        const v = m.statValues[sid];
        if (v) listingStatValues.set(sid, v);
      }
    }
    const uniqueKeys = Array.from(keyToRaw.keys());
    if (uniqueKeys.length < clusterSize) continue;

    // この listing が「直近 12h 以内」に indexed されたか
    const indexedStr = l.listing?.indexed;
    const indexedMs = indexedStr ? Date.parse(indexedStr) : NaN;
    const isRecent = !isNaN(indexedMs) && indexedMs >= recentThresholdMs;

    // divine 建ての価格を抽出（フィルタで 1div+ 絞ってるので大半 divine だが安全側で確認）
    const p = l.listing?.price;
    const divinePrice =
      p &&
      p.currency === "divine" &&
      typeof p.amount === "number" &&
      isFinite(p.amount) &&
      p.amount > 0
        ? p.amount
        : null;

    const combos = combinations(uniqueKeys, clusterSize);
    for (const combo of combos) {
      const sorted = combo.slice().sort();
      const hash = sorted.join(CLUSTER_HASH_SEP);
      const cur = map.get(hash);
      if (cur) {
        cur.count++;
        if (cur.listingIds.length < 10) cur.listingIds.push(l.id);
        if (isRecent) cur.recentCount++;
        if (divinePrice !== null) cur.pricesDivine.push(divinePrice);
        for (const k of sorted) {
          if (!cur.statIdsByKey.has(k)) {
            cur.statIdsByKey.set(k, keyToStatIds.get(k) ?? []);
          }
        }

        // rawSamples の更新（オーナー指示 2026-05-19「表示も含めて最高値」）
        //   この listing の roll 値が cluster 既存の最大に並ぶ or 上回るなら、
        //   生 text（listing 由来の数値込み）でカード表示用 rawSample を上書き。
        //   stat 値更新前に比較する必要があるので、ここで先に処理。
        for (let mi = 0; mi < cur.modKeys.length; mi++) {
          const k = cur.modKeys[mi];
          const newRaw = keyToRaw.get(k);
          if (!newRaw) continue;
          const statIds = cur.statIdsByKey.get(k) ?? [];
          if (statIds.length === 0) continue;
          // 代表 stat（先頭）の roll min で比較
          const firstStat = statIds[0];
          const newRollMin = listingStatValues.get(firstStat)?.min;
          if (newRollMin === undefined) continue;
          const curRollMin = cur.statMinValues.get(firstStat);
          if (curRollMin === undefined || newRollMin >= curRollMin) {
            cur.rawSamples[mi] = translateModText(newRaw);
          }
        }

        // stat 値: 観測 min の **最大** を採用
        //   オーナー指示 2026-05-19「2件被ってたら高い方で検索かけちゃっていい」
        //   → cluster の最高スペック listing と同等以上のものだけがヒット
        for (const [sid, v] of listingStatValues) {
          const prev = cur.statMinValues.get(sid);
          if (prev === undefined || v.min > prev) {
            cur.statMinValues.set(sid, v.min);
          }
        }
      } else {
        const statIdsByKey = new Map<string, string[]>();
        for (const k of sorted) {
          statIdsByKey.set(k, keyToStatIds.get(k) ?? []);
        }
        const statMinValues = new Map<string, number>();
        for (const [sid, v] of listingStatValues) {
          statMinValues.set(sid, v.min);
        }
        map.set(hash, {
          count: 1,
          modKeys: sorted,
          rawSamples: sorted.map((k) => translateModText(keyToRaw.get(k) ?? k)),
          listingIds: [l.id],
          recentCount: isRecent ? 1 : 0,
          pricesDivine: divinePrice !== null ? [divinePrice] : [],
          statIdsByKey,
          statMinValues,
        });
      }
    }
  }

  return Array.from(map.entries())
    .map(([clusterHash, v]) => {
      const stats = computePriceStats(v.pricesDivine);
      const freshRate = v.count > 0 ? v.recentCount / v.count : 0;
      // Phase 1.5: 各 modKey の prefix/suffix を判定。
      //   - rawSamples[i] は translateModText 出力（タグ展開済日訳） or 英語
      //   - getModAffixType は日英タグ込み・展開済どちらも受け付ける
      //   - 入力に rawSample があれば優先、無ければ modKey で fallback
      const affixTypes: Array<"prefix" | "suffix" | "unknown"> =
        affixMode === "split"
          ? v.modKeys.map((k, i) => {
              const sample = v.rawSamples[i];
              if (sample) {
                const t = getModAffixType(sample);
                if (t !== "unknown") return t;
              }
              return getModAffixType(k);
            })
          : v.modKeys.map(() => "unknown");
      let prefixCount = 0;
      let suffixCount = 0;
      let affixUnknownCount = 0;
      for (const t of affixTypes) {
        if (t === "prefix") prefixCount++;
        else if (t === "suffix") suffixCount++;
        else affixUnknownCount++;
      }
      return {
        clusterHash,
        modKeys: v.modKeys,
        rawSamples: v.rawSamples,
        count: v.count,
        listingIds: v.listingIds,
        recentCount: v.recentCount,
        priceMedian: stats.median,
        priceP25: stats.p25,
        priceP75: stats.p75,
        pricedCount: stats.count,
        freshRate,
        statIdsPerMod: v.modKeys.map((k) => v.statIdsByKey.get(k) ?? []),
        statMinValues: Object.fromEntries(v.statMinValues),
        affixTypes,
        prefixCount,
        suffixCount,
        affixUnknownCount,
      };
    })
    .sort(
      (a, b) => b.count - a.count || a.clusterHash.localeCompare(b.clusterHash),
    );
}

/** 価格配列から中央値と四分位を計算（空配列 OK） */
function computePriceStats(prices: number[]): {
  median: number | null;
  p25: number | null;
  p75: number | null;
  count: number;
} {
  if (prices.length === 0) {
    return { median: null, p25: null, p75: null, count: 0 };
  }
  const sorted = prices.slice().sort((a, b) => a - b);
  const idx = (q: number) => Math.min(sorted.length - 1, Math.floor(sorted.length * q));
  return {
    median: sorted[idx(0.5)],
    p25: sorted[idx(0.25)],
    p75: sorted[idx(0.75)],
    count: sorted.length,
  };
}

// ━━ search query 構築 ━━

type SortKind = "indexed-desc" | "price-asc" | "price-desc";

/**
 * @param opts.priceRange 価格レンジ（Phase 1 manual-controls.md §1、divine 固定）。
 *   省略時は DEFAULT_PRICE_RANGE = 1-2000 div。
 */
function buildSearchQuery(opts: {
  baseType: DiscoveryCategory;
  sort: SortKind;
  priceRange?: PriceRange;
}): unknown {
  const sortBody: Record<string, string> = {};
  if (opts.sort === "indexed-desc") sortBody.indexed = "desc";
  else if (opts.sort === "price-asc") sortBody.price = "asc";
  else sortBody.price = "desc";

  // POE2 trade2 仕様 (2026-05-19 オーナー提供 URL から逆解析):
  //   category.option = "accessory.ring" / "accessory.amulet"（POE1 慣習を踏襲）
  //   status.option = "securable"（旧 "online" は 400 を返す）
  //   6mod 縛り = pseudo.pseudo_number_of_affix_mods (min: 6) in stats
  const categoryOption = categoryToOption(opts.baseType);
  const priceRange = opts.priceRange ?? DEFAULT_PRICE_RANGE;

  return {
    query: {
      status: { option: "securable" },
      stats: [
        {
          type: "and",
          filters: [
            {
              id: "pseudo.pseudo_number_of_affix_mods",
              value: { min: 6 },
              disabled: false,
            },
          ],
        },
      ],
      filters: {
        type_filters: {
          filters: {
            category: { option: categoryOption },
            rarity: { option: "rare" },
          },
        },
        trade_filters: {
          filters: {
            // Phase 1 (2026-05-21): priceRange を引数化（divine 固定）。
            // 既定 1-2000 div: Mirror tier 外れ値除外 + 1div 未満の不確実通貨換算を弾く。
            price: {
              min: priceRange.min,
              max: priceRange.max,
              option: "divine",
            },
          },
        },
        misc_filters: {
          filters: {
            corrupted: { option: "false" },
          },
        },
      },
    },
    sort: sortBody,
  };
}

// ━━ 429 retry helper ━━

/** Rust 側 trade2 エラー文字列から retry-after 秒数を抽出。429 でない場合 null */
function parse429RetryAfter(errMsg: string): number | null {
  const m = errMsg.match(/HTTP 429 retry-after=(\d+)/);
  if (m) {
    const sec = parseInt(m[1], 10);
    if (!isNaN(sec)) return sec;
  }
  // retry-after が欠落していても 429 ならフォールバック 30 秒
  if (errMsg.includes("HTTP 429")) return 30;
  return null;
}

/** invoke を 429 リトライ付きで実行（最大 MAX_RETRY_ON_429 回、中止対応） */
async function invokeWithRetry<T>(
  cmd: string,
  args: Record<string, unknown>,
  notify?: (p: DiscoveryProgress) => void,
  signal?: AbortSignal,
): Promise<T> {
  let attempt = 0;
  let lastErr: unknown = null;
  while (attempt <= MAX_RETRY_ON_429) {
    if (signal?.aborted) throw new DiscoveryAbortedError();
    try {
      return await invoke<T>(cmd, args);
    } catch (e) {
      lastErr = e;
      const msg =
        typeof e === "string" ? e : ((e as Error).message ?? String(e));
      const retryAfter = parse429RetryAfter(msg);
      if (retryAfter === null) throw e; // 429 以外は即 fail
      attempt++;
      if (attempt > MAX_RETRY_ON_429) break;
      // 指数 backoff: 公式 retry-after + 5 * 2^(attempt-1) 秒の余裕
      const waitMs = (retryAfter + 5 * Math.pow(2, attempt - 1)) * 1000;
      // カウントダウン付き sleep（中止対応）
      try {
        await sleepCancellable(waitMs, signal, (remainingMs) => {
          notify?.({
            phase: "retry",
            message: `429 rate limit、あと ${Math.ceil(remainingMs / 1000)}s でリトライ (${attempt}/${MAX_RETRY_ON_429})`,
          });
        });
      } catch (e2) {
        if (isAbortError(e2)) throw new DiscoveryAbortedError();
        throw e2;
      }
    }
  }
  throw lastErr ?? new Error("invokeWithRetry: unknown failure");
}

// ━━ メイン: search 3 ソート → fetch 10件 batch → 集計 ━━

/**
 * クラフト発見ランキング Phase 1.5 のエンドツーエンド実行（累積モード）。
 *
 * オーナー仕様 (2026-05-19): 「最新から 300 件ずつ取り込みまくって」
 *   - prevState を渡すと累積に追加
 *   - 既存 listing は seenIds で弾く
 *   - 累積データに対して N mod クラスタ再集計
 *
 * 各 sort は独立 try/catch で囲み、1 sort の失敗が全体破棄にならないようにする。
 * 429 検出時は最大 MAX_RETRY_ON_429 回まで指数 backoff リトライ。
 */
export async function runDiscovery(args: {
  league: string;
  category: DiscoveryCategory;
  /** 1 サイクルで取得したい listing 件数（10-1000、デフォルト 300） */
  targetCount?: number;
  /** 累積用の引き継ぎ state（カテゴリが一致してない場合は無視して新規開始） */
  prevState?: DiscoveryState;
  /** ユーザーによる中止用シグナル */
  signal?: AbortSignal;
  onProgress?: (p: DiscoveryProgress) => void;
  /**
   * Phase 1 manual-controls.md §1: 価格レンジ（divine 固定）.
   * 省略時は DEFAULT_PRICE_RANGE (1-2000 div).
   */
  priceRange?: PriceRange;
  /**
   * Phase 1 manual-controls.md §3: ホット判定設定.
   * runDiscovery 内では集計結果に反映、UI で slider を動かしたら buildResultFromState で再計算可。
   * 省略時は DEFAULT_HOT_CONFIG (12h / 20 件).
   */
  hotConfig?: HotConfig;
  /**
   * Phase 1.5: prefix/suffix 集計モード（"split" / "merged"、デフォルト "split"）.
   * UI トグル「prefix/suffix 区別」が連動。
   */
  affixMode?: AffixMode;
}): Promise<DiscoveryResult> {
  const { league, category, onProgress, prevState, signal } = args;
  // dev-server (browser) では Tauri 環境ではないためスキップ
  //   trade2_search/trade2_fetch が undefined.invoke で TypeError になるのを未然回避。
  //   呼び側 UI で握り潰せるよう専用エラーを投げる。
  if (!isTauriRuntime()) {
    throw new Error(
      "クラフト発見の取得は Tauri ネイティブ環境でのみ動作します（ブラウザ dev では無効）",
    );
  }
  // 取得件数: 10-1000 の範囲にクランプ、デフォルト 300
  const targetCount = Math.max(
    10,
    Math.min(MAX_LISTINGS_PER_CYCLE, args.targetCount ?? DEFAULT_LISTING_COUNT),
  );
  // Phase 1 manual-controls 設定の解決（呼び側未指定なら default で稼働、後方互換）
  const priceRange: PriceRange = args.priceRange ?? DEFAULT_PRICE_RANGE;
  const hotConfig: HotConfig = args.hotConfig ?? DEFAULT_HOT_CONFIG;
  // Phase 1.5: prefix/suffix 集計モード（呼び側未指定なら "split"）
  const affixMode: AffixMode = args.affixMode ?? DEFAULT_AFFIX_MODE;
  const notify = (p: DiscoveryProgress) => onProgress?.(p);

  // 累積 state 初期化: カテゴリが一致する prevState だけ引き継ぐ
  const baseState: DiscoveryState =
    prevState && prevState.category === category
      ? prevState
      : createEmptyState(category);

  // 取得件数に応じて使うソート数を組む。
  //   trade2 search は実質 3 sort kind (indexed-desc / price-asc / price-desc) だが、
  //   500+ 件は同じ sort kind を sleep 挟んで複数 round 叩く（累積モードの 1 サイクル内冗長化）。
  //   各 sort = 100 件上限、ceil(targetCount / 100) round 必要。
  //   4 round 目以降は indexed-desc → price-asc → price-desc を循環。
  const sortKinds: SortKind[] = ["indexed-desc", "price-asc", "price-desc"];
  const sortsNeeded = Math.max(1, Math.ceil(targetCount / 100));
  const sorts: SortKind[] = [];
  for (let i = 0; i < sortsNeeded; i++) {
    sorts.push(sortKinds[i % sortKinds.length]);
  }

  const seenIds = baseState.seenIds;
  const allListings = baseState.allListings;
  const failedSorts: string[] = [];
  let populationTotal = 0;
  let dupCount = 0; // 直近サイクルで「既に持ってた」と弾いた数
  let newListingsThisCycle = 0;

  for (let i = 0; i < sorts.length; i++) {
    const sort = sorts[i];
    try {
      notify({
        phase: "search",
        message: `検索 ${i + 1}/${sorts.length}（${sort}）`,
        searchedSorts: i,
      });

      if (signal?.aborted) throw new DiscoveryAbortedError();
      const search = await invokeWithRetry<SearchResponse>(
        "trade2_search",
        {
          req: {
            league,
            query: buildSearchQuery({ baseType: category, sort, priceRange }),
          },
        },
        notify,
        signal,
      );

      if (search.total && search.total > populationTotal) {
        populationTotal = search.total;
      }
      const queryId = search.id;
      if (!queryId) {
        throw new Error(`trade2_search にレスポンス id がありません（sort=${sort}）`);
      }
      // この sort で取りたい上限 = targetCount - 既取得数（100 件上限あり）
      const remaining = targetCount - newListingsThisCycle;
      if (remaining <= 0) break;
      const ids = (search.result ?? []).slice(0, Math.min(100, remaining));

      // 10 件 batch で fetch
      for (let j = 0; j < ids.length; j += 10) {
        const batch = ids.slice(j, j + 10);
        const fresh = batch.filter((id) => {
          if (!id) return false; // 空 id ガード（trade2 が稀に返す可能性、Rust 側で 400 になる）
          if (seenIds.has(id)) {
            dupCount++;
            return false;
          }
          return true;
        });
        if (fresh.length === 0) continue;

        try {
          await sleepCancellable(SLEEP_BETWEEN_REQ_MS, signal);
        } catch (e) {
          if (isAbortError(e)) throw new DiscoveryAbortedError();
          throw e;
        }

        notify({
          phase: "fetch",
          message: `取得中 ${allListings.length} 件（sort ${i + 1}/${sorts.length}, batch ${Math.floor(j / 10) + 1}）`,
          searchedSorts: i,
          fetchedListings: allListings.length,
        });

        const res = await invokeWithRetry<FetchResponse>(
          "trade2_fetch",
          { req: { ids: fresh, queryId } },
          notify,
          signal,
        );
        for (const r of res.result ?? []) {
          // r.id が undefined / 空文字のときに seenIds に push して以降の listing を全て重複扱いするバグ防止
          if (!r.id) continue;
          if (!seenIds.has(r.id)) {
            seenIds.add(r.id);
            allListings.push(r);
            newListingsThisCycle++;
          }
          // 早期打ち切り: 目標件数に達したら fetch ループから抜ける
          if (newListingsThisCycle >= targetCount) break;
        }
        if (newListingsThisCycle >= targetCount) break;
      }
      if (newListingsThisCycle >= targetCount) break;

      // 次 sort の前に必ず sleep（fresh=0 で sleep を skip した場合の保険、429 連発防止）
      if (i < sorts.length - 1) {
        try {
          await sleepCancellable(SLEEP_BETWEEN_REQ_MS, signal);
        } catch (e) {
          if (isAbortError(e)) throw new DiscoveryAbortedError();
          throw e;
        }
      }
    } catch (e) {
      // 中止は即上位に投げる（部分取得は呼び側で見せたいので state は返したい → ここでは throw）
      if (e instanceof DiscoveryAbortedError) throw e;
      // sort 単位で部分失敗を受け入れる: ログ残して次の sort へ
      failedSorts.push(sort);
      const msg = typeof e === "string" ? e : ((e as Error).message ?? String(e));
      notify({
        phase: "search",
        message: `sort=${sort} 失敗（続行）: ${msg.slice(0, 200)}`,
        searchedSorts: i,
      });
      try {
        await sleepCancellable(SLEEP_BETWEEN_REQ_MS, signal);
      } catch (e2) {
        if (isAbortError(e2)) throw new DiscoveryAbortedError();
        throw e2;
      }
    }
  }

  notify({
    phase: "aggregate",
    message: `集計中…（${allListings.length} 件）`,
    fetchedListings: allListings.length,
  });

  const { ranking, emptyCount } = countModOccurrences(allListings);
  const denom = allListings.length || 1;
  const emptyModRate = emptyCount / denom;
  // 直近サイクルの dedupRate = 重複として弾いた件数 / 取得試行件数（重複 + 新規）
  const cycleCandidateTotal = dupCount + newListingsThisCycle;
  const dedupRate = cycleCandidateTotal > 0 ? dupCount / cycleCandidateTotal : 0;

  // 累積データに対するクラスタリング再集計（1〜6 mod 全サイズ）
  // Phase 1: hotConfig を反映（時間窓 1/3/6/12h、件数閾値は呼び側 UI で適用）
  // Phase 1.5: affixMode を反映（split で prefix/suffix 区別情報を付与）
  const clustersBySize = {
    1: countModClusters(allListings, 1, hotConfig, affixMode),
    2: countModClusters(allListings, 2, hotConfig, affixMode),
    3: countModClusters(allListings, 3, hotConfig, affixMode),
    4: countModClusters(allListings, 4, hotConfig, affixMode),
    5: countModClusters(allListings, 5, hotConfig, affixMode),
    6: countModClusters(allListings, 6, hotConfig, affixMode),
  } as Record<ClusterSize, ClusterCount[]>;

  // 次回引き継ぎ用 state
  const newState: DiscoveryState = {
    seenIds,
    allListings,
    cycleCount: baseState.cycleCount + 1,
    category,
  };

  notify({
    phase: "done",
    message: `完了 サイクル ${newState.cycleCount}: ${allListings.length} 件、クラスタ ${CLUSTER_SIZES.map((n) => `${n}/${clustersBySize[n].length}`).join(" ")}`,
    fetchedListings: allListings.length,
  });

  return {
    totalListings: allListings.length,
    newListingsThisCycle,
    cycleCount: newState.cycleCount,
    populationTotal,
    modRanking: ranking,
    clustersBySize,
    fetchedAt: new Date().toISOString(),
    category,
    emptyModRate,
    dedupRate,
    failedSorts,
    state: newState,
  };
}
