/**
 * poe2scout API クライアント
 *
 * poe2scout は POE2 専用の経済データ集約サービス（MIT、OpenAPI 完備、無認証 GET）
 * Repo: https://github.com/poe2scout/poe2scout
 * OpenAPI: https://poe2scout.com/api/openapi.json
 *
 * 2026-05-19 hotfix: poe2scout が Access-Control-Allow-Origin を返さないため、
 * Tauri WebView の fetch だと CORS で弾かれる。本番ビルドでは
 * @tauri-apps/plugin-http の fetch (Rust 経由、CORS 不問) を使う。
 * dev では Vite proxy 経由で CORS 回避済なので native fetch を使う。
 */
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

const BASE = import.meta.env.DEV
  ? "/api/poe2scout"
  : "https://poe2scout.com/api";

const httpFetch: typeof fetch = import.meta.env.DEV
  ? globalThis.fetch.bind(globalThis)
  : (tauriFetch as unknown as typeof fetch);

// =================== 型定義 ===================

export interface CurrencyDetail {
  CurrencyItemId: number;
  ItemId: number;
  CurrencyCategoryId: number;
  ApiId: string;
  Text: string;
  IconUrl: string;
  CategoryApiId: string;
  ItemMetadata: unknown;
}

export interface CurrencyData {
  ValueTraded: string;
  RelativePrice: string;
  StockValue: string;
  VolumeTraded: number;
  HighestStock: number;
}

export interface SnapshotPair {
  CurrencyExchangeSnapshotPairId: number;
  CurrencyExchangeSnapshotId: number;
  Volume: string;
  BaseCurrencyApiId: string;
  BaseCurrencyText: string;
  CurrencyOne: CurrencyDetail;
  CurrencyTwo: CurrencyDetail;
  CurrencyOneData: CurrencyData;
  CurrencyTwoData: CurrencyData;
}

export interface League {
  Value: string;
  IsCurrent: boolean;
  DivinePrice: number;
  ChaosDivinePrice: number;
  BaseCurrencyApiId: string;
  BaseCurrencyText: string;
  BaseCurrencyIconUrl: string;
  ExaltedCurrencyText: string;
  ExaltedCurrencyIconUrl: string;
  DivineCurrencyText: string;
  DivineCurrencyIconUrl: string;
  ChaosCurrencyText: string;
  ChaosCurrencyIconUrl: string;
}

// =================== 取得関数 ===================

export async function fetchLeagues(): Promise<League[]> {
  const res = await httpFetch(`${BASE}/poe2/Leagues`);
  if (!res.ok) throw new Error(`Leagues request failed: ${res.status}`);
  return res.json();
}

export async function fetchSnapshotPairs(
  leagueName: string,
  perPage = 500,
): Promise<SnapshotPair[]> {
  const url = `${BASE}/poe2/Leagues/${encodeURIComponent(leagueName)}/SnapshotPairs?perPage=${perPage}`;
  const res = await httpFetch(url);
  if (!res.ok) throw new Error(`SnapshotPairs request failed: ${res.status}`);
  return res.json();
}

// =================== 集約・整形 ===================

export interface RankedPair {
  id: number;
  volume: number;
  oneText: string;
  oneIcon: string;
  oneRelativePrice: number;
  twoText: string;
  twoIcon: string;
  twoRelativePrice: number;
  baseCurrencyText: string;
  /** 1 神（Divine Orb）あたり、CurrencyOne を何個受け取れるか */
  oneDivineRate: number;
  /** 1 神（Divine Orb）あたり、CurrencyTwo を何個受け取れるか */
  twoDivineRate: number;
  /** 1 単位の CurrencyOne の Divine 価格（poe.ninja 流の「X 神 ⇄ 1 X」表示用） */
  oneDivinePrice: number;
  /** 1 単位の CurrencyTwo の Divine 価格 */
  twoDivinePrice: number;
  /** 1 単位の CurrencyOne の Chaos 換算価格 (0 ならレート未取得) */
  oneChaosPrice: number;
  /** 1 単位の CurrencyTwo の Chaos 換算価格 */
  twoChaosPrice: number;
  /** ペアに Divine Orb が含まれるか */
  containsDivine: boolean;
  /** CurrencyOne のカテゴリ ID（例: "currency", "essence", "omen"） */
  oneCategoryApiId: string;
  /** CurrencyTwo のカテゴリ ID */
  twoCategoryApiId: string;
  /** CurrencyOne の ApiId (アービトラージ検出用、ペア間で同 Item を識別) */
  oneApiId: string;
  /** CurrencyTwo の ApiId */
  twoApiId: string;
}

const DIVINE_API_ID = "divine";

