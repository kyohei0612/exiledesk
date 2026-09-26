/**
 * 忍者ビルドコピーの相場を取引所で取る (2026-09-27)。読み込んだらそのまま順に取る
 *
 * レア (ジュエル以外)。オーナー:「完成品なしで先に MOD 群の一致みて、一致が無かったらもう MOD 付きやすい順で
 * 無くしていって検索かけようか」「MOD の一致があったらティア調整したらいいからね」:
 *   1. 全 MOD を数値なしで検索。0 件なら付きやすい MOD から 1 つずつ外して検索し直す (3 つは残す。それ以上は別物)
 *   2. MOD の組み合わせが見つかったら、数値を付けて 選んだ段 (品質・防御値も) → 1 段下げ → 2 段下げ。最初に出品のあった所の値段
 *      (安い方 5 件の真ん中。極端に安い 1 件に引っ張られない)
 *   3. どれも無ければ 1 の数値なしの、取れた出品の平均 (オーナー 2026-09-27「数値 OFF でヒットしたなら検索で取った平均値を」)
 * ユニーク (種類違い・ソケットのある物): prices.ts の uniqueTradeQuery で最安値。
 * 止まった所の検索を query に残し、「トレード2へ」はそこへ飛ぶ (オーナー「最終的に止まったところの状態をトレード2へで」)。
 * 検索は取引所の制限を守って待つ ([[query-cache.ts]]、30 分は覚える)
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

/** どこで止まったか (画面の色分け) */
export type AutoStage = "exact" | "lowered" | "bare" | "dropped" | "unique" | "none" | "skip" | "error";
export interface RareAutoResult {
  /** 高貴建て (出品が無ければ null) */
  exalted: number | null;
  total: number;
  stage: AutoStage;
  /** どこで取れた値段か (「最大マナ +42 を外して、1 段下げで 7 件」) */
  note: string;
  /** 止まった所の検索 (「トレード2へ」で開く) */
  query: unknown | null;
}

const prices = (r: PriceResult) =>
  r.listings
    .map((l) => l.amountExalted)
    .filter((v) => v > 0)
    .sort((a, b) => a - b)
    .slice(0, TOP_N);
/** 安い方から 5 件の真ん中 (3 件未満なら一番安い物) */
function medianOf(r: PriceResult): number | null {
  const xs = prices(r);
  if (!xs.length) return r.minExalted ?? null;
  return xs.length < 3 ? xs[0]! : xs[Math.floor((xs.length - 1) / 2)]!;
}
/** 取れた出品の平均 */
function averageOf(r: PriceResult): number | null {
  const xs = prices(r);
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : (r.minExalted ?? null);
}

type Opts = { aborted: () => boolean; onStep?: (s: string) => void };
async function search(q: unknown, step: string, opts: Opts): Promise<PriceResult | null> {
  if (opts.aborted()) return null;
  opts.onStep?.(step);
  const league = marketStore.league.value?.Value ?? "Standard";
  const go = (body: unknown) => autoPriceCached(league, body, marketStore.rates.value, TOP_N, { onWait: (secs) => opts.onStep?.(`${step} · 取引所の間隔待ち ${secs} 秒`) });
  const r = await go(q);
  // 「検索条件が複雑過ぎます」と断られたら、普通 / 冒涜 / 固定済み の 3 択を普通の MOD だけに戻して投げ直す (クラフト計算機と同じ)
  if (!r && !opts.aborted() && (tradeAuto.lastError.value ?? "").includes("複雑")) {
    opts.onStep?.(`${step} (条件を軽くして)`);
    return go(simplify(q));
  }
  return r;
}
/** 3 択の組 (count) を、先頭 (普通の MOD) だけの and に戻す */
function simplify(q: unknown): unknown {
  const body = q as { query: { stats?: Array<{ type: string; filters: unknown[] }> } };
  const stats = body.query.stats ?? [];
  const and = stats.filter((g) => g.type === "and").flatMap((g) => g.filters);
  const firsts = stats.filter((g) => g.type === "count").map((g) => g.filters[0]);
  return { ...body, query: { ...body.query, stats: [{ type: "and", filters: [...and, ...firsts] }] } };
}

