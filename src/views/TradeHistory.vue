<!--
  TradeHistory.vue — 取引履歴 (マーチャント履歴) の連動 (2026-09-16)
  アプリ内のウィンドウで pathofexile.com にログイン → サイトと同じ履歴 API で「いつ・何が・いくらで売れたか」を読む。
  取れた分はこの PC に足していく (API は直近分しか返さない)。取得の間隔はサーバーの残り回数に合わせる (上限の 1 回手前で止める)。
  アイテム名は表示時にクライアントの日本語へ変換する (保存は英語名のまま)。
    services/trade-history.ts   Tauri ラッパ / 解析 / 蓄積
    src-tauri/src/trade_history.rs  ログイン用ウィンドウ / cookie / 履歴 API
-->
<script setup lang="ts">
import { computed, onActivated, onMounted, onUnmounted, ref, watch } from "vue";
import CurrencyPicker from "../components/vaal-scales/CurrencyPicker.vue";
import { displayCurrency } from "../state/display-currency";
import { marketStore } from "../state/market-store";
import { fetchLeagueStartEpoch } from "../api/poe2scout";
import { toExalted } from "../services/trade2/pricing";
import { isTauriRuntime } from "../utils/isTauriRuntime";
import { waitText } from "../utils/wait-text";
import { jaTypeName, jaUniqueName } from "../services/trade2/localize";
import {
  fetchAndMerge,
  historyBudget,
  loadStored,
  logout,
  onLoginClosed,
  openLogin,
  sessionLoggedIn,
  tradeLeagues,
  type Game,
  type TradeEntry,
} from "../services/trade-history";

const money = (n: number | null | undefined): string => displayCurrency.money(n);
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
  try {
    loggedIn.value = await sessionLoggedIn();
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
  if (!window.confirm("ExileDesk 内の pathofexile.com のログインを消します。取った履歴はこの PC に残ります。よろしいですか?")) return;
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
    if (!r.ok) await refreshSession();
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
  if (waitSec.value > 0) return `次の取得まで ${Math.floor(waitSec.value / 60)}:${String(waitSec.value % 60).padStart(2, "0")}`;
  return "履歴を取得";
});
/** クライアントと同じ日本語名 (ユニーク名とベース名を別々に引く) */
const jaName = (e: TradeEntry): string => (e.name ? jaUniqueName(e.name) : "");
const jaType = (e: TradeEntry): string => (e.typeLine ? jaTypeName(e.typeLine) : "");

// ---- 絞り込みと集計 (2026-09-16: 時間の引き算ではなく日付で仕分ける) ----
const DAY_MS = 86_400_000;
// オーナー指示 (2026-09-16): 当日は 7 日間の日付チップで選べるので不要
const PERIODS = [
  { id: "7d", label: "7 日間", days: 7 },
  { id: "all", label: "全部", days: 0 },
] as const;
type PeriodId = (typeof PERIODS)[number]["id"];
const period = ref<PeriodId>("7d");
const search = ref("");

