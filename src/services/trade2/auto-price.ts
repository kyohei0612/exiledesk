/**
 * trade2 の自動相場取得 (ヴァールの天秤 共通) 2026-09-12
 *
 * オーナー指示: 「トレードとリンクできるなら全部自動で」。各ツールは入力が揃った時点でここを呼び、
 * 検索は pricing.ts の直列キュー (search 10.5 秒間隔) に乗る。429 を受けたら全ツール共通で止める。
 *   - autoPrice(): 1 クエリの最安 (高貴)。失敗 / 0 件は null
 *   - tradeAuto: 進行中の件数 / レート制限の解除時刻 / 直近エラー (画面の状態表示用)
 */
import { computed, ref } from "vue";
import { priceMinForQuery, retryAfterSeconds, type ExaltedRates, type PriceResult } from "./pricing";

const pending = ref(0);
const rateLimitedUntil = ref<number | null>(null);
const lastError = ref<string | null>(null);
const now = ref(Date.now());
setInterval(() => {
  now.value = Date.now();
}, 1000);

export const tradeAuto = {
  pending,
  rateLimitedUntil,
  lastError,
  /** 残り秒 (制限中でなければ 0) */
  rateLimitSecs: computed(() => (rateLimitedUntil.value ? Math.max(0, Math.ceil((rateLimitedUntil.value - now.value) / 1000)) : 0)),
  /** 画面ヘッダ用の短い状態文 */
  label: computed(() => {
    if (rateLimitedUntil.value && rateLimitedUntil.value > now.value) {
      return `trade2 レート制限中 (${Math.ceil((rateLimitedUntil.value - now.value) / 1000)} 秒)`;
    }
    if (pending.value > 0) return `trade2 検索中… (${pending.value} 件待ち、1 件 約 10 秒)`;
    return lastError.value ? `trade2 エラー: ${lastError.value}` : "";
  }),
};

export function isRateLimited(): boolean {
  return !!rateLimitedUntil.value && rateLimitedUntil.value > Date.now();
}

/** 1 クエリの最安。制限中は即 null。 */
export async function autoPrice(league: string, body: unknown, rates: ExaltedRates): Promise<PriceResult | null> {
  if (isRateLimited()) return null;
  pending.value += 1;
  try {
    const r = await priceMinForQuery(league, body, rates);
    lastError.value = null;
    return r;
  } catch (e) {
    const secs = retryAfterSeconds(e);
    if (secs) {
      rateLimitedUntil.value = Date.now() + secs * 1000;
      lastError.value = null;
    } else {
      lastError.value = e instanceof Error ? e.message : String(e);
    }
    return null;
  } finally {
    pending.value = Math.max(0, pending.value - 1);
  }
}

/** 最安値だけ (高貴)。0 件 / 失敗は null */
export async function autoMin(league: string, body: unknown, rates: ExaltedRates): Promise<number | null> {
  const r = await autoPrice(league, body, rates);
  return r && r.minExalted != null ? Math.round(r.minExalted * 100) / 100 : null;
}
