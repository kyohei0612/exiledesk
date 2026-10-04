/**
 * 素材を「どの通貨で買うのが一番安いか」(2026-09-16)
 *
 * オーナー指摘「たまにカオスで買った方が安い」→「取引所だとレートあるんじゃない？」。
 * ゲーム内カレンシー取引所のペアごとの実レートが poe2scout のペア履歴に入っている
 * (`Currencies/Pairs/{素材}/{支払い通貨}/History`)。同じ素材でもペアで値が変わる。
 *   実測 (2026-09-16): ヴァールオーブ = カオス経由 4.32 / 高貴経由 4.47 (高貴換算)
 * 板が薄いペアは値が飛ぶので、在庫のあるペアを優先する。結果は 30 分そのまま使う (localStorage)。
 */
import { shallowRef } from "vue";
import { fetchPairRate } from "../../api/poe2scout";
import { marketStore } from "../../state/market-store";
import { ceilMoney } from "../money";
import { payWithExalted } from "../../state/display-currency";

/**
 * 支払いに使う通貨。取引所のレートは 3 つとも取っておき、どれで買うかは bestFor で決める。
 * 2026-09-16「高貴は手数料 (ゴールド) が掛かるので外す」→ 2026-10-04「スピリットジェム 17 は高貴で交換した方が安い」で一度入れたが、
 * 「めっちゃゴールド飛ぶ」で、高貴は表示通貨「最安値」の時だけ (payWithExalted)。適正などはカオスと神だけ
 * (実測: 原石 lv17 = 高貴のペア 80.7 / カオスのペア 176 (高貴換算))
 */
export const PAY_CURRENCIES = ["chaos", "divine", "exalted"] as const;
export type PayCurrency = (typeof PAY_CURRENCIES)[number];

export interface PayOption {
  currency: PayCurrency;
  /** 素材 1 個の高貴換算 (取引所のレートそのまま) */
  exalted: number;
  /** 素材 1 個あたり払う量 (その通貨建て、取引所のレートそのまま) */
  perUnit: number;
  /** 素材側の在庫 (板の厚み) */
  stock: number;
}

/** 実際に払う額に直した単価 (payable() で作る) */
export interface PayableOption extends PayOption {
  /** 繰り上げ後に実際に払う量 */
  payPerUnit: number;
  /** 繰り上げ後の高貴換算 (費用と期待値はこの値で計算する) */
  payExalted: number;
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
 *
 * 2026-09-18 オーナー指摘「ここだけ取引所価格にならない」: 在庫 50 / 取引 20 という線が厳しすぎて、
 * 宝飾職人のオーブ (完全)・コラプトの結晶・原石といった数の出ない素材が軒並み落ちていた。
 * 線を下げる代わりに、壊れた値そのものを下で弾く (SANE_FLOOR)。
 */
const MIN_STOCK = 10;
const MIN_VOLUME = 5;
/**
 * 相場 (poe2scout) のこの割合を下回る値は、板が壊れているとみなして捨てる。
 *
 * 計算を狂わせるのは「安すぎる値」だけ (単価は相場と取引所の安い方を使うので、高すぎる値は相場に負けて無視される)。
 * 上の実測でも 4.11 の原石が 1.5 (= 相場の 0.36 倍) と出ていた。
 */
const SANE_FLOOR = 0.5;
// v2 = 高貴のペアも入れた (2026-10-04)。前の版の覚えはカオスと神だけなので読まない
const CACHE_KEY = "exiledesk.exchange.pairRates.v2";
const FRESH_MS = 30 * 60 * 1000;

type Cache = Record<string, BestBuy>;

/**
 * キャッシュの版 (書いた時と、どれかが 30 分の期限を過ぎた時に上がる)。
 *
 * cachedBuy は localStorage を読むだけなので、computed から呼んでも Vue は変化に気づかない。
 * 自動ジェム監視の期待値が、取り直した / 期限が切れた後も古い単価のまま残っていた (2026-09-26 監査)。
 * cachedBuy の中でこれを読んでおけば、呼んだ computed が書き込みと期限切れで計算し直される。
 */
export const exchangeCacheVersion = shallowRef(0);
/** fetchedAt の 30 分後に版を上げる (期限切れを computed に知らせる) */
function scheduleExpiry(fetchedAt: number): void {
  const wait = fetchedAt + FRESH_MS - Date.now();
  if (wait <= 0 || typeof setTimeout !== "function") return;
  setTimeout(() => {
    exchangeCacheVersion.value++;
  }, wait + 1000);
}

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
  void exchangeCacheVersion.value; // 書き込み・期限切れで呼び出し元の computed を計算し直させる
  const hit = loadCache()[apiId];
  return hit && Date.now() - hit.fetchedAt < FRESH_MS ? hit : null;
}

/**
 * 実際に払う額に直す (オーナー指示 2026-09-17:「3.2 神とかでも 4 神で表記してくれ、要は繰上の値段で」)。
 *
 * 通貨は 1 個単位でしか渡せないので、1 個以上の単価は切り上げた額が実際の出費になる。
 * 1 未満 (宝石細工師のプリズムが 0.05 神 など) は束でまとめて買う物なので、そのままにする
 * (ここを切り上げると 20 倍の値段になってしまう)。
 * 取ってきたレートはそのまま持っておいて (キャッシュも生の値)、使う時にこれを通す。
 */
