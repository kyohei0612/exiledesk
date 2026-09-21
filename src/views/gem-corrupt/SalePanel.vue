<!--
  SalePanel.vue — 売値 (3 条件の最安と捣き速度)
  2026-09-19 に GemCorrupt.vue から切り出した。中身は変えていない。
-->
<script setup lang="ts">
import RefreshButton from "../../components/RefreshButton.vue";
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from "vue";
import BaseCard from "../../components/decor/BaseCard.vue";
import SoldListDialog from "../../components/SoldListDialog.vue";
import { refetchState } from "../../services/trade2/auto-price";
import { openExternal } from "../../services/trade2/open-external";
import { averageExalted } from "../../state/display-currency";
import { fmtClock } from "../../utils/format-time";
import { flowSentence, fmtAge, fmtSellTime, loadFlow, loadFlowStatus, summarizeFlow, type FlowStatus, type FlowStore } from "../../services/market-flow";
import { SALE_KEYS, SALE_KEY_LABEL, watchKey, type SaleKey } from "./row-query";
import { money, unit } from "./ui";
import { SALE_ROWS, type useGemCorrupt } from "./useGemCorrupt";

const props = defineProps<{ g: ReturnType<typeof useGemCorrupt> }>();
const g = props.g;
const nowMs = ref(Date.now());
let tickTimer: ReturnType<typeof setInterval> | null = null;
/** 1 秒ごとの時計 (「N 分前に取得」の表示) と、巡回の記録の読み直し */
function startTicking(): void {
  void reloadFlow();
  startStatusPolling();
  if (!tickTimer) tickTimer = setInterval(() => (nowMs.value = Date.now()), 1000);
}
function stopTicking(): void {
  stopStatusPolling();
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}
// <keep-alive> で保持されるので、画面に戻ってきた時に読み直す
onMounted(startTicking);
onActivated(startTicking);
onDeactivated(stopTicking);
onUnmounted(stopTicking);
async function open(url: string | null): Promise<void> {
  await openExternal(url);
}
/** 再取得ボタン (検索中 / レート制限 / 間隔待ち のカウントダウン) */
const refetch = computed(() => refetchState(g.pricing.value, "再取得", "trade2 で検索中… (3 件、約 30 秒)"));

// ---- 売れ行き (2026-09-16: market_flow が巡回で記録した物を読むだけ) ----
const flowStore = ref<FlowStore | null>(null);
/**
 * 売れたリスト (オーナー指示 2026-09-17): 判定の根拠になった出品を 1 件ずつ見る。
 * 行から開いた時はその条件だけ、見出しのボタンから開いた時は 3 条件まとめて出す
 * (「レベル +1 はレベル +1 だけ一覧で表示」)。
 */
const soldOpen = ref(false);
const soldOnly = ref<SaleKey | null>(null);
const soldKeys = computed(() => {
  const en = g.selected.value?.en ?? "";
  const keys = soldOnly.value ? [soldOnly.value] : SALE_KEYS;
  return keys.map((k) => ({ key: watchKey(en, k), label: SALE_KEY_LABEL[k] }));
});
const soldTitle = computed(() => {
  const ja = g.selected.value?.ja ?? "";
  return soldOnly.value ? `${ja} · ${SALE_KEY_LABEL[soldOnly.value]}` : ja;
});
function openSold(key: SaleKey | null): void {
  soldOnly.value = key;
  soldOpen.value = true;
}
/** 自動追跡の進行状況 (2026-09-16: 動いているのが分かるように) */
const flowStatus = ref<FlowStatus | null>(null);
let statusTimer: ReturnType<typeof setInterval> | null = null;

async function reloadFlow(): Promise<void> {
  flowStore.value = await loadFlow();
  flowStatus.value = await loadFlowStatus();
}
function startStatusPolling(): void {
  if (statusTimer) return;
  statusTimer = setInterval(async () => {
    flowStatus.value = await loadFlowStatus();
    // 取得が 1 周終わったら記録も読み直す
    if (flowStatus.value && !flowStatus.value.sampling && flowStatus.value.last_at > (flowStore.value?.sampled_at ?? 0)) {
      flowStore.value = await loadFlow();
    }
  }, 5000);
}
function stopStatusPolling(): void {
  if (statusTimer) clearInterval(statusTimer);
  statusTimer = null;
}