/**
 * 取引量降順でランキング。Divine 含むペアは Divine を CurrencyOne 側に正規化。
 * 各ペアの「1 神あたりの相手通貨数」「Chaos 換算価格」も計算する。
 *
 * @param pairs poe2scout SnapshotPairs レスポンス
 * @param divinePrice 1 神 = ? base通貨 (リーグ data の DivinePrice)
 * @param chaosDivinePrice 1 神 = ? Chaos (リーグ data の ChaosDivinePrice、
 *   = Chaos per Divine。通常 >1 で Divine の方が Chaos より高価)
 */
export function rankPairsByVolume(
  pairs: SnapshotPair[],
  divinePrice: number,
  chaosDivinePrice: number,
): RankedPair[] {
  const safeDivinePrice = divinePrice > 0 ? divinePrice : 1;
  const safeChaosDivinePrice = chaosDivinePrice > 0 ? chaosDivinePrice : 1;
  // 1 Chaos の base 通貨 (Exalted) 建て価格
  //   1 神 = chaosDivinePrice カオス
  //   1 神 = divinePrice 高貴(Exalted)
  //   ⇒ 1 カオス = divinePrice / chaosDivinePrice 高貴
  const chaosExaltedPrice = safeDivinePrice / safeChaosDivinePrice;

  return pairs
    .map((p) => {
      // Divine を "two" 側（右）に正規化
      const divineIsOne = p.CurrencyOne.ApiId === DIVINE_API_ID;
      const containsDivine =
        divineIsOne || p.CurrencyTwo.ApiId === DIVINE_API_ID;

      const one = divineIsOne ? p.CurrencyTwo : p.CurrencyOne;
      const two = divineIsOne ? p.CurrencyOne : p.CurrencyTwo;
      const oneData = divineIsOne ? p.CurrencyTwoData : p.CurrencyOneData;
      const twoData = divineIsOne ? p.CurrencyOneData : p.CurrencyTwoData;

      const oneRel = parseFloat(oneData?.RelativePrice ?? "0");
      const twoRel = parseFloat(twoData?.RelativePrice ?? "0");

      // 1 神 で何個もらえるか = DivinePrice / RelativePrice
      // RelativePrice は base通貨 (Exalted) 建ての価格
      const oneDivineRate = oneRel > 0 ? safeDivinePrice / oneRel : 0;
      const twoDivineRate = twoRel > 0 ? safeDivinePrice / twoRel : 0;

      // 1 単位を買うのに必要な Divine 数（poe.ninja 流「X 神 ⇄ 1 X」用）
      const oneDivinePrice = oneRel > 0 ? oneRel / safeDivinePrice : 0;
      const twoDivinePrice = twoRel > 0 ? twoRel / safeDivinePrice : 0;

      // 1 単位を買うのに必要な Chaos 数
      const oneChaosPrice = oneRel > 0 ? oneRel / chaosExaltedPrice : 0;
      const twoChaosPrice = twoRel > 0 ? twoRel / chaosExaltedPrice : 0;

      // volume は「取引個数」ベースで集計する (Exalted 建て総額の `p.Volume` だと
      // Mirror / Headhunter のような単価異常アイテムが上位に来てしまうため)。
      // 両通貨の VolumeTraded を合算 = ペア全体の取引フロー量
      const oneVol = oneData?.VolumeTraded ?? 0;
      const twoVol = twoData?.VolumeTraded ?? 0;
      const tradeVolume = oneVol + twoVol;

      return {
        id: p.CurrencyExchangeSnapshotPairId,
        volume: tradeVolume,
        oneText: one.Text,
        oneIcon: one.IconUrl,
        oneRelativePrice: oneRel,
        twoText: two.Text,
        twoIcon: two.IconUrl,
        twoRelativePrice: twoRel,
        baseCurrencyText: p.BaseCurrencyText,
        oneDivineRate,
        twoDivineRate,
        oneDivinePrice,
        twoDivinePrice,
        oneChaosPrice,
        twoChaosPrice,
        containsDivine,
        oneCategoryApiId: one.CategoryApiId,
        twoCategoryApiId: two.CategoryApiId,
        oneApiId: one.ApiId,
        twoApiId: two.ApiId,
      };
    })
    .filter((r) => r.volume > 0 && Number.isFinite(r.volume))
    .sort((a, b) => b.volume - a.volume);
  // 2026-05-22 修正: 関数名 (rankPairsByVolume) どおり「取引量降順」に統一。
  //   以前は「神換算降順 (Divine 側 or max(両通貨))」でソートしていたが、UI 名 "ランキング"
  //   と乖離して Mirror / Perfect Essence のような超高額・低取引量アイテムが 1 位に来ていた。
  //   アービトラージ見える化が必要なら別オプションとして将来追加検討。
}
