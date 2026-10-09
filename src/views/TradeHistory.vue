<!--
  TradeHistory.vue — 取引履歴 (マーチャント履歴) の連動 (2026-09-16)
  アプリ内のウィンドウで pathofexile.com にログイン → サイトと同じ履歴 API で「いつ・何が・いくらで売れたか」を読む。
  取れた分はこの PC に足していく (API は直近分しか返さない)。取得の間隔はサーバーの残り回数に合わせる (上限の 1 回手前で止める)。
  アイテム名は表示時にクライアントの日本語へ変換する (保存は英語名のまま)。
    services/trade-history.ts   Tauri ラッパ / 解析 / 蓄積
    src-tauri/src/trade_history.rs  ログイン用ウィンドウ / cookie / 履歴 API
    trade-history/use-trade-session.ts  ログイン状態 / リーグ / 取得と自動更新 (2026-09-26 の分割)
-->
<script setup lang="ts">
import ScreenHeader from "../components/ScreenHeader.vue";
import RefreshButton from "../components/RefreshButton.vue";
import TabBar from "../components/ui/TabBar.vue";
import { fetchBusy } from "../state/fetch-busy";
import CurrencyPicker from "../components/vaal-scales/CurrencyPicker.vue";
import { currencyJa, displayCurrency } from "../state/display-currency";
import { DAY_MS, dayLabel, fmtAmount, fmtTime } from "./trade-history/format";
import EntryTable from "./trade-history/EntryTable.vue";
import { useHistoryView } from "./trade-history/use-history-view";
import { useTradeSession } from "./trade-history/use-trade-session";

const money = (n: number | null | undefined): string => displayCurrency.money(n);

// ---- ログイン状態 / リーグ / 取得と自動更新は trade-history/use-trade-session.ts へ (2026-09-26 の分割) ----
const {
  inApp,
  game,
  league,
  leagues,
  loggedIn,
  busy,
  message,
  entries,
  lastFetchAt,
  now,
  leagueStartMs,
  refreshSession,
  login,
  doLogout,
  fetchNow,
  autoNote,
  waitSec,
  usageText,
  fetchLabel,
} = useTradeSession();

// ---- 絞り込みと集計は trade-history/use-history-view.ts へ (2026-09-19 の分割) ----
const { period, search, selectedDay, todayStart, activeDay, days7, visible, totals, summary, bars, barMax, labelEvery } =
  useHistoryView({ entries, game, now, leagueStartMs });

