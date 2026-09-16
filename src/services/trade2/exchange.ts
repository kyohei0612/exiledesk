/**
 * 素材を「どの通貨で買うのが一番安いか」(2026-09-16)
 *
 * オーナー指摘「たまにカオスで買った方が安い」→「取引所だとレートあるんじゃない？」。
 * ゲーム内カレンシー取引所のペアごとの実レートが poe2scout のペア履歴に入っている
 * (`Currencies/Pairs/{素材}/{支払い通貨}/History`)。同じ素材でもペアで値が変わる。
 *   実測 (2026-09-16): ヴァールオーブ = カオス経由 4.32 / 高貴経由 4.47 (高貴換算)
 * 板が薄いペアは値が飛ぶので、在庫のあるペアを優先する。結果は 30 分そのまま使う (localStorage)。
 */
import { fetchPairRate } from "../../api/poe2scout";
import { marketStore } from "../../state/market-store";

/**
 * 支払いに使う通貨。
 * オーナー指示 (2026-09-16): 高貴で買うと取引所の手数料 (ゴールド) がかなり掛かるので外す。
 * カオスか神のどちらで買うのが安いかだけ比べる。
 */
export const PAY_CURRENCIES = ["chaos", "divine"] as const;
export type PayCurrency = (typeof PAY_CURRENCIES)[number];

export interface PayOption {
  currency: PayCurrency;
  /** 素材 1 個の高貴換算 (そのペアでの値) */
  exalted: number;
  /** 素材 1 個あたり払う量 (その通貨建て) */
  perUnit: number;
  /** 素材側の在庫 (板の厚み) */
  stock: number;
}
export interface BestBuy {
  apiId: string;
  options: PayOption[];
  best: PayOption | null;
  fetchedAt: number;
}

/**
 * 板が薄いペアは値が壊れるので使わない (実測 2026-09-16: 原石 lv17 × 高貴 は高貴側の在庫 25 / 取引 372 で
 * 高貴の相対値が 3.08 になり、素材の値も 1.5 と出た。ヴァールのペアは両側とも厚く、値も整合する)。
 */
const MIN_STOCK = 50;
const MIN_VOLUME = 20;
const CACHE_KEY = "exiledesk.exchange.pairRates";
const FRESH_MS = 30 * 60 * 1000;

type Cache = Record<string, BestBuy>;

function loadCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Cache;
  } catch {
    return {};
  }
}
function saveCache(c: Cache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* 保存できなくても動く */
  }
}

/** 取ってある分だけ返す (取りに行かない) */
export function cachedBuy(apiId: string): BestBuy | null {
  const hit = loadCache()[apiId];
  return hit && Date.now() - hit.fetchedAt < FRESH_MS ? hit : null;
}

function pickBest(options: PayOption[]): PayOption | null {
  return options.reduce<PayOption | null>((a, b) => (a == null || b.exalted < a.exalted ? b : a), null);
}

/** 素材 1 つをカオス / 神で引いて、安い方を決める (高貴は手数料が高いので使わない) */
export async function fetchBuy(league: string, apiId: string): Promise<BestBuy | null> {
  const hit = cachedBuy(apiId);
  if (hit) return hit;
  const one = marketStore.itemIdOf(apiId);
  if (one == null) return null;
  const options: PayOption[] = [];
  for (const currency of PAY_CURRENCIES) {
    const two = marketStore.itemIdOf(currency);
    if (two == null || two === one) continue;
    const r = await fetchPairRate(league, one, two);
    if (!r) continue;
    // 両側とも板が厚いペアだけ採用する
    if (r.oneStock < MIN_STOCK || r.twoStock < MIN_STOCK || r.oneVolume < MIN_VOLUME || r.twoVolume < MIN_VOLUME) continue;
    // 支払い量はアプリ共通の換算レートで出す (ペア内の相対値は薄い板で暴れるため)
    const rate = currency === "chaos" ? marketStore.rates.value.chaos : marketStore.rates.value.divine;
    options.push({ currency, exalted: r.onePrice, perUnit: rate > 0 ? r.onePrice / rate : r.onePrice, stock: r.oneStock });
  }
  if (options.length === 0) return null;
  const entry: BestBuy = { apiId, options, best: pickBest(options), fetchedAt: Date.now() };
  const cache = loadCache();
  cache[apiId] = entry;
  saveCache(cache);
  return entry;
}