export function payableUnit(perUnit: number): number {
  return perUnit >= 1 ? ceilMoney(perUnit) : perUnit;
}

/** 生のレートに「実際に払う額」を足す。高貴換算も繰り上げ後の量から出し直す */
export function payable(o: PayOption): PayableOption {
  const payPerUnit = payableUnit(o.perUnit);
  const ratio = o.perUnit > 0 ? payPerUnit / o.perUnit : 1;
  return { ...o, payPerUnit, payExalted: o.exalted * ratio };
}

/**
 * need 個まとめて買った時に実際に払う総額 (高貴換算)。通貨は 1 個単位でしか渡せないので、総額を最後に 1 回だけ切り上げる
 * (2026-10-04 夕方: 1 個ずつ切り上げて比べていて、完全の宝石細工師 3.02 カオスを 4 カオスと数え、高貴との差が 7 倍に見えていた。
 * 60 個まとめれば 181 カオス)
 */
export function totalPayExalted(o: PayOption, need = 1): number {
  const n = Math.max(1, need);
  const amount = o.perUnit * n;
  const paid = amount >= 1 ? ceilMoney(amount) : amount;
  return amount > 0 ? o.exalted * n * (paid / amount) : o.exalted * n;
}

/** 一番安いのは need 個まとめて「実際に払う額」で比べる (1.1 神 = 2 神 払うより、カオスで買う方が安いこともある) */
function pickBest(options: PayOption[], need = 1): PayOption | null {
  return options.reduce<PayOption | null>((a, b) => (a == null || totalPayExalted(b, need) < totalPayExalted(a, need) ? b : a), null);
}

/**
 * 必要な数 need を買える在庫のある通貨のうち、実際に払う額が一番安い物 (2026-10-04 オーナー「在庫とか確認して 60 回なら在庫が高貴であって、
 * 計算しても高貴で買う方が安いなら高貴で経費を出すべき」)。どの通貨も在庫が足りなければ、在庫の一番多い物
 */
export function bestFor(entry: BestBuy | null | undefined, need = 1, withExalted = payWithExalted.value): PayOption | null {
  if (!entry) return null;
  const options = entry.options.filter((o) => withExalted || o.currency !== "exalted");
  const enough = options.filter((o) => o.stock >= need);
  const best = enough.length ? pickBest(enough, need) : options.reduce<PayOption | null>((a, b) => (a == null || b.stock > a.stock ? b : a), null);
  return withExalted ? best : cheaperByExalted(entry, best, need);
}

/**
 * 適正 (カオスと神だけ) でも、高貴で need 個まとめて買う総額が 20% 以上安ければ高貴にする (2026-10-04 夕方 オーナー「高貴で買った方が
 * 安い市場なら適正でも 1 つ下の奴で」→ 線は「ゴールドとかめんどさも含めて」で率に、「20%」)。
 * ゴールドは動かすカレンシーの個数で増え、高貴はカオスの約 70 倍の個数を動かすので、少し安いだけなら高貴にしない
 * (60 回: 原石 lv17 は 54% 安い → 高貴、完全の宝石細工師は 6% → カオスのまま)
 */
export const EXALTED_DISCOUNT = 0.2;
function cheaperByExalted(entry: BestBuy, best: PayOption | null, need: number): PayOption | null {
  const ex = entry.options.find((o) => o.currency === "exalted" && o.stock >= need);
  if (!ex) return best;
  if (!best) return ex;
  return totalPayExalted(ex, need) <= totalPayExalted(best, need) * (1 - EXALTED_DISCOUNT) ? ex : best;
}

/** 素材 1 つをカオス / 神 / 高貴で引いて、安い方を決める */
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
    // 板が薄すぎるペアは見ない
    if (r.oneStock < MIN_STOCK || r.twoStock < MIN_STOCK || r.oneVolume < MIN_VOLUME || r.twoVolume < MIN_VOLUME) continue;
    // 相場より極端に安い値は板が壊れている (薄い板だと相対値が暴れる)
    const market = marketStore.priceOf(apiId);
    if (market != null && market > 0 && r.onePrice < market * SANE_FLOOR) continue;
    // 支払い量はアプリ共通の換算レートで出す (ペア内の相対値は薄い板で暴れるため)
    const rate = currency === "chaos" ? marketStore.rates.value.chaos : currency === "divine" ? marketStore.rates.value.divine : 1;
    options.push({ currency, exalted: r.onePrice, perUnit: rate > 0 ? r.onePrice / rate : r.onePrice, stock: r.oneStock });
  }
  if (options.length === 0) return null;
  // best は高貴を除いた物 (適正の決め方)。画面は bestFor で表示通貨に合わせて選び直す
  const entry: BestBuy = { apiId, options, best: pickBest(options.filter((o) => o.currency !== "exalted")), fetchedAt: Date.now() };
  const cache = loadCache();
  cache[apiId] = entry;
  saveCache(cache);
  exchangeCacheVersion.value++;
  scheduleExpiry(entry.fetchedAt);
  return entry;
}

// 起動時に localStorage に残っている分も、期限が来たら版を上げる (前回の起動で取った単価)
for (const e of Object.values(loadCache())) if (e && typeof e.fetchedAt === "number") scheduleExpiry(e.fetchedAt);
