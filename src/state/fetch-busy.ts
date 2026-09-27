/**
 * fetch-busy.ts — 「今トレードの取得が走っているか」をアプリ全体で 1 か所に持つ (2026-09-20)
 *
 * オーナー報告:「今自動巡回してるけど UI 止まって見えるね。巡回中は一旦クリックできないように
 * しないとバグるよ。んで巡回中は他の取得は触れないようにしよう」。
 *
 * 取得はどれも同じ門番 (trade2/gate.rs) を通るので、巡回中に別の画面から取得を押しても
 * 順番待ちに並ぶだけで、押した側は何も起きていないように見える (これが「止まって見える」)。
 * ボタンを押せなくして、代わりに**何が走っているか**を画面の下に出す。
 *
 * 見ているのは 3 つ:
 *   - 自動巡回   … market_flow_status.auto_sampling (Rust の周期巡回 / 取りこぼしの取り直し)
 *   - 一括取得   … market_flow_status.manual_sampling (画面のボタン)
 *   - 追加時取得 … sampleBusy (監視に足した直後の 3 条件)
 *
 * 結果は 2 か所に流す:
 *   - noteSweepBusy() … 取得ボタン共通の refetchState() が読む (押せなくする)
 *   - ここの computed … 画面下の帯 (FetchBusyBar.vue) が読む
 *
 * 見張りは起動時に 1 回だけ始める (どの画面を開いていても帯を出すため)。
 * 走っていない間は 8 秒おきなので、ファイル読みだけで通信はしない。
 */
import { computed, ref, watch } from "vue";
import { loadFlowStatus, type FlowStatus } from "../services/market-flow";
import { noteSweepBusy } from "../services/trade2/auto-price";
import { sampleBusy, sampleQueued, sampleTarget } from "../views/gem-corrupt/sample-now";
import { jaSkill } from "../i18n/skills-ja";
import { isTauriRuntime } from "../utils/isTauriRuntime";
import { noteBackgroundTrade, tradeOwner } from "./trade-lock";

/** 走っている時の見直し間隔 (進捗を出すので短め) */
const BUSY_MS = 2000;
/** 走っていない時の見直し間隔 */
const IDLE_MS = 8000;

const status = ref<FlowStatus | null>(null);
let started = false;

async function tick(): Promise<void> {
  try {
    status.value = await loadFlowStatus();
  } catch {
    // 読めない時は前の値を捨てる。取れない状態でボタンを押せないままにしない
    status.value = null;
  }
  // 画面の機能が取引所を使っている間も短く (枠待ちのタイマーを出すため)
  setTimeout(() => void tick(), status.value?.sampling || tradeOwner.value ? BUSY_MS : IDLE_MS);
}

/** 今どこかで取得が走っているか */
export const fetchBusy = computed(() => !!status.value?.sampling || sampleBusy.value);
/** 一括取得 (画面のボタン) が走っているか */
export const manualSweeping = computed(() => !!status.value?.manual_sampling);
/**
 * 最新の巡回状態。自分でも見張っている画面 (自動ジェム監視) は、こちらの方が新しいので
 * 手元の値をこれに合わせる (2026-09-20: 中止を押しても画面が 20 秒「取得中」のままだった)。
 */
export const flowBusyStatus = computed(() => status.value);

/** 何が走っているか (「自動巡回」「一括取得」「追加取得」) */
export const fetchBusyKind = computed(() => {
  if (sampleBusy.value) return "追加取得";
  if (status.value?.manual_sampling) return "一括取得";
  if (status.value?.auto_sampling) return "自動巡回";
  return "";
});

/** ボタンに出す短い一言 (押せない理由)。空なら押せる */
export const fetchBusyLabel = computed(() => {
  const kind = fetchBusyKind.value;
  if (!kind) return "";
  const st = status.value;
  const n = !sampleBusy.value && st && st.total > 0 ? ` ${st.done}/${st.total}` : "";
  return `${kind}中${n}`;
});

/** 画面下の帯に出す説明 */
export const fetchBusyText = computed(() => {
  if (sampleBusy.value) {
    const q = sampleQueued.value > 0 ? ` (あと ${sampleQueued.value} 件)` : "";
    return `監視に足した ${jaSkill(sampleTarget.value)} を取得しています${q}`;
  }
  const st = status.value;
  if (!st?.sampling) return "";
  const kind = st.manual_sampling ? "一括取得" : "自動巡回";
  const n = st.total > 0 ? ` ${st.done}/${st.total} 銘柄` : "";
  const cur = st.current ? ` · ${st.current}` : "";
  const pace = st.pace_secs > 0 ? ` · ${st.pace_secs} 秒おき` : "";
  return `${kind}${n}${pace}${cur}`;
});

/** レート制限で止まっている残り秒 (帯に出す。0 なら止まっていない) */
export const fetchBusyStopped = computed(() => {
  const until = status.value?.retry_until ?? 0;
  return until > 0 ? Math.max(0, until - Math.floor(Date.now() / 1000)) : 0;
});

/** 枠の長さ (秒) → 「10 秒」「5 分」「3 時間」 */
function periodJa(sec: number): string {
  if (sec >= 3600) return `${Math.round(sec / 3600)} 時間`;
  if (sec >= 60) return `${Math.round(sec / 60)} 分`;
  return `${sec} 秒`;
}
/** 1 秒ごとに数え直す時計 (タイマーの残り秒) */
const nowSec = ref(Math.floor(Date.now() / 1000));
setInterval(() => (nowSec.value = Math.floor(Date.now() / 1000)), 1000);

/**
 * 枠の 8 割で待っている時のタイマー (2026-09-27 オーナー「8 割レート制限に使ってる奴あったら回復まで待たせる感じでタイマーセット」)。
 * 待っていなければ ""
 */
export const tradeWaitText = computed(() => {
  const st = status.value;
  if (!st) return "";
  const left = (st.wait_until ?? 0) - nowSec.value;
  if (left <= 0 || !st.wait_why || st.wait_why === "none") return "";
  const p = periodJa(st.wait_period ?? 0);
  return st.wait_why === "reset"
    ? `${p}の枠を 8 割使ったので、空になるまで あと ${left} 秒`
    : `${p}の枠が 8 割に近いので、この取得の分が空くまで あと ${left} 秒`;
});

/** 起動時に 1 回だけ。取得の状態を見張り始める */
export function startFetchBusyWatch(): void {
  if (started || !isTauriRuntime()) return;
  started = true;
  // 取得ボタン共通の判定 (refetchState) にも同じ状態を渡す
  watch(fetchBusyLabel, (v) => noteSweepBusy(v), { immediate: true });
  // 裏の取得 (巡回・一括取得・監視に足した直後) も「取引所を使用中」(使えるのは 1 つだけ。2026-09-27)
  watch(fetchBusyKind, (v) => noteBackgroundTrade(v ? `自動ジェム監視 (${v})` : ""), { immediate: true });
  void tick();
}
