/**
 * poe2scout API クライアント
 *
 * poe2scout は POE2 専用の経済データ集約サービス（MIT、OpenAPI 完備、無認証 GET）
 * Repo: https://github.com/poe2scout/poe2scout
 * OpenAPI: https://poe2scout.com/api/openapi.json
 *
 * 慣例マナー:
 * - User-Agent に連絡先 email を含める（fetch では browser が制御するので、Tauri 移行時に Rust 側で設定）
 * - 高頻度連投は避ける（手動更新前提なら問題なし）
 */

// dev: vite proxy 経由で CORS 回避
// prod: Tauri ネイティブ fetch なので CORS 関係なし、直叩き
const BASE = import.meta.env.DEV
  ? "/api/poe2scout"
  : "https://poe2scout.com/api";

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
  const res = await fetch(`${BASE}/poe2/Leagues`);
  if (!res.ok) throw new Error(`Leagues request failed: ${res.status}`);
  return res.json();
}

export async function fetchSnapshotPairs(
  leagueName: string,
  perPage = 500,
): Promise<SnapshotPair[]> {
  const url = `${BASE}/poe2/Leagues/${encodeURIComponent(leagueName)}/SnapshotPairs?perPage=${perPage}`;
  const res = await fetch(url);
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
  /** ペアに Divine Orb が含まれるか */
  containsDivine: boolean;
  /** CurrencyOne のカテゴリ ID（例: "currency", "essence", "omen"） */
  oneCategoryApiId: string;
  /** CurrencyTwo のカテゴリ ID */
  twoCategoryApiId: string;
}

const DIVINE_API_ID = "divine";

/**
 * 取引量降順でランキング。Divine 含むペアは Divine を CurrencyOne 側に正規化。
 * 各ペアの「1 神あたりの相手通貨数」も計算する。
 *
 * @param pairs poe2scout SnapshotPairs レスポンス
 * @param divinePrice 1 神 = ? base通貨 (リーグ data の DivinePrice)
 */
export function rankPairsByVolume(
  pairs: SnapshotPair[],
  divinePrice: number,
): RankedPair[] {
  const safeDivinePrice = divinePrice > 0 ? divinePrice : 1;

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

      return {
        id: p.CurrencyExchangeSnapshotPairId,
        volume: parseFloat(p.Volume),
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
        containsDivine,
        oneCategoryApiId: one.CategoryApiId,
        twoCategoryApiId: two.CategoryApiId,
      };
    })
    .filter((r) => r.volume > 0 && Number.isFinite(r.volume))
    .sort((a, b) => {
      // 神換算が高い順
      // Divine ペア: 非 Divine 側 (one) の価格 / 非 Divine ペア: max(両通貨)
      const aVal = a.containsDivine
        ? a.oneDivinePrice
        : Math.max(a.oneDivinePrice, a.twoDivinePrice);
      const bVal = b.containsDivine
        ? b.oneDivinePrice
        : Math.max(b.oneDivinePrice, b.twoDivinePrice);
      if (bVal !== aVal) return bVal - aVal;
      // 同価格は volume 降順で tie-break
      return b.volume - a.volume;
    });
}
