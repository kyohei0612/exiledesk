/**
 * market-flow.ts — 捌き速度 (2026-09-16)
 *
 * Rust 側 (src-tauri/src/market_flow.rs) が出品 1 件ずつを ID で追った記録から、
 * 「この商品はどれくらいで売れるのか」を出す。ジェム専用ではなく、trade2 のクエリを
 * 渡して登録した銘柄なら何でも同じ仕組みで測れる。
 *
 * ## 測り方
 * 追跡中の出品には 2 種類ある:
 *   - 消えた物   … 寿命 = 消えた時刻 − 出品時刻 (売れたか取り下げたか)
 *   - まだある物 … 「少なくとも今の齢までは売れていない」という情報
 * これを「1 日以内に売れた割合」「2 日以内に売れた割合」に直して判定する。
 *   割合 = (その時間内に消えた件数) ÷ (その時間の時点で結果が分かっている件数)
 *   まだ生きていて齢がその時間に届いていない物は「結果不明」として母数から外す。
 *
 * 以前は生存分析 (Kaplan-Meier) の中央値を使っていたが、実データで中央値 0.3 時間 (実際は
 * 4 時間) のような値が出た。出品直後に捕まえた品ほど早く消えるため、早い時刻では母数が
 * 数件しかなく、生存率が一気に落ちて中央値がそこで確定してしまう (左側切断の小標本問題)。
 * 割合ベースなら母数がはっきりしていて壊れない。
 *
 * ## 判定 (オーナー指示 2026-09-16)
 *   1 日以内に半分売れる → 速い / 2 日以内に半分売れる → 普通 / それ以下 → 遅い
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../utils/isTauriRuntime";
import { noteExternalRate, tradeAuto } from "./trade2/auto-price";
import { noteGateState } from "./trade2/pricing";
import type { FlowStatus, FlowStore, ListingRef, VerifyResult, Watch } from "./market-flow-types";

// 記録の型は market-flow-types.ts へ (2026-09-26 の分割)。呼ぶ側は今まで通りここから取れる
export type { Daily, FlowStatus, FlowStore, ListingRef, Tracked, VerifyResult, Watch, WatchState } from "./market-flow-types";

const EMPTY: FlowStore = { sampled_at: 0, list_refreshed_at: 0, league: "", site: "", watches: [], states: {} };

export async function loadFlow(): Promise<FlowStore> {
  if (!isTauriRuntime()) return EMPTY;
  try {
    return await invoke<FlowStore>("market_flow_load");
  } catch {
    return EMPTY;
  }
}

/** 追跡する銘柄を入れ替える */
export async function setWatches(watches: Watch[], league: string, site: string): Promise<void> {
  if (!isTauriRuntime() || !league) return;
  try {
    await invoke("market_flow_set_watches", { req: { watches, league, site } });
  } catch {
    /* 失敗しても本体の表示には影響しない */
  }
}


/** 1 巡の周期の既定 (秒)。Rust 側 CYCLE_DEFAULT_SECS と同じ */
/** 自動取得をしない設定の印 (Rust 側と合わせる) */
export const CYCLE_OFF = -1;

export const DEFAULT_CYCLE_SECS = 8 * 3600;

/** 1 巡の周期を変える (1〜24 時間)。戻り値は実際に入った秒数 */
export async function setFlowCycle(secs: number): Promise<number | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invoke<number>("market_flow_set_cycle", { secs });
  } catch {
    return null;
  }
}

/**
 * 自動追跡が今どうなっているか。
 * ついでに、裏の巡回が見たレート制限を画面側の待ちにも反映する
 * (オーナー指示 2026-09-17:「レートは一律で同じところを見るように全部」)。
 */
/**
 * トレードのレート制限で「止まっている」残り秒。画面はどこもこれを使う。
 *
 * 2026-09-19 オーナー「レート制限周りの同期がずれてる」: 画面ごとに別々の式で出していて、
 * ジェムコラプトは制限中、監視は完了、と食い違っていた。1 か所にまとめる。
 * 見る物は 3 つ:
 *   - 罰則 (429 / restricted) …… wait_until / retry_until
 *   - 枠が空くまでの待ち ……… budget_until (罰則ではないが取得は進まない)
 *   - 画面側が数えている分 …… tradeAuto (1 秒ごとに減る時計)
 * 通常の最低間隔 (10 秒前後) は「止まっている」ではないので入れない。
 */
