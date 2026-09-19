/**
 * sample-now.ts — 監視に足したその場で、そのジェムの 3 条件の最安を 1 回ずつ取って巡回の記録に挟む
 *
 * オーナー指示 (2026-09-19):「監視ボタン押したら各項目の最安値だけ 1 件取れるみたいなのでいい。
 * それでクラフトするか決めるだけ」。足した直後は次の巡回 (既定 8 時間) まで「巡回待ち」で
 * 値段が出なかったので、足した時に 1 回だけ取る。
 *
 * 費用: 1 ジェム = search 3 + fetch 3 = 6 リクエスト (5 分の自主上限 22 の 3 割弱)。
 * 門番 (trade2.rs) を通るので枠待ちはするが、罰則 (429) は踏まない。待ちに入っていたら
 * その条件は飛ばして「次の巡回で取る」に任せる (autoPrice が null を返す)。
 *
 * 記録の形は自動巡回・ジェムコラプトの「再取得」と同じ (market_flow_record) なので、
 * 捌き速度の判定にもそのまま使われる。
 */
import { marketStore } from "../../state/market-store";
import { noteSpiritGem } from "../../state/gem-spirit";
import { buildGemQuery } from "../../services/trade2/query";
import { autoPrice } from "../../services/trade2/auto-price";
import { type PriceResult } from "../../services/trade2/pricing";
import { recordFlow } from "../../services/market-flow";
import { rowQueryOptions, SALE_KEYS, SALE_KEY_LABEL, watchKey, type SaleKey } from "./row-query";
import gemsRaw from "../../i18n/gems-client.json";
import type { GemInfo } from "./useGemCorrupt";

// useGemCorrupt がこちらを使うので、一覧は json から直接読んで循環 import にしない
const GEMS: readonly GemInfo[] = gemsRaw as GemInfo[];

/** 取った 1 条件ぶんを巡回の記録に挟む (ジェムコラプトの「再取得」と共通) */
export async function recordGemSample(gemEn: string, key: SaleKey, r: PriceResult): Promise<void> {
  const gem = GEMS.find((g) => g.en === gemEn);
  // 出品に「リザーブ … Spirit」が出ていれば、そのジェムはスピリットジェムの原石で作る。
  // 取った応答から読むだけなので、これ用のリクエストは増えない (2026-09-19)
  noteSpiritGem(gemEn, r.reservesSpirit ?? null);
  await recordFlow({
    key: watchKey(gemEn, key),
    label: `${gem?.ja ?? gemEn} (${SALE_KEY_LABEL[key]})`,
    total: r.total,
    ids: r.allIds ?? r.listingIds ?? [],
    entries: r.listings.map((l) => ({
      id: l.id,
      amount: l.amount,
      currency: l.currency,
      account: l.account || null,
      listed_at: l.indexed ? Math.floor(Date.parse(l.indexed) / 1000) || null : null,
    })),
  });
}

/**
 * そのジェムの 3 条件を今すぐ 1 回ずつ取る。
 * @returns 取れた条件の数と、待ちで飛ばした条件の数
 */
export async function sampleGemNow(gemEn: string): Promise<{ done: number; skipped: number }> {
  const gem = GEMS.find((g) => g.en === gemEn);
  const league = marketStore.league.value?.Value ?? "Standard";
  let done = 0;
  for (const key of SALE_KEYS) {
    const r = await autoPrice(league, buildGemQuery(gemEn, rowQueryOptions(key, gem?.kind === "meta")), marketStore.rates.value);
    if (!r) continue;
    await recordGemSample(gemEn, key, r);
    done++;
  }
  return { done, skipped: SALE_KEYS.length - done };
}