// 「再取得」の後に記録を読み直す (巡回が裏で回っているので表示を最新にする)
watch(
  () => g.pricing.value,
  (now, prev) => {
    if (prev && !now) void reloadFlow();
  },
);
/** 行 (条件) ごとの捌き速度 */
function flowOf(key: SaleKey) {
  const en = g.selected.value?.en ?? "";
  return summarizeFlow(flowStore.value?.states?.[watchKey(en, key)]);
}
/** 表の下のまとめに使う代表値 (完成品) */
const flow = computed(() => flowOf("finished"));
/** 追跡対象に入っているか (3 条件のどれかが入っていれば追跡中) */
const flowWatch = computed(() => {
  const en = g.selected.value?.en ?? "";
  return flowStore.value?.watches?.find((x) => SALE_KEYS.some((k) => x.key === watchKey(en, k))) ?? null;
});
const flowTracked = computed(() => !!flowWatch.value);
/** その条件が追跡対象か (記録がまだ無くても、登録されていれば「巡回待ち」と出す) */
function isWatched(key: SaleKey): boolean {
  const en = g.selected.value?.en ?? "";
  return !!flowStore.value?.watches?.some((w) => w.key === watchKey(en, key));
}
/** 自動巡回に入っているか。手動で足した物でも自動リストに載れば巡回する */
const flowAuto = computed(() => !!flowWatch.value?.auto);
/** その売値が一括取得の記録から来たか (レート制限中はこれで計算する) */
function recordedAt(key: SaleKey): number | null {
  return g.saleRecordedAt.value[key];
}
const fmtRecordedAt = (sec: number): string => fmtClock(sec);

/** 最安 1 件の内訳 (値段の種類・出品者・出品時刻)。おかしな値段の切り分け用 (2026-09-17) */
function cheapestTitle(key: SaleKey): string {
  const rec = recordedAt(key);
  if (rec) return `一括取得の記録 (${fmtRecordedAt(rec)} 時点の最安)。レート制限中や取得前はこの値で計算します`;
  const info = g.saleInfo.value[key];
  const l = info?.listings?.[0];
  if (!l) return "";
  const kind = l.priceType ? `種類 ${l.priceType}` : "種類不明";
  const at = l.indexed ? new Date(l.indexed).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "出品時刻不明";
  // 即時購入にオンラインかどうかは関係ない (オーナー指摘 2026-09-17)。
  // 見るのは出品者と値段。同じ出品者が並べているかどうかが捌け方の判断に効く
  const same = (info?.listings ?? []).filter((x) => x.account && x.account === l.account).length;
  const who = l.account ? `${l.account}${same > 1 ? ` (この 10 件中 ${same} 件が同じ出品者)` : ""}` : "出品者不明";
  return `最安 ${l.amount} ${l.currency} · ${kind} · ${at}
${who}`;
}


