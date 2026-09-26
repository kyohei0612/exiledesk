/**
 * /Items を素材の 1 行に整形 (ランキング) と、全ペアから「一番安く交換できる通貨」を決める
 *
 * poe2scout.ts から切り出し (2026-09-26)。
 */
import { exchangeGroupIdOf, exchangeSubJaOf } from "../../i18n/currency-exchange";
import { BASE, httpFetch, NO_STORE } from "./http";
import type { CurrencyItem } from "./types";

// =================== 整形 ===================

/**
 * 1 アイテム = 1 行。素材を 基本通貨(高貴/カオス/神) で値付けした 3 換算を持つ。
 * 価格は poe2scout 公式の CurrentPrice(高貴=Exalted建て)を直接採用する。
 * （SnapshotPairs の RelativePrice はペア基準通貨建てで普遍価格ではないため使わない。
 *   オーナー指摘 2026-06-03「ExileDeskだけ値段が微妙に違う」の修正。）
 */
export interface RankedItem {
  apiId: string;
  /** poe2scout の数値 ItemId。PriceHistory との結合キー。 */
  itemId: number;
  text: string;
  icon: string;
  categoryApiId: string;
  /** 表示上のグループ: ゲーム内取引所の分類 (`x:Currency` 等)。取引所に無ければ categoryApiId (2026-09-09) */
  groupId: string;
  /** 取引所のサブカテゴリ (例 "グレータールーン")。無ければ null */
  subJa: string | null;
  /** 1 アイテム = ? 高貴(Exalted)。= CurrentPrice */
  exaltedPrice: number;
  /** 1 アイテム = ? 神(Divine) */
  divinePrice: number;
  /** 1 アイテム = ? カオス(Chaos) */
  chaosPrice: number;
  /**
   * 一番安く交換できる通貨 (カオスと神のペアで安い方)。取引所のペアが薄い / 無い時は null (2026-09-26)。
   * オーナー:「カオスと神でどっちが安いか。神で交換よりカオスで交換した方が良いならそっちの通貨で」
   */
  bestPay?: BestPay | null;
}

export interface BestPay {
  currency: "chaos" | "divine";
  /** 1 個 = ? その通貨 */
  perUnit: number;
  /** 1 個 = ? 高貴 (このペアでの値) */
  exalted: number;
}

/** SnapshotPairs の片側 */
interface SnapshotSide {
  RelativePrice: number | string;
  HighestStock: number | string;
  VolumeTraded: number | string;
}
interface SnapshotPairRow {
  CurrencyOne: { ApiId: string | null };
  CurrencyTwo: { ApiId: string | null };
  CurrencyOneData: SnapshotSide;
  CurrencyTwoData: SnapshotSide;
}

/** 最新スナップショットの全ペア (1 回で全部。2026-09-26 カレンシーランキングの「一番安く交換できる通貨」用) */
export async function fetchSnapshotPairs(leagueName: string): Promise<SnapshotPairRow[]> {
  const url = `${BASE}/poe2/Leagues/${encodeURIComponent(leagueName)}/SnapshotPairs`;
  const res = await httpFetch(url, NO_STORE);
  if (!res.ok) throw new Error(`SnapshotPairs request failed: ${res.status}`);
  const body = await res.json();
  return Array.isArray(body) ? (body as SnapshotPairRow[]) : [];
}

/**
 * 板が薄いペアは値が壊れるので使わない (services/trade2/exchange.ts と同じ線)。
 * 相場の半分を下回る値も壊れた板とみなす
 */
const PAIR_MIN_STOCK = 10;
const PAIR_MIN_VOLUME = 5;
const PAIR_SANE_FLOOR = 0.5;

/**
 * 全ペアから、アイテムごとに「カオスと神のどちらで買うと安いか」を決める。
 * ペア内の値 (RelativePrice) は高貴建て。支払う量は画面共通の換算レートで出す (exchange.ts と同じ)。
 * @param exaltedPer 1 カオス / 1 神 = ? 高貴
 */
