/**
 * trade2 の自動相場取得 (ヴァールの天秤 共通) 2026-09-12
 *
 * オーナー指示: 「トレードとリンクできるなら全部自動で」。各ツールは入力が揃った時点でここを呼び、
 * 検索は pricing.ts の直列キューに乗り、本番は Rust の門番が検索 + 取得の合計を 5 分 22 回 (≈ 13.6 秒に 1 回、
 * 貯めれば 6 回まで続けて) で流し、5 分の合計も見張る。429 を受けたら全ツール共通で止める。
 *   - autoPrice(): 1 クエリの最安 (高貴)。失敗 / 0 件は null
 *   - tradeAuto: 進行中の件数 / レート制限の解除時刻 / 直近エラー (画面の状態表示用)
 */
import { computed, ref } from "vue";
import { gatePenaltyUntilMs, isBudgetWait, nextSearchAllowedAt, priceMinForQuery, retryAfterSeconds, searchBudgetUsage, type ExaltedRates, type PriceResult } from "./pricing";

const pending = ref(0);
/** 画面が直接受けた 429 の解除予定 (門番の罰則と合流する)。null = 受けていない */
const rateLimitedUntil = ref<number | null>(null);
/** 門番が「枠待ち」と言って見送った時の、次に投げられる時刻 (罰則ではない) */
const paceUntil = ref(0);
const lastError = ref<string | null>(null);
const now = ref(Date.now());
setInterval(() => {
  now.value = Date.now();
}, 1000);

/**
 * 自動巡回 (Rust 側) が見たレート制限の解除予定をこちらにも取り込む (オーナー指示 2026-09-17:
 * 「レートは一律で同じところを見るように全部」)。
 *
 * 2026-09-19 のリファクタで、ヘッダ (rules / state) をここで JS 側に流し込むのはやめた。
 * 門番が同じヘッダを見て超過ぶんだけ待つのに、JS 側は「窓の長さぶん止める」古い式で
 * 計算していて、巡回中ずっと「あと 300 秒」と出る原因になっていた。
 * 今は解除予定 (untilMs) だけを合流させ、使用数などは noteGateState で門番の数をそのまま出す。
 *
 * @param untilMs 解除予定 (ms)。0 / 過去なら無視
 */
export function noteExternalRate(untilMs = 0): void {
  if (untilMs > Date.now() && untilMs > (rateLimitedUntil.value ?? 0)) rateLimitedUntil.value = untilMs;
}

/**
 * 止まっている解除予定 (ms)。**罰則 (429) だけ**。
 * 順番待ち (次の 1 本まで数秒〜数十秒) は止まりではないので入れない (cooldownSecs に出る)
 */
function stoppedUntilMs(): number {
  return Math.max(rateLimitedUntil.value ?? 0, gatePenaltyUntilMs());
}

/** 次に投げられる時刻 (ms)。門番の予定と、門番に「枠待ち」で断られた分の遅い方 */
function nextAtMs(): number {
  return Math.max(nextSearchAllowedAt(), paceUntil.value);
}

export const tradeAuto = {
  pending,
  rateLimitedUntil,
  lastError,
  /** 止まっている残り秒 (制限中でなければ 0)。どの画面もこれ 1 つを見る */
  rateLimitSecs: computed(() => {
    void now.value;
    return Math.max(0, Math.ceil((stoppedUntilMs() - Date.now()) / 1000));
  }),
  /**
   * 次の 1 本を投げられるまでの残り秒 (門番の間隔待ち)。連打しても裏で待たされるだけなので、
   * ボタンに「再取得まで N 秒」と出して 0 になったら押せるようにする (オーナー要望 2026-09-13)。
   * pending が使う値なので、検索中は 0 扱い (「検索中…」を優先)。
   */
  cooldownSecs: computed(() => {
    void now.value; // 1 秒ごとに再計算
    return pending.value > 0 ? 0 : Math.max(0, Math.ceil((nextAtMs() - Date.now()) / 1000));
  }),
  /** 直近 5 分の検索回数 / 自主上限 (擬似レート制限)。1 秒ごとに更新 */
  budget: computed(() => {
    void now.value;
    return searchBudgetUsage();
  }),
  /**
   * 「今トレードに投げられるまで」の残り秒。制限中の秒数と最小間隔の遅い方 (どの画面でも同じ値)。
   * 1 秒ごとに数え直すので、待っている間はちゃんと減っていく。
   */
  waitSecs: computed(() => {
    void now.value;
    const limit = Math.max(0, Math.ceil((stoppedUntilMs() - Date.now()) / 1000));
    const cool = Math.max(0, Math.ceil((nextAtMs() - Date.now()) / 1000));
    return Math.max(limit, cool);
  }),
};