/** 1 つのレアの相場を取る。aborted() が true になったら次の検索は投げずに null */
export async function autoRarePrice(a: RareAnalysis, picked: Readonly<Record<number, number>>, ratio: number, opts: Opts): Promise<RareAutoResult | null> {
  const count = a.mods.length + a.lines.length;
  const order = dropOrder(a);
  const drop = new Set<CondKey>();
  const dropped: string[] = [];

  // 1. MOD の組み合わせ (数値なし)。無ければ付きやすい MOD から外す
  let bareQ = rareQuery(a, picked, ratio, { values: false, drop });
  let bare = await search(bareQ, "MOD の組み合わせを確認", opts);
  for (const x of order) {
    if (!bare || bare.total > 0 || count - drop.size - 1 < KEEP_MIN) break;
    drop.add(x.key);
    dropped.push(x.text);
    bareQ = rareQuery(a, picked, ratio, { values: false, drop });
    bare = await search(bareQ, `付きやすい MOD を ${dropped.length} つ外して確認`, opts);
  }
  if (!bare) return opts.aborted() ? null : fail();
  const head = dropped.length ? `${dropped.join("、")} を外して、` : "";
  if (bare.total === 0) return { exalted: null, total: 0, stage: "none", note: `MOD を ${KEEP_MIN} つまで減らしても出品なし`, query: bareQ };

  // 2. 数値を付けて、選んだ段から 2 段下げまで
  let prev = "";
  for (let shift = 0; shift <= MAX_SHIFT; shift++) {
    const q = rareQuery(a, picked, ratio, { shift, drop });
    const key = JSON.stringify(q);
    if (key === prev) continue; // 全部一番下の段で、下げても同じ条件
    prev = key;
    const label = shift === 0 ? "選んだ段" : `${shift} 段下げ`;
    const r = await search(q, `${label}で検索`, opts);
    if (!r) return opts.aborted() ? null : fail();
    if (r.total > 0) {
      const stage: AutoStage = dropped.length ? "dropped" : shift === 0 ? "exact" : "lowered";
      return { exalted: medianOf(r), total: r.total, stage, note: `${head}${label}で ${r.total} 件`, query: q };
    }
  }
  // 3. 数値なしの、取れた出品の平均
  return { exalted: averageOf(bare), total: bare.total, stage: "bare", note: `${head}数値なしで ${bare.total} 件${bare.total > 1 ? ` (安い方 ${Math.min(TOP_N, bare.total)} 件の平均)` : ""}`, query: bareQ };
}

/**
 * ユニーク (種類違い・ソケットのある物) の最安値 (prices.ts の uniqueTradeQuery)。
 * 種類を決める MOD 全部 → 1 つ欠け → 2 つ欠けの順に、出品のあった所で止める
 */
export async function autoUniquePrice(v: { queries: unknown[] } | { reason: string }, opts: Opts): Promise<RareAutoResult | null> {
  if (opts.aborted()) return null;
  if ("reason" in v) return { exalted: null, total: 0, stage: "skip", note: v.reason, query: null };
  for (const [k, q] of v.queries.entries()) {
    const label = k === 0 ? "同じ種類・ソケット" : `種類の MOD が ${k} つ欠けても可`;
    const r = await search(q, `${label}で検索`, opts);
    if (!r) return opts.aborted() ? null : fail();
    if (r.total > 0) return { exalted: r.minExalted ?? medianOf(r), total: r.total, stage: "unique", note: `${label}の最安値 (${r.total} 件、コラプト問わず)`, query: q };
  }
  return { exalted: null, total: 0, stage: "none", note: "同じ種類の出品なし (poe.ninja の相場のまま)", query: v.queries[0] ?? null };
}

function fail(): RareAutoResult {
  return { exalted: null, total: 0, stage: "error", note: tradeAuto.lastError.value ?? "取れませんでした (少し待って取り直してください)", query: null };
}
