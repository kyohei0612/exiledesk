/**
 * 取引履歴の状態と取得 (ログイン状態 / ゲーム・リーグの選択 / 保存分の読み込み / 取得と自動更新 / 残り回数)
 *
 * TradeHistory.vue から切り出し (2026-09-26)。画面のライフサイクル (mount / activated / unmount) もここで張る。
 */
import { computed, onActivated, onMounted, onUnmounted, ref, watch } from "vue";
import { askConfirm } from "../../state/confirm-dialog";
import { markSessionExpired, refreshSession as refreshGlobalSession } from "../../state/poe-session";
import { fetchBusyLabel } from "../../state/fetch-busy";
import { marketStore } from "../../state/market-store";
import { fetchLeagueStartEpoch } from "../../api/poe2scout";
import { isTauriRuntime } from "../../utils/isTauriRuntime";
import { waitText } from "../../utils/wait-text";
import {
  fetchAndMerge,
  historyBudget,
  loadStored,
  logout,
  onLoginClosed,
  openLogin,
  tradeLeagues,
  type Game,
  type TradeEntry,
} from "../../services/trade-history";

export function useTradeSession() {
  const inApp = isTauriRuntime();

  const GAME_KEY = "exiledesk.trade-history.game";
  const game = ref<Game>(((): Game => {
    try {
      return localStorage.getItem(GAME_KEY) === "poe1" ? "poe1" : "poe2";
    } catch {
      return "poe2";
    }
  })());
  const league = ref("");
  const leagues = ref<string[]>([]);
  const loggedIn = ref<boolean | null>(null);
  const busy = ref(false);
  const message = ref<{ ok: boolean; text: string } | null>(null);
  const entries = ref<TradeEntry[]>([]);
  const lastFetchAt = ref(0);
  const nextAllowedAt = ref(0);
  const now = ref(Date.now());
  /** このリーグの開始時刻 (ms)。「全部」のグラフの左端に使う。取れなければ一番古い記録から */
  const leagueStartMs = ref<number | null>(null);

  const LEAGUE_START_KEY = (l: string): string => `exiledesk.trade-history.leagueStart.${l}`;
  /** リーグ開始は変わらないので 1 度取ったら保存して使い回す (poe2scout の一番古いスナップショット) */
  async function loadLeagueStart(): Promise<void> {
    leagueStartMs.value = null;
    const l = league.value;
    if (!l || game.value !== "poe2") return;
    try {
      const cached = localStorage.getItem(LEAGUE_START_KEY(l));
      if (cached) {
        leagueStartMs.value = Number(cached);
        return;
      }
    } catch {
      /* 読めなくても取り直せる */
    }
    const ep = await fetchLeagueStartEpoch(l);
    if (ep == null || league.value !== l) return;
    leagueStartMs.value = ep * 1000;
    try {
      localStorage.setItem(LEAGUE_START_KEY(l), String(ep * 1000));
    } catch {
      /* 保存できなくても表示は出る */
    }
  }

  function reloadStored(): void {
    if (!league.value) {
      entries.value = [];
      return;
    }
    const s = loadStored(game.value, league.value);
    entries.value = s.entries;
    lastFetchAt.value = s.lastFetchAt;
    nextAllowedAt.value = s.nextAllowedAt;
  }

  async function refreshSession(): Promise<void> {
    // アプリ全体のログイン状態と同じ物を見る (ログアウトしたらログインの画面を出す。ログイン必須 2026-09-24)。
    // 2026-09-26: 別々に見ていたので、サイトに断られても この画面だけ ログイン済み のままだった
    try {
      loggedIn.value = await refreshGlobalSession();
    } catch (e) {
      loggedIn.value = false;
      message.value = { ok: false, text: e instanceof Error ? e.message : String(e) };
    }
  }

  async function loadLeagues(): Promise<void> {
    try {
      leagues.value = await tradeLeagues(game.value);
    } catch (e) {
      leagues.value = [];
      message.value = { ok: false, text: e instanceof Error ? e.message : String(e) };
    }
    const saved = (() => {
      try {
        return localStorage.getItem(`exiledesk.trade-history.league.${game.value}`) ?? "";
      } catch {
        return "";
      }
    })();
    const current = game.value === "poe2" ? (marketStore.league.value?.Value ?? "") : "";
    const pick = [saved, current].find((l) => l && leagues.value.includes(l)) ?? leagues.value[0] ?? saved;
    league.value = pick;
    reloadStored();
  }

  watch(game, (g) => {
    try {
      localStorage.setItem(GAME_KEY, g);
    } catch {
      /* 保存できなくても動く */
    }
    message.value = null;
    void loadLeagues();
  });
  watch(league, (l) => {
    try {
      if (l) localStorage.setItem(`exiledesk.trade-history.league.${game.value}`, l);
    } catch {
      /* 保存できなくても動く */
    }
    reloadStored();
    void loadLeagueStart();
  });

  async function login(): Promise<void> {
    message.value = null;
    try {
      await openLogin();
    } catch (e) {
      message.value = { ok: false, text: e instanceof Error ? e.message : String(e) };
    }
  }
  async function doLogout(): Promise<void> {
    const ok = await askConfirm("ExileDesk 内の pathofexile.com のログインを消します。取った履歴はこの PC に残ります。", {
      title: "ログインを消す",
      okLabel: "ログアウト",
      danger: true,
    });
    if (!ok) return;
    try {
      await logout();
    } finally {
      await refreshSession();
    }
  }
  async function fetchNow(): Promise<void> {
    if (busy.value || !league.value) return;
    busy.value = true;
    message.value = null;
    try {
      const r = await fetchAndMerge(game.value, league.value);
      message.value = { ok: r.ok, text: r.message };
      reloadStored();
      if (r.expired) {
        markSessionExpired();
        loggedIn.value = false;
      } else if (!r.ok) await refreshSession();
    } finally {
      busy.value = false;
    }
  }
  /**
   * タブを開いた時の自動更新 (オーナー指示 2026-09-17)。
   *
   * サーバーの制限とは別に、アプリ内でも前回取得から 5 分空ける。
   * タブを行き来するだけで取得枠 (1 分 5 回 / 10 分 10 回 / 3 時間 15 回) を
   * 食い潰さないようにするため。手動の「履歴を取得」はこの 5 分を待たずに押せる。
   */
  const AUTO_MIN_GAP_MS = 5 * 60_000;
  /** 自動更新を見送った理由 (画面に出す) */
  const autoNote = ref("");

  async function maybeAutoFetch(): Promise<void> {
    if (!inApp || !loggedIn.value || !league.value || busy.value) return;
    const nowMs = Date.now();
    const allowedAt = historyBudget(game.value, league.value).allowedAt;
    if (nowMs < allowedAt) {
      autoNote.value = `自動更新は見送り (制限中 · あと ${waitText(Math.ceil((allowedAt - nowMs) / 1000))})`;
      return;
    }
    if (lastFetchAt.value && nowMs - lastFetchAt.value < AUTO_MIN_GAP_MS) {
      autoNote.value = `自動更新は見送り (前回取得から ${waitText(Math.ceil((nowMs - lastFetchAt.value) / 1000))})`;
      return;
    }
    autoNote.value = "";
    await fetchNow();
  }

  /** 残り回数と次に取れる時刻 (now を見て毎秒引き直す) */
  const budget = computed(() => {
    void now.value;
    void lastFetchAt.value;
    return league.value ? historyBudget(game.value, league.value) : null;
  });
  const waitSec = computed(() => Math.max(0, Math.ceil(((budget.value?.allowedAt ?? 0) - now.value) / 1000)));
  const usageText = computed(() => (budget.value?.usage ?? []).map((u) => `${u.label} ${u.used}/${u.max}`).join(" · "));
  const fetchLabel = computed(() => {
    if (busy.value) return "取得中…";
    // 履歴も同じ門番 (trade2) を通るので、巡回中は押しても順番待ちに並ぶだけ
    // (オーナー指示 2026-09-20:「巡回中は他の取得は触れないようにしよう」)
    if (fetchBusyLabel.value) return fetchBusyLabel.value;
    if (waitSec.value > 0) return `次の取得まで ${Math.floor(waitSec.value / 60)}:${String(waitSec.value % 60).padStart(2, "0")}`;
    return "履歴を取得";
  });

  let timer: ReturnType<typeof setInterval> | null = null;
  let unlisten: (() => void) | null = null;
  onMounted(async () => {
    timer = setInterval(() => (now.value = Date.now()), 1000);
    void marketStore.ensureMarket();
    if (!inApp) {
      // アプリ外 (ブラウザ) では取得できないが、保存済みの履歴は見られるように前回のリーグを読む
      loggedIn.value = false;
      try {
        league.value = localStorage.getItem(`exiledesk.trade-history.league.${game.value}`) ?? "";
      } catch {
        /* 読めなければ空のまま */
      }
      return;
    }
    unlisten = await onLoginClosed(() => void refreshSession());
    await refreshSession();
    await loadLeagues();
    await maybeAutoFetch();
  });
  // keep-alive なのでタブを開き直しても mount されない。開いた時にここで更新する
  onActivated(() => {
    void maybeAutoFetch();
  });
  onUnmounted(() => {
    if (timer) clearInterval(timer);
    unlisten?.();
  });

  return {
    inApp,
    game,
    league,
    leagues,
    loggedIn,
    busy,
    message,
    entries,
    lastFetchAt,
    nextAllowedAt,
    now,
    leagueStartMs,
    refreshSession,
    login,
    doLogout,
    fetchNow,
    autoNote,
    budget,
    waitSec,
    usageText,
    fetchLabel,
  };
}
