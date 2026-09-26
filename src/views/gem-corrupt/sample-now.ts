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
import { computed, ref } from "vue";
import { marketStore } from "../../state/market-store";
import { noteSpiritGem } from "../../state/gem-spirit";
import { buildGemQuery } from "../../services/trade2/query";
import { autoPrice, isRateLimited, msUntilSendable, tradeAuto } from "../../services/trade2/auto-price";
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
 * 取得の待ち行列。**監視リストへの追加は待たせない**で、取得だけ 1 本ずつ順に流す
 * (オーナー報告 2026-09-20:「使用率ランキングから監視中押しても何もならん。
 *  トレードと通信してる関係があるなら、監視リストに入れてから取得を続けるようにして」)。
 * 以前は取得中は「監視へ」ボタン自体を押せなくしていたので、レート制限待ちの間ずっと
 * 何も足せなかった。
 */
const queue: string[] = [];

/** 監視に入れたジェムの取得を予約する (走っていなければすぐ始まる) */
export function queueSample(gemEn: string): void {
  if (!queue.includes(gemEn) && current.value !== gemEn) queue.push(gemEn);
  void pump();
}

async function pump(): Promise<void> {
  if (running.value) return;
  for (;;) {
    const next = queue.shift();
    if (!next) return;
    await sampleGemNow(next);
  }
}

/** 取得の待ち行列に何本残っているか (画面に出す) */
export const sampleQueued = computed(() => queue.length);

/** 監視に入れた直後の取得が走っているか。走っている間は「一括取得」を押せなくする */
const running = ref(false);
export const sampleBusy = computed(() => running.value);
/** 今どのジェムを取っているか (画面のメッセージ用) */
const current = ref("");
export const sampleTarget = computed(() => current.value);

/** 押してから実際に投げるまで空ける時間 (オーナー指示 2026-09-20:「一応 10 秒空けてスタート」) */
const START_DELAY_MS = 10_000;
/** 1 条件あたりの待ちの上限 (レート制限が明けるのを待つが、永久には待たない) */
const MAX_WAIT_MS = 30 * 60 * 1000;
/** 待つ時の最短 (門番の予定が 0 でも、投げ直しの連打にしない) */
const POLL_MS = 5_000;
/** 本物のエラー (通信が落ちた等) は何回まで投げ直すか。超えたらその条件は次の巡回に任せる */
const MAX_ERRORS = 3;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * そのジェムの 3 条件を取る。**取れるまで順番待ちする** (レート制限なら明けるのを待つ)。
 *
 * オーナー指示 2026-09-20:「監視中にぶち込んだ瞬間に必ず 1 度取得を回そう、フルで 3 種。
 * レート制限なら取れるまで順番待機して、一応 10 秒空けてスタート。その際 一括は押せないように」。
 *
 * @returns 取れた条件の数と、待ちきれずに諦めた条件の数
 */
export async function sampleGemNow(gemEn: string): Promise<{ done: number; skipped: number }> {
  const gem = GEMS.find((g) => g.en === gemEn);
  const league = marketStore.league.value?.Value ?? "Standard";
  running.value = true;
  current.value = gemEn;
  let done = 0;
  try {
    // 押した直後に投げない (連打や、直前の取得と重ならないように 10 秒空ける)
    await sleep(START_DELAY_MS);
    for (const key of SALE_KEYS) {
      const body = buildGemQuery(gemEn, rowQueryOptions(key, gem?.kind === "meta"));
      // 2026-09-26 オーナー「1 ジェムなのにずっとまわってる、ループ系はまずい」:
      // 画面用の窓口で投げていたので、枠待ちで断られては 5 秒ごとに投げ直して空回りしていた
      // (その間は裏の巡回も「画面が待っている」と譲るので、両方が足踏みしていた)。
      // 今は patient (門番が枠の空きを長く待つ) で投げる。それでも取れない時は、門番が「次に投げられる」と
      // 言う時刻まで待つ。本物のエラーは MAX_ERRORS 回で諦める
      let waited = 0;
      let errors = 0;
      for (;;) {
        // 罰則で止まっている間は投げずに待つ
        if (isRateLimited()) {
          if (waited >= MAX_WAIT_MS) break;
          const w = Math.max(POLL_MS, msUntilSendable());
          await sleep(w);
          waited += w;
          continue;
        }
        const r = await autoPrice(league, body, marketStore.rates.value, undefined, { patient: true });
        if (r) {
          await recordGemSample(gemEn, key, r);
          done++;
          break;
        }
        if (tradeAuto.lastError.value && ++errors >= MAX_ERRORS) break;
        if (waited >= MAX_WAIT_MS) break;
        const w = Math.max(POLL_MS, msUntilSendable());
        await sleep(w);
        waited += w;
      }
    }
  } finally {
    running.value = false;
    current.value = "";
  }
  return { done, skipped: SALE_KEYS.length - done };
}