/** ホバーで出す内訳 */
function flowTitleOf(f: ReturnType<typeof flowOf>): string {
  const pct = (v: number | null): string => (v == null ? "—" : `${Math.round(v * 100)}%`);
  return [
    flowSentence(f),
    `1 日以内に売れた割合: ${f.hit24} / ${f.known24} 件 (${pct(f.soldIn24h)})`,
    `2 日以内: ${f.hit48} / ${f.known48} 件 (${pct(f.soldIn48h)})`,
    `売れた分の寿命の中央値: ${fmtAge(f.medianMin)}`,
    "割合の分母は「その時間の時点で結果が分かっている出品」。まだ齢が足りない物は数えません",
    `追跡: 消えた ${f.gone} 件 / まだ残っている ${f.alive} 件`,
    f.stale > 0
      ? `48 時間以上売れ残り: ${f.stale} 件${f.staleRatio != null ? ` (最安の ${f.staleRatio.toFixed(1)} 倍の値付け)` : ""}`
      : "48 時間以上の売れ残りなし",
    `出品総数: ${f.total ?? "—"} · 最終記録 ${fmtFlowAt(f.lastAt)}`,
    "出品 1 件ずつを ID で追い、出品時刻からの齢で数えています",
  ].join("\n");
}
function badgeClassOf(tone: string): string {
  switch (tone) {
    case "fast":
      return "border-emerald-500/60 bg-emerald-500/15 text-emerald-300";
    case "normal":
      return "border-amber-500/60 bg-amber-500/15 text-amber-300";
    case "slow":
      return "border-red-500/60 bg-red-500/15 text-red-300";
    default:
      return "border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-tertiary)]";
  }
}
const fmtFlowAt = (t: number | null): string => {
  if (!t) return "";
  const d = new Date(t * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
</script>

<template>
  <BaseCard>
        <div class="p-4 pl-5">
          <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
            <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">売値 ({{ unit }})</h2>
            <div class="flex items-center gap-3 text-[11px]">
              <!-- 2026-09-17 オーナー指摘「売れたIDと金額の一覧が見当たらない」: 常設の入口を置く -->
              <button
                type="button"
                :disabled="!g.selected.value"
                class="underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)] disabled:opacity-40"
                title="このジェムの追跡記録 (売れた出品の値段・出品者・寿命、追跡中の出品) を一覧で見る"
                @click="openSold(null)"
              >
                📋 売れたリスト
              </button>
              <RefreshButton
                :label="refetch.label"
                :disabled="!g.selected.value || refetch.disabled"
                title="3 条件の最安を trade2 から取り直します"
                @click="g.fetchSalePrices(true)"
              />
            </div>
          </div>
          <p v-if="g.priceError.value" class="text-[11px] text-amber-300 mb-2">{{ g.priceError.value }}</p>
          <!-- ジェムを選ぶ前は空の表を出さない (オーナー指摘 2026-09-21:
               案内の下に «—» だけの行が並んで壊れて見えた) -->
          <p v-if="!g.selected.value" class="text-[12px] text-[var(--exile-color-text-tertiary)]">
            ジェムを選ぶと、その 3 条件 (レベル 21 / 品質 23% / 完成品) の最安と売れ行きが出ます。
          </p>
          <table v-else class="w-full text-[12px]">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">状態</th>
                <th class="text-right font-normal pb-1 w-28">売値</th>
                <th class="text-right font-normal pb-1 w-20">出品数</th>
                <th class="text-right font-normal pb-1 w-48">売れ行き</th>
                <th class="text-right font-normal pb-1 w-16"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in SALE_ROWS" :key="row.key" class="border-t border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5 pr-2">
                  <div>{{ row.label }}</div>
                  <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ row.condition }}</div>
                </td>
                <td class="py-1.5 text-right">
                  <!-- 2026-09-17: 変な値段の時に中身が分かるように、最安 1 件の内訳をホバーで出す -->
                  <span class="tabular-nums text-[13px]" :title="cheapestTitle(row.key)" :class="g.sale.value[row.key] == null ? 'text-[var(--exile-color-text-tertiary)]' : ''">{{ g.sale.value[row.key] == null ? (g.pricing.value ? "取得中…" : "—") : money(g.sale.value[row.key]) }}</span>
                  <!-- オーナー指示 2026-09-17: レート制限中でも一括取得の最終値で計算する。どこから来た値かは出す -->
                  <div v-if="recordedAt(row.key)" class="text-[10px] text-[var(--exile-color-text-tertiary)] whitespace-nowrap">記録 {{ fmtRecordedAt(recordedAt(row.key)!) }}</div>
                </td>
                <td class="py-1.5 text-right tabular-nums text-[var(--exile-color-text-secondary)]">
                  {{ g.saleInfo.value[row.key] ? g.saleInfo.value[row.key]!.total : "" }}
                </td>
                <!-- 2026-09-16: 捌き速度 (出品を ID で追って生存分析)。3 条件とも出す -->
                <!-- 2026-09-17 オーナー指示: 押すと売れたリスト (値段つき) を出す -->
                <td class="py-1.5 text-right cursor-pointer hover:bg-[var(--exile-color-bg-elevated)]" :title="`${row.label} の記録を一覧で見る`" @click="openSold(row.key)">
                  <template v-for="f in [flowOf(row.key)]" :key="row.key">
                    <div v-if="f.label" class="flex items-center justify-end gap-2" :title="flowTitleOf(f)">
                      <span class="shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded text-[11px] font-display tracking-[0.06em] border leading-none" :class="badgeClassOf(f.tone)">{{ f.label }}<span v-if="f.thin" class="opacity-70" title="根拠は 3 件未満です">?</span></span>
                      <span class="tabular-nums text-[11px] text-[var(--exile-color-text-secondary)] whitespace-nowrap">
                        {{ fmtSellTime(f.medianMin) }}で売れる ({{ f.gone }} 件)<template v-if="averageExalted(f.soldPrices) != null"> · 平均 {{ money(averageExalted(f.soldPrices)) }}</template><span v-if="f.olderThanMedian > 0" class="text-[var(--exile-color-text-tertiary)]"> · 未売却 {{ f.olderThanMedian }} 件はそれより長い</span>
                      </span>
                      <span class="text-[10px] underline text-[var(--exile-color-text-tertiary)] whitespace-nowrap">売れたリスト</span>
                    </div>
                    <span
                      v-else-if="f.gone + f.alive > 0"
                      class="text-[10px] text-[var(--exile-color-text-tertiary)] whitespace-nowrap"
                      :title="`${flowSentence(f)}。判定には結果が分かっている出品 (売れた分 + 1 日超えて売れ残った分) が 3 件必要です。押すと記録の一覧`"
                    >
                      <span v-if="f.firstLook && f.gone === 0" class="underline">初回・次回の取得で判定 ({{ f.alive }} 件を記録)</span>
                      <span v-else class="underline">{{ f.gone > 0 ? `${f.gone} 件売れた (${fmtSellTime(f.medianMin)})` : "まだ売れていない" }} / {{ f.alive }} 件並んでいる</span>
                    </span>
                    <span v-else-if="isWatched(row.key)" class="text-[10px] text-[var(--exile-color-text-tertiary)] underline" title="追跡対象です。巡回の順番が来ると記録が始まります。押すと記録の一覧">巡回待ち</span>
                    <span v-else class="text-[10px] text-[var(--exile-color-text-tertiary)]">—</span>
                  </template>
                </td>
                <td class="py-1.5 text-right">
                  <button
                    type="button"
                    :disabled="!g.selected.value"
                    class="text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)] disabled:opacity-40"
                    title="同じ条件でトレードサイト (JP) を開く。API は使わない"
                    @click="open(g.tradeUrl(row.key))"
                  >
                    トレード2へ ↗
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <!-- 自動取得の状態 (周目 / 次回 / レート待ち / 取りこぼし) はここには出さない。
               オーナー指示 2026-09-19:「レート制限のところややこしいから、ジェムコラのとこに
               自動取得関係表示しなくていい。別だからややこしくならんでしょ」。
               自動の様子は「自動ジェム監視」の画面だけで見る。ここは手動の再取得ボタンの状態だけ -->
        <!-- 長い説明は畳んでおく (オーナー指示 2026-09-20:「長ったらしい説明は閉じてて、
             仕組みを見るって感じでタイトル付けてデフォで閉じててほしい」) -->
        <details class="mt-2">
          <summary class="text-[11px] text-[var(--exile-color-text-tertiary)] cursor-pointer select-none hover:text-[var(--exile-color-accent-focus)]">
            読み方と注意 (母数・判定・記録のルール)
          </summary>
          <p class="text-[11px] leading-relaxed text-[var(--exile-color-text-tertiary)] mt-2">
            <span v-if="g.selected.value" class="text-[var(--exile-color-text-secondary)]">
              捌き速度の記録: 残り {{ flow.alive }} 件 / 消えた {{ flow.gone }} 件<span v-if="flow.lastAt"> (最終 {{ fmtFlowAt(flow.lastAt) }})</span>
              · {{ flowTracked ? (flowAuto ? "自動ジェム監視で追跡中" : "以前の記録 (今は監視対象外)") : "まだ記録がありません" }}。
            </span>
            <br v-if="g.selected.value" />
            売値は<span class="text-[var(--exile-color-text-secondary)]">インスタントバイアウト (今すぐ買える出品) だけ</span>の最安です。トレードサイトのドロップダウンで「インスタントバイアウト」を選んだ時と同じ条件なので、「トレード2へ」で開いた一覧と数が合います。
            捌き速度の追跡も同じ条件 (即時購入のみ) で見ているので、「再取得」を押した分も自動巡回とまったく同じルールで記録されます。検索の ID 一覧から消えた出品を「売れた」と数えます (同じ出品者がすぐ並べ直した物は値段の付け替えとして除外)。
            判定は最安 10 件の出品を 1 件ずつ ID で追い、売れるまでの時間の真ん中の値で出します (6 時間以内なら速い / 24 時間以内なら普通 / それより長ければ遅い)。普通 / 遅い は売れた出品が 3 件たまるまで出しませんが、<span class="text-[var(--exile-color-text-secondary)]">6 時間以内に売れた実績が 1 件でもあれば「速い」</span>と出します (1 件でも捌けた事実なので。判定の横の件数で母数が分かります)。
            ジェムを選ぶと自動で trade2 から最安 1 件を取ります (3 件、約 30 秒)。値がおかしい時は「トレード2へ」で一覧を確認してください (取得条件の問題なので手入力はしない方針)。コラプト済みの品はプリズムやオーブで直せないので、検索は常に 5 ソケット (品質 20% 前提) で絞っています。
          </p>
          </details>
        </div>
  </BaseCard>
  <SoldListDialog :open="soldOpen" :title="soldTitle" :keys="soldKeys" :store="flowStore" @close="soldOpen = false" />
</template>