export function bestPayByApiId(
  pairs: SnapshotPairRow[],
  market: Map<string, number>,
  exaltedPer: { chaos: number; divine: number },
): Map<string, BestPay> {
  const num = (v: number | string | undefined) => (typeof v === "number" ? v : Number(v ?? NaN));
  const out = new Map<string, BestPay>();
  for (const p of pairs) {
    const a = p.CurrencyOne?.ApiId, b = p.CurrencyTwo?.ApiId;
    if (!a || !b) continue;
    const payIsTwo = b === "chaos" || b === "divine";
    const payIsOne = a === "chaos" || a === "divine";
    if (payIsOne === payIsTwo) continue; // 素材同士 / 基本通貨同士は見ない
    const item = payIsTwo ? a : b;
    const currency = (payIsTwo ? b : a) as BestPay["currency"];
    const itemSide = payIsTwo ? p.CurrencyOneData : p.CurrencyTwoData;
    const paySide = payIsTwo ? p.CurrencyTwoData : p.CurrencyOneData;
    const price = num(itemSide?.RelativePrice);
    if (!(price > 0)) continue;
    if (num(itemSide.HighestStock) < PAIR_MIN_STOCK || num(paySide?.HighestStock) < PAIR_MIN_STOCK) continue;
    if (num(itemSide.VolumeTraded) < PAIR_MIN_VOLUME || num(paySide?.VolumeTraded) < PAIR_MIN_VOLUME) continue;
    const m = market.get(item);
    if (m != null && m > 0 && price < m * PAIR_SANE_FLOOR) continue;
    const rate = exaltedPer[currency];
    if (!(rate > 0)) continue;
    const cand: BestPay = { currency, perUnit: price / rate, exalted: price };
    const cur = out.get(item);
    if (!cur || cand.exalted < cur.exalted) out.set(item, cand);
  }
  return out;
}

/** 基本交換先通貨。これ自体は素材行に出さない(基準レート帯で表示)。 */
const BASIC_TARGETS = new Set(["divine", "exalted", "chaos"]);

/**
 * /Items を「通貨交換アイテムの 1 行 = 1 アイテム」に整形する。
 *  - 通貨交換アイテムのみ採用 = ApiId が非 null（装備/ユニークは ApiId=null で除外）
 *  - 基本通貨(高貴/カオス/神)自体は除外（基準レート帯で表示）
 *  - CurrentPrice(高貴建て) を正とし、神/カオス換算を導出
 *
 * @param items poe2scout /Items レスポンス
 * @param divinePrice 1 神 = ? 高貴 (リーグ data の DivinePrice)
 * @param chaosDivinePrice 1 神 = ? Chaos (= Chaos per Divine。通常 >1)
 */
export function buildRankedItems(
  items: CurrencyItem[],
  divinePrice: number,
  chaosDivinePrice: number,
): RankedItem[] {
  const safeDivinePrice = divinePrice > 0 ? divinePrice : 1;
  const safeChaosDivinePrice = chaosDivinePrice > 0 ? chaosDivinePrice : 1;
  // 1 カオス = divinePrice / chaosDivinePrice 高貴(Exalted) 建て
  const chaosExaltedPrice = safeDivinePrice / safeChaosDivinePrice;

  return items
    .filter(
      (x): x is CurrencyItem & { ApiId: string; CurrentPrice: number } =>
        !!x.ApiId &&
        !BASIC_TARGETS.has(x.ApiId) &&
        typeof x.CurrentPrice === "number" &&
        x.CurrentPrice > 0,
    )
    .map((x) => ({
      apiId: x.ApiId,
      itemId: x.ItemId,
      text: x.Text,
      icon: x.IconUrl,
      categoryApiId: x.CategoryApiId,
      groupId: exchangeGroupIdOf(x.Text) ?? x.CategoryApiId,
      subJa: exchangeSubJaOf(x.Text),
      exaltedPrice: x.CurrentPrice,
      divinePrice: x.CurrentPrice / safeDivinePrice,
      chaosPrice: x.CurrentPrice / chaosExaltedPrice,
    }))
    .sort((a, b) => b.exaltedPrice - a.exaltedPrice);
}
