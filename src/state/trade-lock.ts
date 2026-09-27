/**
 * trade-lock.ts — 取引所 (trade2) を使えるのは 1 つの機能だけ (2026-09-27)
 *
 * オーナー:「トレード使えるのは 1 タブだけね。1 タブどっかでトレード取得に動いてたら、他のタブは使えないようにして。
 * んで使ってたら中止ボタン、動いてたやつは再開ボタン、それぞれ自動取得するボタンに入れてくれ」
 * 「管理は信号の数」「それぞれ取得ボタンの信号の数違うから一括一緒にしたらダメ」。
 *   - begin(id) … 使い始める。他が使っていれば false (押せない)。Rust にも知らせ、自動の巡回はその間始めない
 *   - reserve(id, 検索, 取得) … その取得で使う信号の数を渡し、どの枠でも 8 割を超えない所まで門番で待つ (trade2_reserve)
 *   - stop(id) … 中止。待っている予約を止め、機能の止め方 (begin で渡す) を呼び、「再開」にする
 *   - end(id) … 終わった
 * 自動ジェム監視の巡回・一括取得・監視に足した直後の取得は fetch-busy.ts の状態 (fetchBusyKind) を「使用中」とみなす。
 */
import { computed, reactive, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../utils/isTauriRuntime";
import { refetchState } from "../services/trade2/auto-price";

export type TradeUser = "build-copy" | "craft" | "gem-corrupt" | "overquality" | "rare-craft";
export const TRADE_USER_JA: Record<TradeUser, string> = {
  "build-copy": "忍者ビルドコピー",
  craft: "クラフト計算機",
  "gem-corrupt": "ジェムコラプトの賭け",
  overquality: "アドニアの賭け",
  "rare-craft": "規格外の賭け",
};

const owner = ref<TradeUser | null>(null);
/** 中止した / 他が使っていて始められなかった機能 (ボタンを「再開」にする) */
const paused = reactive(new Set<TradeUser>());
const stoppers = new Map<TradeUser, () => void>();
/** 裏で動く取得 (自動巡回・一括取得・監視に足した直後) の名前。fetch-busy.ts が入れる */
const background = ref("");

/** 今取引所を使っている物の名前 (無ければ "") */
export const tradeUserLabel = computed(() => (owner.value ? TRADE_USER_JA[owner.value] : background.value));
export const tradeOwner = computed(() => owner.value);

export function noteBackgroundTrade(label: string): void {
  background.value = label;
}

async function tellRust(busy: boolean): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await invoke("trade2_set_ui_busy", { busy });
  } catch {
    /* 古い本体でも止めない */
  }
}

export const tradeLock = {
  /** 他の機能が使っているか (その名前)。自分なら "" */
  busyOther(id: TradeUser): string {
    if (owner.value && owner.value !== id) return TRADE_USER_JA[owner.value];
    if (!owner.value && background.value) return background.value;
    return "";
  },
  isMine(id: TradeUser): boolean {
    return owner.value === id;
  },
  isPaused(id: TradeUser): boolean {
    return paused.has(id);
  },
  /** 使い始める。他が使っていれば false (再開待ちにする) */
  begin(id: TradeUser, stop?: () => void): boolean {
    if (tradeLock.busyOther(id)) {
      paused.add(id);
      return false;
    }
    owner.value = id;
    paused.delete(id);
    if (stop) stoppers.set(id, stop);
    void tellRust(true);
    return true;
  },
  /** 終わった (自分の物だけ外す) */
  end(id: TradeUser): void {
    stoppers.delete(id);
    if (owner.value !== id) return;
    owner.value = null;
    void tellRust(false);
  },
  /** 中止: 待っている予約を止め、機能の止め方を呼んで、「再開」にする */
  stop(id: TradeUser): void {
    if (isTauriRuntime()) void invoke("trade2_reserve_cancel").catch(() => undefined);
    const s = stoppers.get(id);
    tradeLock.end(id);
    paused.add(id);
    s?.();
  },
  /** 再開を押した / 取り直しが要らなくなった */
  clearPaused(id: TradeUser): void {
    paused.delete(id);
  },
  /**
   * その取得で使う信号の数 (検索 / 取得) で、枠の空きを待つ。待てた (送ってよい) なら true。
   * 中止されたか、長すぎる (15 分) なら false
   */
  async reserve(id: TradeUser, searches: number, fetches = searches): Promise<boolean> {
    if (owner.value !== id) return false;
    if (!isTauriRuntime()) return true;
    try {
      await invoke("trade2_reserve", { searches, fetches, maxWaitMs: 15 * 60_000 });
      return owner.value === id;
    } catch {
      return false;
    }
  },
};

/**
 * 取得ボタンの見た目。自分が使用中なら「中止」、中止した物は「再開」、他が使用中なら押せない (その名前)。
 * action は押した時にすること
 */
export function tradeButton(id: TradeUser, idleLabel: string): { label: string; disabled: boolean; action: "start" | "stop" | "resume" } {
  if (tradeLock.isMine(id)) return { label: "中止", disabled: false, action: "stop" };
  const other = tradeLock.busyOther(id);
  if (other) return { label: `${other}が取引所を使用中`, disabled: true, action: "start" };
  if (tradeLock.isPaused(id)) return { label: `再開 (${idleLabel})`, disabled: false, action: "resume" };
  return { label: idleLabel, disabled: false, action: "start" };
}

/**
 * 今までの取得ボタン (refetchState: 5 分の使用数・待ち秒を出す) に、使用権を足した版。
 * 自分が取得中 = 「中止」、中止した = 「再開」、他の機能が使用中 = 押せない
 */
export function tradeRefetch(id: TradeUser, busy: boolean, idleLabel: string): { label: string; disabled: boolean; action: "start" | "stop" | "resume" } {
  if (tradeLock.isMine(id) || busy) return { label: "中止", disabled: false, action: "stop" };
  const other = tradeLock.busyOther(id);
  if (other) return { label: `${other}が取引所を使用中`, disabled: true, action: "start" };
  const base = refetchState(false, idleLabel);
  if (tradeLock.isPaused(id)) return { label: `再開 (${idleLabel})`, disabled: base.disabled, action: "resume" };
  return { ...base, action: "start" };
}