/**
 * 再取得ボタンの文言と押せるか。各ツール共通 (アドニア / ジェム)。
 *   検索中 → "trade2 で検索中…" / 429 → "レート制限中 (N 秒)" / 間隔待ち → "再取得まで N 秒" / それ以外 → idleLabel
 */
/**
 * 巡回 (自動巡回 / 一括取得 / 監視に足した直後の取得) が走っている間の一言。
 * 空なら走っていない。state/fetch-busy.ts が見張って入れる。
 *
 * ここに置くのは循環参照を避けるため (fetch-busy → auto-price の一方向だけにする)。
 */
const sweepBusyLabel = ref("");
/** 巡回の状態を知らせる (fetch-busy.ts からのみ呼ぶ) */
export function noteSweepBusy(label: string): void {
  sweepBusyLabel.value = label;
}
/** 今どこかで巡回・一括取得が走っているか */
export const sweepBusy = computed(() => sweepBusyLabel.value !== "");

/**
 * 取得ボタンの見た目 (押せるか / 何と書くか)。
 *
 * オーナー指示 2026-09-20:「巡回中は他の取得は触れないようにしよう」。
 * 取得はどれも同じ門番を通るので、巡回中に押しても順番待ちに並ぶだけで
 * 画面には何も起きず「止まって見える」。押せなくして、理由をボタンに出す。
 */
export function refetchState(busy: boolean, idleLabel: string, busyLabel = "trade2 で検索中…"): { label: string; disabled: boolean } {
  if (busy) return { label: busyLabel, disabled: true };
  if (sweepBusyLabel.value) return { label: sweepBusyLabel.value, disabled: true };
  const limit = tradeAuto.rateLimitSecs.value;
  if (limit > 0) return { label: `トレードのレート制限中 (${limit} 秒)`, disabled: true };
  const cool = tradeAuto.cooldownSecs.value;
  if (cool > 0) return { label: `再取得まで ${cool} 秒`, disabled: true };
  const b = tradeAuto.budget.value;
  return { label: `${idleLabel} (5 分で ${b.used}/${b.max} 回)`, disabled: false };
}

/** 今は投げても止められる (罰則か枠待ち)。画面の取得はこれで見送る */
export function isRateLimited(): boolean {
  return stoppedUntilMs() > Date.now();
}

/** 1 クエリの最安。制限中は即 null。 */
export async function autoPrice(league: string, body: unknown, rates: ExaltedRates, topN?: number): Promise<PriceResult | null> {
  if (isRateLimited()) return null;
  pending.value += 1;
  try {
    const r = await priceMinForQuery(league, body, rates, topN);
    lastError.value = null;
    return r;
  } catch (e) {
    const secs = retryAfterSeconds(e);
    if (secs) {
      // 門番の「枠待ち」は順番待ちなので、止まり (罰則) には数えず次の予定だけ動かす
      if (isBudgetWait(e)) paceUntil.value = Date.now() + secs * 1000;
      else rateLimitedUntil.value = Date.now() + secs * 1000;
      lastError.value = null;
    } else {
      lastError.value = e instanceof Error ? e.message : String(e);
    }
    return null;
  } finally {
    pending.value = Math.max(0, pending.value - 1);
  }
}

/**
 * 止められていたら解けるまで待って投げ直す版 (クラフト計算機の一斉検索用、2026-09-24)。
 *
 * `autoPrice` は罰則中はすぐ null、門番の枠待ち (5 分 30 回) は断られて null を返す。どちらも理由 (`lastError`) が
 * 空なので、画面では「取れませんでした」としか出ず、一斉検索の途中の分が抜けていた。ここでは**決まりは守ったまま**
 * 解除予定まで待ち、もう一度投げる。本当のエラー (`lastError` あり) や、待ちが `maxWaitMs` を超える時は null。
 * `onWait` に待つ秒数を知らせる (画面の「上限で待ち」表示用)。
 */
export async function autoPriceWait(
  league: string, body: unknown, rates: ExaltedRates, topN?: number,
  opts: { maxWaitMs?: number; onWait?: (secs: number) => void } = {},
): Promise<PriceResult | null> {
  const maxWait = opts.maxWaitMs ?? 5 * 60_000;
  const started = Date.now();
  for (;;) {
    const r = await autoPrice(league, body, rates, topN);
    if (r || lastError.value) return r;
    const until = Math.max(stoppedUntilMs(), nextAtMs());
    const wait = until - Date.now();
    if (wait <= 0 || Date.now() + wait - started > maxWait) {
      if (wait > 0) lastError.value = `取引所の上限で ${Math.ceil(wait / 1000)} 秒待ちが要る`;
      return null;
    }
    opts.onWait?.(Math.ceil(wait / 1000));
    await new Promise((res) => setTimeout(res, wait + 300));
  }
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
