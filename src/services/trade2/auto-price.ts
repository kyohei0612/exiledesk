/**
 * trade2 の自動相場取得 (ヴァールの天秤 共通) 2026-09-12
 *
 * オーナー指示: 「トレードとリンクできるなら全部自動で」。各ツールは入力が揃った時点でここを呼び、
 * 検索は pricing.ts の直列キュー (search 10.5 秒間隔) に乗る。429 を受けたら全ツール共通で止める。
 *   - autoPrice(): 1 クエリの最安 (高貴)。失敗 / 0 件は null
 *   - tradeAuto: 進行中の件数 / レート制限の解除時刻 / 直近エラー (画面の状態表示用)
 */
import { computed, ref } from "vue";
import { nextSearchAllowedAt, priceMinForQuery, retryAfterSeconds, searchBudgetUsage, type ExaltedRates, type PriceResult } from "./pricing";

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
  /**
   * 直前の search から最小間隔 (10.5 秒) が空くまでの残り秒。連打しても裏で待たされるだけなので、
   * ボタンに「再取得まで N 秒」と出して 0 になったら押せるようにする (オーナー要望 2026-09-13)。
   * pending が使う値なので、検索中は 0 扱い (「検索中…」を優先)。
   */
  cooldownSecs: computed(() => {
    void now.value; // 1 秒ごとに再計算
    return pending.value > 0 ? 0 : Math.max(0, Math.ceil((nextSearchAllowedAt() - Date.now()) / 1000));
  }),
  /** 直近 5 分の検索回数 / 自主上限 (擬似レート制限)。1 秒ごとに更新 */
  budget: computed(() => {
    void now.value;
    return searchBudgetUsage();
  }),
  /** 画面ヘッダ用の短い状態文 */
  label: computed(() => {
    if (rateLimitedUntil.value && rateLimitedUntil.value > now.value) {
      return `trade2 レート制限中 (${Math.ceil((rateLimitedUntil.value - now.value) / 1000)} 秒)`;
    }
    if (pending.value > 0) return `trade2 検索中… (${pending.value} 件待ち、1 件 約 10 秒)`;
    return lastError.value ? `trade2 エラー: ${lastError.value}` : "";
  }),
};

/**
 * 再取得ボタンの文言と押せるか。各ツール共通 (アドニア / ジェム)。
 *   検索中 → "trade2 で検索中…" / 429 → "レート制限中 (N 秒)" / 間隔待ち → "再取得まで N 秒" / それ以外 → idleLabel
 */
export function refetchState(busy: boolean, idleLabel: string, busyLabel = "trade2 で検索中…"): { label: string; disabled: boolean } {
  if (busy) return { label: busyLabel, disabled: true };
  const limit = tradeAuto.rateLimitSecs.value;
  if (limit > 0) return { label: `レート制限中 (${limit} 秒)`, disabled: true };
  const cool = tradeAuto.cooldownSecs.value;
  if (cool > 0) return { label: `再取得まで ${cool} 秒`, disabled: true };
  const b = tradeAuto.budget.value;
  return { label: `${idleLabel} (5 分で ${b.used}/${b.max} 回)`, disabled: false };
}

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

/**
 * 最安値と「検索 ID 付きの URL」。API 検索が済んでいれば ?q= より確実に開ける
 * (JP サイトでも同じ ID が使える。Awakened PoE Trade 等の JP Trade ボタンと同じ経路)。
 */
export async function autoMinWithUrl(league: string, body: unknown, rates: ExaltedRates): Promise<{ min: number | null; url: string | null }> {
  const r = await autoPrice(league, body, rates);
  if (!r) return { min: null, url: null };
  return { min: r.minExalted != null ? Math.round(r.minExalted * 100) / 100 : null, url: r.searchUrl || null };
}