const curLabel = currencyJa;
/** 上の 2 枚 (押すと下のグラフと一覧がその期間になる) */
const cards = () => [
  { id: "7d" as const, label: "7 日間", note: `${dayLabel(todayStart.value - 6 * DAY_MS)} 〜 ${dayLabel(todayStart.value)}`, s: summary.value.week },
  { id: "all" as const, label: "全部", note: leagueStartMs.value ? `リーグ開始 ${dayLabel(leagueStartMs.value)} 〜` : `保存 ${entries.value.length} 件`, s: summary.value.all },
];
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)]">
  <!-- 画面名は上の帯に 1 回だけ (他の画面と同じ TabBar。2026-10-03) -->
  <TabBar art="trade" title="取引履歴" />
  <!-- 1 つの枠にまとめる (2026-10-10 UI 見直し。カレンシーランキングと同じ形。前はログイン・まとめ・グラフ・一覧で枠が 4 つ重なっていた) -->
  <div class="flex-1 min-h-0 flex p-4">
  <section class="g-panel @container flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-5 py-2">
    <ScreenHeader>
      公式サイトのマーチャント履歴を取り込みます。ログインは ExileDesk が開く pathofexile.com の画面で本人が行います。
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
      <!-- ログイン・ゲーム・リーグ・表示通貨は 1 行に (前は 1 行だけのために大きな枠を使っていた) -->
      <template #controls>
        <span class="inline-flex items-center gap-2">
          <span v-if="loggedIn === null" class="text-[var(--exile-color-text-tertiary)]">ログイン確認中…</span>
          <span v-else-if="loggedIn" class="text-emerald-300">ログイン済み</span>
          <span v-else class="text-amber-300">未ログイン</span>
          <button v-if="!loggedIn" type="button" :disabled="!inApp" class="g-btn sm" @click="login">pathofexile.com にログイン</button>
          <button type="button" :disabled="!inApp" class="btn-link" @click="refreshSession">状態を確認</button>
          <button v-if="loggedIn" type="button" class="btn-link" @click="doLogout">ログアウト</button>
        </span>
        <label class="inline-flex items-center gap-2">
          <span>ゲーム</span>
          <select v-model="game" class="sel">
            <option value="poe2">PoE2</option>
            <option value="poe1">PoE1</option>
          </select>
        </label>
        <label class="inline-flex items-center gap-2 min-w-0">
          <span>リーグ</span>
          <select v-model="league" class="sel max-w-56">
            <option v-if="leagues.length === 0 && league" :value="league">{{ league }}</option>
            <option v-for="l in leagues" :key="l" :value="l">{{ l }}</option>
          </select>
        </label>
        <CurrencyPicker />
      </template>
      <template #note>
        取引サイトの履歴 API は GGG の非公式 API です (公式の認証には取引履歴を読む権限がありません)。ログイン状態はアプリ内のブラウザにだけ残り、ExileDesk はファイルに保存しません。
        履歴の取得回数の制限はアカウント単位で、公式サイトや他のツール (PoE Overlay II など) の更新と共通です。
        サーバーが返す残り回数に合わせて、上限の 1 回手前で止めます (目安: 1 分 5 回 / 10 分 10 回 / 3 時間 15 回、超えると最長 1 時間締め出し)。
        取った履歴はリーグごとにこの PC に残ります (公式サイトは直近の分しか返さないため、古い分も消さずに足していきます)。換算は今の相場 (カレンシーランキング) で、売れた時の相場ではありません。
      </template>
    </ScreenHeader>

    <p v-if="!inApp" class="mb-3 text-[12px] text-amber-300">この画面はアプリ (ExileDesk) の中でだけ動きます。ブラウザ表示では保存済みの履歴だけ出ます。</p>
    <p v-if="message" class="mb-3 text-[12px]" :class="message.ok ? 'text-emerald-300' : 'text-amber-300'">{{ message.text }}</p>

    <!-- 売上まとめ (7 日間 / 全部)。押すと下のグラフと一覧がその期間になる (同じ働きの切り替えタブは外した)。選んだ / 選んでいないで形は同じ -->
    <div v-if="game === 'poe2'" class="grid grid-cols-1 @2xl:grid-cols-2 gap-3 mb-4">
      <div
        v-for="card in cards()"
        :key="card.id"
        role="button"
        tabindex="0"
        class="rounded-lg border p-3 cursor-pointer transition-colors bg-[var(--exile-color-bg-surface)]"
        :class="period === card.id ? 'border-[var(--exile-color-accent-focus)]' : 'border-[var(--exile-color-border-subtle)] hover:border-[var(--exile-color-border-brass)]'"
        @click="period = card.id"
        @keydown.enter="period = card.id"
      >
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-[13px] font-bold" :class="period === card.id ? 'text-[var(--exile-color-accent-focus)]' : 'text-[var(--exile-color-text-secondary)]'">{{ card.label }}</span>
          <span class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ card.note }}</span>
        </div>
        <div class="mt-1 tabular-nums text-[20px] font-bold text-emerald-300">{{ money(card.s.total) }}</div>
        <div class="text-[11px] text-[var(--exile-color-text-secondary)] tabular-nums">{{ card.s.count }} 件</div>
      </div>
    </div>

    <!-- 日別グラフ -->
    <div class="mb-4">
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-3">
        <h2 class="card-title">{{ period === "7d" ? `${dayLabel(activeDay)} の売上 (時間別)` : "リーグ開始からの売上 (1 日ずつ)" }}</h2>
        <div class="flex items-center gap-3">
          <input v-model="search" type="text" placeholder="アイテム名で絞り込み" class="sel w-52" />
          <span class="text-[11px] text-[var(--exile-color-text-secondary)] tabular-nums">{{ visible.length }} 件</span>
        </div>
      </div>
      <!-- 7 日間: 日付を選ぶ (その日の時間帯グラフになる)。見た目はタブで揃える (前は選んだ日だけ別の見た目)。売れていない日は「—」 -->
      <div v-if="period === '7d'" class="flex flex-wrap gap-1.5 mb-3">
        <button
          v-for="d in days7"
          :key="d.start"
          type="button"
          class="g-tab !min-h-[44px] !px-3 !flex-col !items-start !gap-0 leading-tight"
          :class="d.start === activeDay ? 'on' : ''"
          @click="selectedDay = d.start"
        >
          <span class="text-[12px]">{{ d.label }}</span>
          <span class="tabular-nums text-[11px]" :class="d.start === activeDay ? '' : d.count ? 'text-emerald-300' : 'text-[var(--exile-color-text-tertiary)]'">
            <template v-if="!d.count">—</template>
            <template v-else-if="game === 'poe2'">{{ money(d.total) }} · {{ d.count }} 件</template>
            <template v-else>{{ d.count }} 件</template>
          </span>
        </button>
      </div>
      <p v-if="game !== 'poe2'" class="text-[11px] text-[var(--exile-color-text-tertiary)]">PoE1 は高貴換算の相場が無いのでグラフは出しません (一覧と通貨別合計だけ)。</p>
      <!-- 売れていない期間は空のグラフ (最大 1.00 高貴 / 軸の 0 と 1) を出さない -->
      <p v-else-if="!bars.some((b) => b.count > 0)" class="py-6 text-center text-[12px] text-[var(--exile-color-text-tertiary)]">この期間の売上はありません</p>
      <template v-else>
        <div class="flex items-end gap-[3px] h-32">
          <div v-for="b in bars" :key="b.key" class="flex-1 min-w-0 h-full flex flex-col justify-end items-stretch group" :title="b.count ? `${b.sub} ・ ${money(b.value)} ・ ${b.count} 件` : b.sub">
            <span class="text-[10px] text-center tabular-nums text-[var(--exile-color-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">{{ b.value > 0 ? money(b.value) : "" }}</span>
            <span
              class="rounded-t transition-[height] duration-300"
              :class="b.today ? 'bg-[var(--exile-color-accent-focus)]' : 'bg-emerald-400/60 group-hover:bg-emerald-300'"
              :style="{ height: `${Math.max(b.value > 0 ? 2 : 1, (b.value / barMax) * 100)}%` }"
            ></span>
          </div>
        </div>
        <div class="flex gap-[3px] mt-1">
          <span v-for="(b, i) in bars" :key="b.key" class="flex-1 min-w-0 text-[10px] text-center tabular-nums text-[var(--exile-color-text-tertiary)] truncate">
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
  </div>
  </div>
</template>
