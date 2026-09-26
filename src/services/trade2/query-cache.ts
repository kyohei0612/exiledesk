/**
 * query-cache.ts — 同じ条件の検索結果を 30 分覚えておく (クラフト計算機用、2026-09-24)
 *
 * オーナー:「レート制限だわ。でもキャッシュで進めて欲しい」。クラフト計算機は解析のたびに固定済み・固定無し・
 * 完成品・候補の MOD ごとに検索を投げるので、画面の確認や選び直しで同じ条件を何度も投げて 5 分の枠を使い切っていた。
 *
 * - 鍵 = リーグ + 検索の本文 + 取る件数。30 分で捨てる (相場は動くので長くは持たない)
 * - アプリ内 (localStorage) に置き、再読み込みでも残す。読めない・書けない時は無いものとして進む
 * - 取れなかった物 (null) は覚えない。次は待って取り直す ([[auto-price.ts]] の autoPriceWait)
 */
import { autoPriceWait } from "./auto-price";
import type { ExaltedRates, PriceResult } from "./pricing";

const KEY = "exiledesk.trade-query-cache.v1";
const TTL_MS = 30 * 60_000;
/** 覚えておく数の上限 (古い物から捨てる) */
const MAX = 200;

type Entry = { at: number; r: PriceResult };

function load(): Record<string, Entry> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, Entry>) : {};
  } catch {
    return {};
  }
}
function save(all: Record<string, Entry>): void {
  try {
    const keep = Object.entries(all).filter(([, e]) => Date.now() - e.at < TTL_MS)
      .sort((a, b) => b[1].at - a[1].at).slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch {
    // 容量や権限で書けなくても、検索そのものは進める
  }
}

/** 30 分以内に同じ条件で取っていればそれを返し、無ければ取引所へ (上限で止められたら待って取り直す) */
export async function autoPriceCached(
  league: string, body: unknown, rates: ExaltedRates, topN?: number,
  opts: { maxWaitMs?: number; onWait?: (secs: number) => void } = {},
): Promise<PriceResult | null> {
  const k = `${league}|${topN ?? ""}|${JSON.stringify(body)}`;
  const hit = load()[k];
  if (hit && Date.now() - hit.at < TTL_MS) return hit.r;
  const r = await autoPriceWait(league, body, rates, topN, opts);
  if (r) {
    const all = load();
    // 出品 ID の一覧は大きいので落とす (クラフト計算機は使わない)
    all[k] = { at: Date.now(), r: { ...r, allIds: [], listingIds: [] } };
    save(all);
  }
  return r;
}
