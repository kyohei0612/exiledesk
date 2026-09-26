/**
 * 忍者ビルドコピーのレアの相場を自動で取る (2026-09-27)
 *
 * オーナー:「やっぱ自動がいいよね」「完成品なしで先に MOD 群の一致みて、一致が無かったらもう MOD 付きやすい順で
 * 無くしていって検索かけようか」「MOD の一致があったらティア調整したらいいからね」。ジュエルは対象外 (「レアジュエルはなしで」)。
 *   1. 全 MOD を数値なしで検索。0 件なら付きやすい MOD から 1 つずつ外して検索し直す (3 つは残す。それ以上は別物)
 *   2. MOD の組み合わせが見つかったら、数値を付けて 選んだ段 → 1 段下げ → 2 段下げ。最初に出品のあった所の値段
 *   3. どれも無ければ 1 の数値なしの値段
 * 値段は安い方から 5 件の真ん中 (極端に安い 1 件に引っ張られない)。検索は取引所の制限を守って待つ ([[query-cache.ts]]、30 分は覚える)
 */
import { autoPriceCached } from "../trade2/query-cache";
import { tradeAuto } from "../trade2/auto-price";
import { marketStore } from "../../state/market-store";
import { dropOrder, rareQuery, type CondKey, type RareAnalysis } from "./rare-query";
import type { PriceResult } from "../trade2/pricing";

/** 外して残す MOD の下限 (クラフト計算機と同じ。オーナー 2026-09-26「MOD は 3 つまで合っていたらおｋ」) */
const KEEP_MIN = 3;
/** 数値を付けて下げる段の数 */
const MAX_SHIFT = 2;
const TOP_N = 5;

export interface RareAutoResult {
  /** 高貴建て (出品が無ければ null) */
  exalted: number | null;
  total: number;
  /** どこで取れた値段か (「最大マナ +42 を外して、1 段下げで 7 件」) */
  note: string;
  /** 値段を取った検索 (取引所で開く用) */
  query: unknown | null;
}

/** 安い方から 5 件の真ん中 (3 件未満なら一番安い物) */
function priceOf(r: PriceResult): number | null {
  const xs = r.listings.map((l) => l.amountExalted).filter((v) => v > 0).sort((a, b) => a - b).slice(0, TOP_N);
  if (!xs.length) return r.minExalted ?? null;
  return xs.length < 3 ? xs[0]! : xs[Math.floor((xs.length - 1) / 2)]!;
}

/**
 * 1 つのレアの相場を取る。aborted() が true になったら次の検索は投げずに null。
 * 取引所の間隔待ちは onWait で秒数を知らせる
 */
export async function autoRarePrice(
  a: RareAnalysis,
  picked: Readonly<Record<number, number>>,
  ratio: number,
  opts: { aborted: () => boolean; onStep?: (s: string) => void },
): Promise<RareAutoResult | null> {
  const league = marketStore.league.value?.Value ?? "Standard";
  const search = async (q: unknown, step: string): Promise<PriceResult | null> => {
    if (opts.aborted()) return null;
    opts.onStep?.(step);
    return autoPriceCached(league, q, marketStore.rates.value, TOP_N, { onWait: (secs) => opts.onStep?.(`${step} (取引所の間隔待ち ${secs} 秒)`) });
  };
  const count = a.mods.length + a.lines.length;
  const order = dropOrder(a);
  const drop = new Set<CondKey>();
  const dropped: string[] = [];

  // 1. MOD の組み合わせ (数値なし)。無ければ付きやすい MOD から外す
  let bare = await search(rareQuery(a, picked, ratio, { values: false, drop }), "MOD の組み合わせを確認中");
  for (const x of order) {
    if (!bare || bare.total > 0 || count - drop.size - 1 < KEEP_MIN) break;
    drop.add(x.key);
    dropped.push(x.text);
    bare = await search(rareQuery(a, picked, ratio, { values: false, drop }), `${dropped.length} つ外して確認中`);
  }
  if (!bare) return opts.aborted() ? null : fail();
  const head = dropped.length ? `${dropped.join("、")} を外して` : "";
  if (bare.total === 0) return { exalted: null, total: 0, note: `MOD を ${KEEP_MIN} つまで減らしても出品なし`, query: null };

  // 2. 数値を付けて、選んだ段から 2 段下げまで
  let prev = "";
  for (let shift = 0; shift <= MAX_SHIFT; shift++) {
    const q = rareQuery(a, picked, ratio, { shift, drop });
    const key = JSON.stringify(q);
    if (key === prev) continue; // 全部一番下の段で、下げても同じ条件
    prev = key;
    const label = shift === 0 ? "選んだ段" : `${shift} 段下げ`;
    const r = await search(q, `${label}で検索中`);
    if (!r) return opts.aborted() ? null : fail();
    if (r.total > 0) return { exalted: priceOf(r), total: r.total, note: `${head}${head ? "、" : ""}${label}で ${r.total} 件`, query: q };
  }
  // 3. 数値なしの値段
  return { exalted: priceOf(bare), total: bare.total, note: `${head}${head ? "、" : ""}数値なしで ${bare.total} 件 (数値は低め)`, query: rareQuery(a, picked, ratio, { values: false, drop }) };
}

function fail(): RareAutoResult {
  return { exalted: null, total: 0, note: tradeAuto.lastError.value ?? "取れませんでした (少し待って取り直してください)", query: null };
}

/**
 * 種類違いのあるユニークの最安値 (prices.ts の uniqueVariantQuery)。種類を決める MOD 全部 → 1 つ欠け → 2 つ欠けの順に、
 * 出品のあった所で止める
 */
export async function autoUniquePrice(
  v: { queries: unknown[] } | { reason: string },
  opts: { aborted: () => boolean; onStep?: (s: string) => void },
): Promise<RareAutoResult | null> {
  if (opts.aborted()) return null;
  if ("reason" in v) return { exalted: null, total: 0, note: v.reason, query: null };
  const league = marketStore.league.value?.Value ?? "Standard";
  for (const [k, q] of v.queries.entries()) {
    if (opts.aborted()) return null;
    const label = k === 0 ? "同じ MOD" : `種類の MOD が ${k} つ欠けても可`;
    opts.onStep?.(`${label}で検索中`);
    const r = await autoPriceCached(league, q, marketStore.rates.value, TOP_N, { onWait: (secs) => opts.onStep?.(`取引所の間隔待ち ${secs} 秒`) });
    if (!r) return opts.aborted() ? null : fail();
    if (r.total > 0) return { exalted: r.minExalted ?? priceOf(r), total: r.total, note: `${k === 0 ? "同じ MOD の最安値" : `${label}で最安値`} (${r.total} 件、コラプト問わず)`, query: q };
  }
  return { exalted: null, total: 0, note: "同じ種類の出品なし (poe.ninja の相場のまま)", query: v.queries[0] ?? null };
}