export function tradeRateSecs(st: FlowStatus | null | undefined): number {
  const nowSec = Math.floor(Date.now() / 1000);
  const until = st?.retry_until ?? 0;
  return Math.max(until > 0 ? until - nowSec : 0, tradeAuto.rateLimitSecs.value);
}

/**
 * 次の 1 本を投げるまでの秒 (罰則ではない)。
 *
 * 2026-09-19 オーナー「レート待ちのくせになぜか進んでるよ、取得おかしい」:
 * 罰則 (429 で止まる) と順番待ち (間を空ける) を 1 つの数字にまとめていたので、
 * 進んでいるのに「解除まで取得は止まります」と出ていた。分けて出す。
 *   - 罰則     … 取得は**止まる**。解除まで何もできない (tradeRateSecs)
 *   - 順番待ち … 取得は**続く**。門番が一定の間隔で流しているだけ (こちら。最長でも数十秒)
 */
export function tradePaceSecs(st: FlowStatus | null | undefined): number {
  const nowSec = Math.floor(Date.now() / 1000);
  const until = st?.wait_until ?? 0;
  return Math.max(0, until > 0 ? until - nowSec : 0, tradeAuto.cooldownSecs.value);
}

export async function loadFlowStatus(): Promise<FlowStatus | null> {
  if (!isTauriRuntime()) return null;
  try {
    const st = await invoke<FlowStatus>("market_flow_status");
    // 「止まっている」は罰則だけ。枠待ちは順番待ちなので取得は進む
    // (2026-09-19: 一緒にしていたので、進んでいるのに「止まります」と出ていた。
    //  さらに isRateLimited() が true になって画面の取得が黙って見送られていた)
    const stopped = st.retry_until * 1000;
    noteExternalRate(stopped);
    // 画面のボタンの数字も門番の数に合わせる (手動と自動で別々に数えない)
    noteGateState({ penaltyUntilMs: stopped, nextAtMs: st.wait_until * 1000, used: st.budget_used, max: st.budget_max });
    return st;
  } catch {
    return null;
  }
}

/**
 * 手で取った結果を同じ記録に差し込む (ジェムコラプトの「再取得」)。
 * 自動巡回とまったく同じ条件・同じルールで判定される (2026-09-17)。
 */
export async function recordFlow(sample: { key: string; label?: string; total: number; ids: string[]; entries: ListingRef[] }): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await invoke("market_flow_record", { req: sample });
  } catch {
    /* 記録できなくても価格表示には影響しない */
  }
}

/**
 * 監視している全銘柄を今すぐ 1 巡する (オーナー指示 2026-09-17:
 * 「一括取得ボタン。自動取得の道を手動でスタートするだけ」)。
 * 中身は周期の自動取得とまったく同じ処理。走っている間は状態表示に進捗が出る。
 */
export async function sweepNow(): Promise<{ ok: boolean; message?: string }> {
  if (!isTauriRuntime()) return { ok: false, message: "アプリの中でだけ取得できます" };
  try {
    await invoke("market_flow_sample_now");
    return { ok: true };
  } catch (e) {
    // Rust 側の理由をそのまま出す (「取得中です」を「失敗しました」と言わないため)
    return { ok: false, message: typeof e === "string" ? e : e instanceof Error ? e.message : undefined };
  }
}

/** 手動の一括取得を中止する (取り切るまで繰り返すので、途中でやめる口) */
export async function cancelSweep(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await invoke("market_flow_cancel");
  } catch {
    /* 失敗しても次の周で止まる */
  }
}

/**
 * 記録している ID と、今の検索結果を突き合わせる (検索 1 回)。
 * 判定の土台が検索の ID 一覧なので、噛み合っているかを確かめるのに使う。
 */
export async function verifyFlow(key: string): Promise<VerifyResult | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invoke<VerifyResult>("market_flow_verify", { key });
  } catch {
    return null;
  }
}

// 捌き速度の「読み方」(速い / 普通 / 遅い の判定と言い回し) は flow-summary.ts へ。
// 呼ぶ側は今まで通り market-flow から取れるようにしておく (2026-09-19 の分割)
export {
  fateOf,
  flowSentence,
  fmtAge,
  fmtPct,
  fmtSellTime,
  soldWithin,
  summarizeFlow,
  type FlowSummary,
  type FlowTone,
  type TrackedFate,
} from "./flow-summary";