const pad2 = (n: number): string => String(n).padStart(2, "0");
/** その日の 0:00 (ローカル) */
function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
const dayKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const WEEK_JA = ["日", "月", "火", "水", "木", "金", "土"];
/** "9/16 (火)" */
function dayLabel(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEK_JA[d.getDay()]})`;
}
/** 今日の 0:00 (now を見て日付が変わったら自動で切り替わる) */
const todayStart = computed(() => startOfDay(now.value));
/** 選択中の期間の開始時刻 (全部は 0) */
const since = computed(() => {
  const p = PERIODS.find((x) => x.id === period.value);
  if (!p || p.days <= 0) return 0;
  return todayStart.value - (p.days - 1) * DAY_MS;
});
/** 7 日間モードで見ている日 (0 = 今日)。オーナー指示 2026-09-16: 7 日間は日付を選んで時間帯で見る */
const selectedDay = ref<number>(0);
const activeDay = computed(() => (selectedDay.value ? startOfDay(selectedDay.value) : todayStart.value));

/** 検索だけ掛けた分 (期間の集計に使う) */
const searched = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return entries.value;
  // 検索は日本語名と英語名のどちらでも引っかかるように
  return entries.value.filter((e) => `${e.name} ${e.typeLine} ${jaName(e)} ${jaType(e)}`.toLowerCase().includes(q));
});
const visible = computed(() => {
  // 7 日間は「選んだ 1 日」だけを出す (日付ごとに見たい、というオーナー指示)
  if (period.value === "7d") {
    const from = activeDay.value;
    const to = from + DAY_MS;
    return searched.value.filter((e) => e.time >= from && e.time < to);
  }
  return searched.value.filter((e) => e.time >= since.value);
});

/** 7 日間の日付チップ (古い → 新しい)。その日の合計と件数つき */
const days7 = computed(() => {
  const out: { start: number; label: string; total: number; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const start = todayStart.value - i * DAY_MS;
    const to = start + DAY_MS;
    let total = 0;
    let count = 0;
    for (const e of searched.value) {
      if (e.time < start || e.time >= to) continue;
      total += valueOf(e);
      count++;
    }
    out.push({ start, label: dayLabel(start), total, count });
  }
  return out;
});
/** PoE2 の通貨だけ高貴に換算できる (換算レートは PoE2 の相場) */
function exaltedOf(e: TradeEntry): number | null {
  if (game.value !== "poe2" || e.amount == null || !e.currency) return null;
  return toExalted(e.amount, e.currency, marketStore.rates.value);
}
const totals = computed(() => {
  const byCurrency = new Map<string, number>();
  let exalted = 0;
  let unconverted = 0;
  for (const e of visible.value) {
    if (e.amount == null || !e.currency) continue;
    byCurrency.set(e.currency, (byCurrency.get(e.currency) ?? 0) + e.amount);
    const ex = exaltedOf(e);
    if (ex == null) unconverted++;
    else exalted += ex;
  }
  return { byCurrency: [...byCurrency.entries()].sort((a, b) => b[1] - a[1]), exalted, unconverted };
});

/** 1 件の売上 (グラフと日別合計に使う値)。PoE2 は高貴換算、PoE1 は換算できないので 0 */
const valueOf = (e: TradeEntry): number => exaltedOf(e) ?? 0;

/** 期間の見出しに出すまとめ (当日 / 7 日間 / 全部 は常に出す) */
const summary = computed(() => {
  const sum = (from: number): { total: number; count: number } => {
    let total = 0;
    let count = 0;
    for (const e of searched.value) {
      if (e.time < from) continue;
      total += valueOf(e);
      count++;
    }
    return { total, count };
  };
  return {
    week: sum(todayStart.value - 6 * DAY_MS),
    all: sum(0),
  };
});

/** 「全部」の左端。リーグ開始が取れればそれ、駄目なら一番古い記録 (どちらも無ければ今日) */
const allStartMs = computed<number>(() => {
  if (leagueStartMs.value) return leagueStartMs.value;
  let oldest = Number.POSITIVE_INFINITY;
  for (const e of entries.value) oldest = Math.min(oldest, e.time);
  return Number.isFinite(oldest) ? oldest : todayStart.value;
});

/** グラフの棒。当日は時間別 (0-23 時)、それ以外は日別 */
interface Bar {
  key: string;
  label: string;
  sub: string;
  value: number;
  count: number;
  today: boolean;
}
const bars = computed<Bar[]>(() => {
  const out: Bar[] = [];
  // 当日 / 7 日間 (選んだ日) は時間別、全部だけ日別
  if (period.value === "7d") {
    const base = activeDay.value;
    const byHour = new Array(24).fill(0).map(() => ({ v: 0, c: 0 }));
    for (const e of searched.value) {
      if (e.time < base || e.time >= base + DAY_MS) continue;
      const h = new Date(e.time).getHours();
      byHour[h].v += valueOf(e);
      byHour[h].c++;
    }
    // 今日は「今の時間」まで、過去の日は 24 時間ぶん
    const isToday = base === todayStart.value;
    const lastHour = isToday ? new Date(now.value).getHours() : 23;
    for (let h = 0; h <= lastHour; h++) {
      out.push({ key: `h${h}`, label: `${h}`, sub: `${h}:00`, value: byHour[h].v, count: byHour[h].c, today: isToday && h === lastHour });
    }
    return out;
  }
  // 日別: 売れた日を拾い、7 日間は売れていない日も 0 で並べる
  const byDay = new Map<string, { v: number; c: number; start: number }>();
  for (const e of searched.value) {
    if (e.time < since.value) continue;
    const k = dayKey(e.time);
    const b = byDay.get(k) ?? { v: 0, c: 0, start: startOfDay(e.time) };
    b.v += valueOf(e);
    b.c++;
    byDay.set(k, b);
  }
  // 「全部」= リーグ開始から今日まで 1 日ずつ (売れていない日も 0 で並べる)
  let first = startOfDay(allStartMs.value);
  const days = Math.floor((todayStart.value - first) / DAY_MS);
  if (days > 400) first = todayStart.value - 400 * DAY_MS; // 保険 (リーグ開始が取れないほど古い時)
  for (let t = first; t <= todayStart.value; t += DAY_MS) {
    const start = startOfDay(t); // 夏時間などでずれても日付境界に戻す
    const b = byDay.get(dayKey(start));
    out.push({
      key: dayKey(start),
      label: `${new Date(start).getMonth() + 1}/${new Date(start).getDate()}`,
      sub: dayLabel(start),
      value: b?.v ?? 0,
      count: b?.c ?? 0,
      today: start === todayStart.value,
    });
  }
  return out;
});
const barMax = computed(() => Math.max(1, ...bars.value.map((b) => b.value)));
/** 棒が多い時はラベルを間引く (全部で 30 日を超えるとき) */
const labelEvery = computed(() => (bars.value.length > 24 ? Math.ceil(bars.value.length / 12) : 1));

/** 一覧は日付ごとにまとめる (新しい日が上) */
const dayGroups = computed(() => {
  const map = new Map<string, { start: number; list: TradeEntry[]; total: number }>();
  for (const e of visible.value) {
    const k = dayKey(e.time);
    const g = map.get(k) ?? { start: startOfDay(e.time), list: [], total: 0 };
    g.list.push(e);
    g.total += valueOf(e);
    map.set(k, g);
  }
  const out = [...map.values()].sort((a, b) => b.start - a.start);
  for (const g of out) g.list.sort((a, b) => b.time - a.time);
  return out;
});

const CURRENCY_JA: Record<string, string> = { exalted: "高貴", divine: "神", chaos: "カオス" };
const curLabel = (c: string | null): string => (c ? (CURRENCY_JA[c] ?? c) : "");
const fmtAmount = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));
function fmtTime(ms: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
/** 日付ごとにまとめた一覧では時刻だけ出す */
function fmtHM(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function rarityClass(r: string): string {
  switch (r) {
    case "Unique":
      return "text-amber-500";
    case "Rare":
      return "text-yellow-200";
    case "Magic":
      return "text-indigo-300";
    case "Gem":
      return "text-teal-300";
    default:
      return "";
  }
}

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
</script>

<template>
  <section class="@container min-h-full block px-6 py-4 bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)]">
    <header class="mb-3">
      <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">取引履歴</h1>
      <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">
        公式サイトのマーチャント履歴を ExileDesk に取り込みます。ログインは ExileDesk が開く pathofexile.com の画面で本人が行い、そのログイン状態で履歴を読みます。
      </p>
      <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-1">
        取引サイトの履歴 API は GGG の非公式 API です (公式の認証には取引履歴を読む権限がありません)。ログイン状態はアプリ内のブラウザにだけ残り、ExileDesk はファイルに保存しません。
        履歴の取得回数の制限はアカウント単位で、公式サイトや他のツール (PoE Overlay II など) の更新と共通です。
        サーバーが返す残り回数に合わせて、上限の 1 回手前で止めます (目安: 1 分 5 回 / 10 分 10 回 / 3 時間 15 回、超えると最長 1 時間締め出し)。
      </p>
      <div class="mt-1"><CurrencyPicker /></div>
    </header>

    <p v-if="!inApp" class="mb-3 text-[12px] text-amber-300">この画面はアプリ (ExileDesk) の中でだけ動きます。ブラウザ表示では保存済みの履歴だけ出ます。</p>

    <!-- ログインと取得 -->
    <div class="rounded-lg border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] p-3 text-[12px] mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
      <div class="flex items-center gap-2">
        <span class="text-[var(--exile-color-text-secondary)]">ログイン</span>
        <span v-if="loggedIn === null" class="text-[var(--exile-color-text-tertiary)]">確認中…</span>
        <span v-else-if="loggedIn" class="text-emerald-300">ログイン済み</span>
        <span v-else class="text-amber-300">未ログイン</span>
        <button v-if="!loggedIn" type="button" :disabled="!inApp" class="px-2 py-0.5 rounded border border-[var(--exile-color-border-brass)] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40" @click="login">pathofexile.com にログイン</button>
        <button type="button" :disabled="!inApp" class="underline text-[11px] text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)] disabled:opacity-40" @click="refreshSession">状態を確認</button>
        <button v-if="loggedIn" type="button" class="underline text-[11px] text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-accent-focus)]" @click="doLogout">ログアウト</button>
      </div>
      <label class="inline-flex items-center gap-2">
        <span class="text-[var(--exile-color-text-secondary)]">ゲーム</span>
        <select v-model="game" class="sel">
          <option value="poe2">PoE2</option>
          <option value="poe1">PoE1</option>
        </select>
      </label>
      <label class="inline-flex items-center gap-2 min-w-0">
        <span class="text-[var(--exile-color-text-secondary)]">リーグ</span>
        <select v-model="league" class="sel max-w-56">
          <option v-if="leagues.length === 0 && league" :value="league">{{ league }}</option>
          <option v-for="l in leagues" :key="l" :value="l">{{ l }}</option>
        </select>
      </label>
      <button
        type="button"
        :disabled="!inApp || !loggedIn || busy || waitSec > 0 || !league"
        class="px-3 py-1 rounded border border-[var(--exile-color-border-brass)] font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed"
        @click="fetchNow"
      >
        {{ fetchLabel }}
      </button>
      <span class="text-[11px] text-[var(--exile-color-text-tertiary)]">
        最終取得 {{ lastFetchAt ? fmtTime(lastFetchAt) : "—" }}<span v-if="usageText"> · 使った回数 {{ usageText }}</span><span v-if="autoNote"> · {{ autoNote }}</span>
      </span>
      <p v-if="message" class="basis-full text-[12px]" :class="message.ok ? 'text-emerald-300' : 'text-amber-300'">{{ message.text }}</p>
    </div>

    <!-- 売上まとめ (当日 / 7 日間 / 全部) -->
    <div v-if="game === 'poe2'" class="grid grid-cols-1 @2xl:grid-cols-2 gap-3 mb-4">
      <button
        v-for="card in [
          { id: '7d', label: '7 日間', note: `${dayLabel(todayStart - 6 * DAY_MS)} 〜 ${dayLabel(todayStart)}`, s: summary.week },
          {
            id: 'all',
            label: '全部',
            note: leagueStartMs ? `リーグ開始 ${dayLabel(leagueStartMs)} 〜` : `保存 ${entries.length} 件`,
            s: summary.all,
          },
        ]"
        :key="card.id"
        type="button"
        class="text-left rounded-lg border p-3 transition-colors"
        :class="
          period === card.id
            ? 'border-[var(--exile-color-accent-focus)] bg-[var(--exile-color-bg-elevated)]'
            : 'border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] hover:border-[var(--exile-color-border-brass)]'
        "
        @click="period = card.id as typeof period"
      >
        <div class="flex items-baseline justify-between gap-2">
          <span class="font-display tracking-[0.08em] text-[13px]" :class="period === card.id ? 'text-[var(--exile-color-accent-focus)]' : ''">{{ card.label }}</span>
          <span class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ card.note }}</span>
        </div>
        <div class="mt-1 tabular-nums text-[20px] text-emerald-300 font-display">{{ money(card.s.total) }}</div>
        <div class="text-[11px] text-[var(--exile-color-text-secondary)] tabular-nums">{{ card.s.count }} 件</div>
      </button>
    </div>

    <!-- 日別グラフ -->
    <div class="rounded-lg border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] p-3 mb-4">
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-3">
        <div class="flex items-center gap-2">
          <h2 class="font-display tracking-[0.08em] text-[13px] text-[var(--exile-color-accent-focus)]">
            {{
              period === "7d" ? `${dayLabel(activeDay)} の売上 (時間別)` : "リーグ開始からの売上 (1 日ずつ)"
            }}
          </h2>
          <div class="inline-flex rounded border border-[var(--exile-color-border-subtle)] overflow-hidden">
            <button
              v-for="p in PERIODS"
              :key="p.id"
              type="button"
              class="px-2 py-0.5 text-[11px]"
              :class="period === p.id ? 'bg-[var(--exile-color-bg-elevated)] text-[var(--exile-color-accent-focus)]' : 'text-[var(--exile-color-text-secondary)]'"
              @click="period = p.id"
            >
              {{ p.label }}
            </button>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <input v-model="search" type="text" placeholder="アイテム名で絞り込み" class="sel w-52" />
          <span class="text-[11px] text-[var(--exile-color-text-secondary)] tabular-nums">{{ visible.length }} 件</span>
        </div>
      </div>
      <!-- 7 日間: 日付を選ぶ (その日の時間帯グラフになる) -->
      <div v-if="period === '7d'" class="flex flex-wrap gap-1.5 mb-3">
        <button
          v-for="d in days7"
          :key="d.start"
          type="button"
          class="px-2 py-1 rounded border text-[11px] text-left transition-colors"
          :class="
            d.start === activeDay
              ? 'border-[var(--exile-color-accent-focus)] bg-[var(--exile-color-bg-elevated)] text-[var(--exile-color-accent-focus)]'
              : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:border-[var(--exile-color-border-brass)]'
          "
          @click="selectedDay = d.start"
        >
          <span class="block">{{ d.label }}</span>
          <span class="block tabular-nums text-[10px]" :class="d.start === activeDay ? 'text-emerald-300' : 'text-[var(--exile-color-text-tertiary)]'">
            <template v-if="game === 'poe2'">{{ money(d.total) }} · </template>{{ d.count }} 件
          </span>
        </button>
      </div>
      <p v-if="game !== 'poe2'" class="text-[11px] text-[var(--exile-color-text-tertiary)]">PoE1 は高貴換算の相場が無いのでグラフは出しません (一覧と通貨別合計だけ)。</p>
      <template v-else>
        <div class="flex items-end gap-[3px] h-32">
          <div v-for="b in bars" :key="b.key" class="flex-1 min-w-0 h-full flex flex-col justify-end items-stretch group" :title="`${b.sub} ・ ${money(b.value)} ・ ${b.count} 件`">
            <span class="text-[9px] text-center tabular-nums text-[var(--exile-color-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">{{ money(b.value) }}</span>
            <span
              class="rounded-t transition-[height] duration-300"
              :class="b.today ? 'bg-[var(--exile-color-accent-focus)]' : 'bg-emerald-400/60 group-hover:bg-emerald-300'"
              :style="{ height: `${Math.max(b.value > 0 ? 2 : 1, (b.value / barMax) * 100)}%` }"
            ></span>
          </div>
        </div>
        <div class="flex gap-[3px] mt-1">
          <span v-for="(b, i) in bars" :key="b.key" class="flex-1 min-w-0 text-[9px] text-center tabular-nums text-[var(--exile-color-text-tertiary)] truncate">
            {{ i % labelEvery === 0 || b.today ? b.label : "" }}
          </span>
        </div>
        <div class="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[11px] text-[var(--exile-color-text-secondary)]">
          <span>最大 <span class="tabular-nums text-[var(--exile-color-text-primary)]">{{ money(barMax) }}</span> / {{ period === "all" ? "日" : "時" }}</span>
          <span v-for="[c, amt] in totals.byCurrency" :key="c" class="tabular-nums">{{ curLabel(c) }} {{ fmtAmount(amt) }}</span>
          <span v-if="totals.unconverted > 0" class="text-[10px] text-[var(--exile-color-text-tertiary)]">換算できない {{ totals.unconverted }} 件は 0 として扱っています</span>
        </div>
      </template>
    </div>

    <!-- 一覧 -->
    <div class="rounded-lg border border-[var(--exile-color-border-subtle)] p-3 text-[12px] overflow-x-auto">
      <p v-if="entries.length === 0" class="text-[var(--exile-color-text-tertiary)]">
        まだ履歴がありません。ログインして「履歴を取得」を押すと、公式サイトのマーチャント履歴がここに入ります。
      </p>
      <table v-else class="w-full">
        <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
          <tr>
            <th class="text-left font-normal pb-1 whitespace-nowrap">時刻</th>
            <th class="text-left font-normal pb-1 pl-3">アイテム</th>
            <th class="text-right font-normal pb-1 pl-3">数</th>
            <th class="text-right font-normal pb-1 pl-3">売値</th>
            <th v-if="game === 'poe2'" class="text-right font-normal pb-1 pl-3">換算</th>
          </tr>
        </thead>
        <tbody v-for="g in dayGroups" :key="g.start">
          <!-- 日付の見出し (その日の合計つき) -->
          <tr class="border-t border-[var(--exile-color-border-brass)]">
            <td :colspan="game === 'poe2' ? 5 : 4" class="pt-3 pb-1">
              <div class="flex items-baseline gap-3">
                <span class="font-display tracking-[0.06em] text-[13px] text-[var(--exile-color-accent-focus)]">{{ dayLabel(g.start) }}</span>
                <span v-if="game === 'poe2'" class="tabular-nums text-emerald-300">{{ money(g.total) }}</span>
                <span class="text-[11px] text-[var(--exile-color-text-tertiary)] tabular-nums">{{ g.list.length }} 件</span>
              </div>
            </td>
          </tr>
          <tr v-for="e in g.list" :key="e.key" class="border-t border-[var(--exile-color-border-subtle)]">
            <td class="py-1 tabular-nums whitespace-nowrap text-[var(--exile-color-text-secondary)]">{{ fmtHM(e.time) }}</td>
            <td class="py-1 pl-3">
              <div class="flex items-center gap-2 min-w-0">
                <img v-if="e.icon" :src="e.icon" alt="" class="w-6 h-6 object-contain shrink-0" loading="lazy" />
                <span class="min-w-0" :class="rarityClass(e.rarity)" :title="`${e.name} ${e.typeLine}`.trim()">
                  <span v-if="e.name" class="mr-1.5">{{ jaName(e) }}</span><span :class="e.name ? 'text-[var(--exile-color-text-secondary)]' : ''">{{ jaType(e) }}</span>
                  <span v-if="e.ilvl" class="text-[10px] text-[var(--exile-color-text-tertiary)]"> ilvl {{ e.ilvl }}</span>
                </span>
              </div>
            </td>
            <td class="py-1 pl-3 text-right tabular-nums">{{ e.stack ?? "" }}</td>
            <td class="py-1 pl-3 text-right tabular-nums whitespace-nowrap">{{ e.amount != null ? `${fmtAmount(e.amount)} ${curLabel(e.currency)}` : "—" }}</td>
            <td v-if="game === 'poe2'" class="py-1 pl-3 text-right tabular-nums whitespace-nowrap text-[var(--exile-color-text-secondary)]">{{ money(exaltedOf(e)) }}</td>
          </tr>
        </tbody>
      </table>
      <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
        取った履歴はリーグごとにこの PC に残ります (公式サイトは直近の分しか返さないため、古い分も消さずに足していきます)。換算は今の相場 (カレンシーランキング) で、売れた時の相場ではありません。
      </p>
    </div>
  </section>
</template>

<style scoped>
.sel {
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--exile-color-bg-surface);
  border: 1px solid var(--exile-color-border-subtle);
}
.sel:focus {
  outline: none;
  border-color: var(--exile-color-accent-focus);
}
</style>
