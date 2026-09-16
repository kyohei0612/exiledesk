<!--
  TradeHistory.vue — 取引履歴 (マーチャント履歴) の連動 (2026-09-16)
  アプリ内のウィンドウで pathofexile.com にログイン → サイトと同じ履歴 API で「いつ・何が・いくらで売れたか」を読む。
  取れた分はこの PC に足していく (API は直近分しか返さない)。取得の間隔はサーバーの残り回数に合わせる (上限の 1 回手前で止める)。
  アイテム名は表示時にクライアントの日本語へ変換する (保存は英語名のまま)。
    services/trade-history.ts   Tauri ラッパ / 解析 / 蓄積
    src-tauri/src/trade_history.rs  ログイン用ウィンドウ / cookie / 履歴 API
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import CurrencyPicker from "../components/vaal-scales/CurrencyPicker.vue";
import { displayCurrency } from "../state/display-currency";
import { marketStore } from "../state/market-store";
import { toExalted } from "../services/trade2/pricing";
import { isTauriRuntime } from "../utils/isTauriRuntime";
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

// ---- 絞り込みと集計 ----
const PERIODS = [
  { id: "1d", label: "24 時間", ms: 86_400_000 },
  { id: "7d", label: "7 日", ms: 7 * 86_400_000 },
  { id: "30d", label: "30 日", ms: 30 * 86_400_000 },
  { id: "all", label: "全部", ms: 0 },
] as const;
const period = ref<(typeof PERIODS)[number]["id"]>("7d");
const search = ref("");
const visible = computed(() => {
  const p = PERIODS.find((x) => x.id === period.value);
  const since = p && p.ms > 0 ? now.value - p.ms : 0;
  const q = search.value.trim().toLowerCase();
  // 検索は日本語名と英語名のどちらでも引っかかるように
  return entries.value.filter(
    (e) => e.time >= since && (!q || `${e.name} ${e.typeLine} ${jaName(e)} ${jaType(e)}`.toLowerCase().includes(q)),
  );
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

const CURRENCY_JA: Record<string, string> = { exalted: "高貴", divine: "神", chaos: "カオス" };
const curLabel = (c: string | null): string => (c ? (CURRENCY_JA[c] ?? c) : "");
const fmtAmount = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));
function fmtTime(ms: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
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
        最終取得 {{ lastFetchAt ? fmtTime(lastFetchAt) : "—" }}<span v-if="usageText"> · 使った回数 {{ usageText }}</span>
      </span>
      <p v-if="message" class="basis-full text-[12px]" :class="message.ok ? 'text-emerald-300' : 'text-amber-300'">{{ message.text }}</p>
    </div>

    <!-- 集計 -->
    <div class="rounded-lg border border-[var(--exile-color-border-subtle)] p-3 text-[12px] mb-4">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2">
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
        <input v-model="search" type="text" placeholder="アイテム名で絞り込み" class="sel w-56" />
        <span class="text-[var(--exile-color-text-secondary)]">{{ visible.length }} 件 (保存 {{ entries.length }} 件)</span>
      </div>
      <div class="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <span v-if="game === 'poe2'" class="font-display tracking-[0.04em]">
          売上 <span class="tabular-nums text-[15px] text-emerald-300">{{ money(totals.exalted) }}</span>
          <span v-if="totals.unconverted > 0" class="text-[10px] text-[var(--exile-color-text-tertiary)]"> (換算できない {{ totals.unconverted }} 件を除く)</span>
        </span>
        <span v-for="[c, amt] in totals.byCurrency" :key="c" class="tabular-nums text-[var(--exile-color-text-secondary)]">{{ curLabel(c) }} {{ fmtAmount(amt) }}</span>
      </div>
    </div>

    <!-- 一覧 -->
    <div class="rounded-lg border border-[var(--exile-color-border-subtle)] p-3 text-[12px] overflow-x-auto">
      <p v-if="entries.length === 0" class="text-[var(--exile-color-text-tertiary)]">
        まだ履歴がありません。ログインして「履歴を取得」を押すと、公式サイトのマーチャント履歴がここに入ります。
      </p>
      <table v-else class="w-full">
        <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
          <tr>
            <th class="text-left font-normal pb-1 whitespace-nowrap">日時</th>
            <th class="text-left font-normal pb-1 pl-3">アイテム</th>
            <th class="text-right font-normal pb-1 pl-3">数</th>
            <th class="text-right font-normal pb-1 pl-3">売値</th>
            <th v-if="game === 'poe2'" class="text-right font-normal pb-1 pl-3">換算</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in visible" :key="e.key" class="border-t border-[var(--exile-color-border-subtle)]">
            <td class="py-1 tabular-nums whitespace-nowrap text-[var(--exile-color-text-secondary)]">{{ fmtTime(e.time) }}</td>
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
