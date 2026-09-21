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
  setTimeout(() => void tick(), status.value?.sampling ? BUSY_MS : IDLE_MS);
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

/** 起動時に 1 回だけ。取得の状態を見張り始める */
export function startFetchBusyWatch(): void {
  if (started || !isTauriRuntime()) return;
  started = true;
  // 取得ボタン共通の判定 (refetchState) にも同じ状態を渡す
  watch(fetchBusyLabel, (v) => noteSweepBusy(v), { immediate: true });
  void tick();
}
