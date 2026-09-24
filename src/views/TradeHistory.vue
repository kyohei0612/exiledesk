<!--
  TradeHistory.vue — 取引履歴 (マーチャント履歴) の連動 (2026-09-16)
  アプリ内のウィンドウで pathofexile.com にログイン → サイトと同じ履歴 API で「いつ・何が・いくらで売れたか」を読む。
  取れた分はこの PC に足していく (API は直近分しか返さない)。取得の間隔はサーバーの残り回数に合わせる (上限の 1 回手前で止める)。
  アイテム名は表示時にクライアントの日本語へ変換する (保存は英語名のまま)。
    services/trade-history.ts   Tauri ラッパ / 解析 / 蓄積
    src-tauri/src/trade_history.rs  ログイン用ウィンドウ / cookie / 履歴 API
-->
<script setup lang="ts">
import ScreenHeader from "../components/ScreenHeader.vue";
import { askConfirm } from "../state/confirm-dialog";
import { refreshSession as refreshGlobalSession } from "../state/poe-session";
import RefreshButton from "../components/RefreshButton.vue";
import { fetchBusy, fetchBusyLabel } from "../state/fetch-busy";
import { computed, onActivated, onMounted, onUnmounted, ref, watch } from "vue";
import CurrencyPicker from "../components/vaal-scales/CurrencyPicker.vue";
import { currencyJa, displayCurrency } from "../state/display-currency";
import { DAY_MS, dayLabel, fmtAmount, fmtTime } from "./trade-history/format";
import EntryTable from "./trade-history/EntryTable.vue";
import { useHistoryView } from "./trade-history/use-history-view";
import { marketStore } from "../state/market-store";
import { fetchLeagueStartEpoch } from "../api/poe2scout";
import { isTauriRuntime } from "../utils/isTauriRuntime";
import { waitText } from "../utils/wait-text";
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
  // アプリ全体のログイン状態も取り直す (ログアウトしたらログインの画面を出す。ログイン必須 2026-09-24)
  void refreshGlobalSession();
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
  // 履歴も同じ門番 (trade2) を通るので、巡回中は押しても順番待ちに並ぶだけ
  // (オーナー指示 2026-09-20:「巡回中は他の取得は触れないようにしよう」)
  if (fetchBusyLabel.value) return fetchBusyLabel.value;
  if (waitSec.value > 0) return `次の取得まで ${Math.floor(waitSec.value / 60)}:${String(waitSec.value % 60).padStart(2, "0")}`;
  return "履歴を取得";
});

// ---- 絞り込みと集計は trade-history/use-history-view.ts へ (2026-09-19 の分割) ----
const { PERIODS, period, search, selectedDay, todayStart, activeDay, days7, visible, totals, summary, bars, barMax, labelEvery } =
  useHistoryView({ entries, game, now, leagueStartMs });

const curLabel = currencyJa;

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
    <ScreenHeader title="取引履歴">
      公式サイトのマーチャント履歴を ExileDesk に取り込みます。ログインは ExileDesk が開く pathofexile.com の画面で本人が行い、そのログイン状態で履歴を読みます。
      <template #source>
        履歴: 公式サイト (非公式 API) · {{ lastFetchAt ? `${fmtTime(lastFetchAt)} 取得` : "未取得" }}<template v-if="usageText"> · 使った回数 {{ usageText }}</template><template v-if="autoNote"> · {{ autoNote }}</template>
      </template>
      <template #actions>
        <RefreshButton
          :label="fetchLabel"
          :disabled="!inApp || !loggedIn || busy || waitSec > 0 || !league || fetchBusy"
          title="公式サイトから取引履歴を取り込みます"
          @click="fetchNow"
        />
      </template>
      <template #controls><CurrencyPicker /></template>
      <template #note>
        取引サイトの履歴 API は GGG の非公式 API です (公式の認証には取引履歴を読む権限がありません)。ログイン状態はアプリ内のブラウザにだけ残り、ExileDesk はファイルに保存しません。
        履歴の取得回数の制限はアカウント単位で、公式サイトや他のツール (PoE Overlay II など) の更新と共通です。
        サーバーが返す残り回数に合わせて、上限の 1 回手前で止めます (目安: 1 分 5 回 / 10 分 10 回 / 3 時間 15 回、超えると最長 1 時間締め出し)。
      </template>
    </ScreenHeader>

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
      <!-- 手動更新と取得時刻は見出しに集約した (2026-09-21) -->
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

    <EntryTable :entries="entries" :visible="visible" :game="game" />
  </section>
</template>

