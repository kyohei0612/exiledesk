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
 *
 * 2026-09-28 オーナー「今どこで止まってどこで動いてるのかもっと細かく見た方が良い」: 出入りを全部 exiledesk.log に書く
 * ([画面] [使用権] …)。本体側の予約・門番・巡回も同じファイルに書くので、1 本の時系列で追える。
 */
import { computed, reactive, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../utils/isTauriRuntime";
import { refetchState } from "../services/trade2/auto-price";

export type TradeUser = "build-copy" | "craft" | "gem-corrupt" | "overquality" | "rare-craft" | "unique-fav";
export const TRADE_USER_JA: Record<TradeUser, string> = {
  "build-copy": "忍者ビルドコピー",
  craft: "クラフト計算機",
  "gem-corrupt": "ジェムコラプトの賭け",
  overquality: "アドニアの賭け",
  "rare-craft": "規格外の賭け",
  "unique-fav": "ユニークのお気に入りの記録",
};

const owner = ref<TradeUser | null>(null);
/**
 * 掴むたびに振る番号。終わる時は自分の番号の時だけ外す (2026-09-28: 中止した古い取得が通信を終えた時に、
 * 後から始めた新しい取得の使用権まで外していた → 動いているのに「空き」になり、他のタブも同時に使えた)
 */
let seq = 0;
let ownerTicket = 0;
/** 中止した / 他が使っていて始められなかった機能 (ボタンを「再開」にする) */
const paused = reactive(new Set<TradeUser>());
const stoppers = new Map<TradeUser, () => void>();
/** 裏で動く取得 (自動巡回・一括取得・監視に足した直後) の名前。fetch-busy.ts が入れる */
const background = ref("");

/** 今取引所を使っている物の名前 (無ければ "") */
export const tradeUserLabel = computed(() => (owner.value ? TRADE_USER_JA[owner.value] : background.value));
export const tradeOwner = computed(() => owner.value);

export function noteBackgroundTrade(label: string): void {
  if (background.value !== label) tradeTrace(label ? `裏の取得が使い始めた: ${label}` : `裏の取得が終わった: ${background.value}`);
  background.value = label;
}

/** exiledesk.log に 1 行 (本体の古い版・ブラウザでは何もしない) */
export function tradeTrace(msg: string): void {
  if (!isTauriRuntime()) return;
  void invoke("app_log_write", { msg: `[使用権] ${msg}` }).catch(() => undefined);
}
const who = (): string => (owner.value ? TRADE_USER_JA[owner.value] : background.value ? `裏: ${background.value}` : "空き");

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
  begin(id: TradeUser, stop?: () => void, why = ""): boolean {
    const other = tradeLock.busyOther(id);
    if (other) {
      paused.add(id);
      tradeTrace(`${TRADE_USER_JA[id]}: 始められない (${other} が使用中) → 再開待ち${why ? ` [${why}]` : ""}`);
      return false;
    }
    owner.value = id;
    ownerTicket = ++seq;
    tradeTrace(`${TRADE_USER_JA[id]}: 使い始めた (#${ownerTicket})${why ? ` [${why}]` : ""}`);
    paused.delete(id);
    if (stop) stoppers.set(id, stop);
    void tellRust(true);
    return true;
  },
  /** 今の使用権の番号 (begin の直後に取って、end に渡す) */
  ticket(): number {
    return ownerTicket;
  },
  /** 終わった (自分の物だけ外す)。ticket を渡すと、その番号の時だけ外す (古い取得の終わりで新しい方を外さない) */
  end(id: TradeUser, ticket?: number): void {
    if (ticket !== undefined && owner.value === id && ticket !== ownerTicket) {
      tradeTrace(`${TRADE_USER_JA[id]}: 古い取得 (#${ticket}) が終わった。今の取得 (#${ownerTicket}) が使っているので外さない`);
      return;
    }
    stoppers.delete(id);
    if (owner.value !== id) {
      tradeTrace(`${TRADE_USER_JA[id]}: 終わった (持ち主ではないので何もしない。今は ${who()})`);
      return;
    }
    tradeTrace(`${TRADE_USER_JA[id]}: 終わって離した (#${ownerTicket})`);
    owner.value = null;
    void tellRust(false);
  },
  /** 中止: 待っている予約を止め、機能の止め方を呼んで、「再開」にする */
  stop(id: TradeUser): void {
    tradeTrace(`${TRADE_USER_JA[id]}: 中止を押された (今は ${who()})`);
    if (isTauriRuntime()) void invoke("trade2_reserve_cancel").catch(() => undefined);
    const s = stoppers.get(id);
    tradeLock.end(id);
    paused.add(id);
    s?.();
  },
  /** 再開を押した / 取り直しが要らなくなった */
  clearPaused(id: TradeUser): void {
    if (paused.has(id)) tradeTrace(`${TRADE_USER_JA[id]}: 再開待ちを外した`);
    paused.delete(id);
  },
  /**
   * その取得で使う信号の数 (検索 / 取得) で、枠の空きを待つ。待てた (送ってよい) なら true。
   * 中止されたか、長すぎる (15 分) なら false
   */
  async reserve(id: TradeUser, searches: number, fetches = searches): Promise<boolean> {
    if (owner.value !== id) {
      tradeTrace(`${TRADE_USER_JA[id]}: 予約しない (持ち主ではない。今は ${who()})`);
      return false;
    }
    if (!isTauriRuntime()) return true;
    tradeTrace(`${TRADE_USER_JA[id]}: 予約 検索 ${searches} / 取得 ${fetches} 本`);
    try {
      await invoke("trade2_reserve", { searches, fetches, maxWaitMs: 15 * 60_000 });
      const ok = owner.value === id;
      if (!ok) tradeTrace(`${TRADE_USER_JA[id]}: 予約は通ったが、待つ間に持ち主が変わった (今は ${who()}) → 始めない`);
      return ok;
    } catch (e) {
      tradeTrace(`${TRADE_USER_JA[id]}: 予約できず始めない (${String(e)})`);
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
