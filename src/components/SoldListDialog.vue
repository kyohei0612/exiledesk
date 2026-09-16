<script setup lang="ts">
/**
 * SoldListDialog.vue — 捌き速度の「売れたリスト」(オーナー指示 2026-09-17)
 *
 * 判定 (速い / 普通 / 遅い) の根拠になった出品を 1 件ずつ出す。
 * 取引履歴と同じ「日付で束ねた表」の形にして、値段・出品時刻・寿命まで全部載せる。
 *
 * 「消えた」は検索結果から居なくなったという意味で、売れたか取り下げたかは区別できない。
 * 同じ回の巡回で何件も同時に消えた時は、1 人のまとめ出しが引き上げられた可能性があるので
 * 備考に出す (2026-09-17 チャージレギュレーションで実際に起きた)。
 */
import { computed } from "vue";
import { summarizeFlow, type FlowStore, type Tracked } from "../services/market-flow";

const props = defineProps<{
  open: boolean;
  /** 見出し (ジェムの日本語名) */
  title: string;
  /** 見る銘柄。ジェムなら 3 条件ぶん */
  keys: { key: string; label: string }[];
  store: FlowStore | null;
}>();
const emit = defineEmits<{ (e: "close"): void }>();

const CURRENCY_JA: Record<string, string> = { exalted: "高貴", divine: "神", chaos: "カオス" };
const curLabel = (c: string | null | undefined): string => (c ? (CURRENCY_JA[c] ?? c) : "");
const nowSec = (): number => Math.floor(Date.now() / 1000);

function fmtAmount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n >= 100 ? String(Math.round(n)) : n.toFixed(n < 10 ? 1 : 0).replace(/\.0$/, "");
}
function fmtClock(sec: number | null | undefined): string {
  if (!sec) return "—";
  const d = new Date(sec * 1000);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtDay(sec: number): string {
  const d = new Date(sec * 1000);
  const w = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 (${w})`;
}
/** 秒 → 「2 時間 15 分」「3 日 4 時間」 */
function fmtSpan(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const m = Math.max(0, Math.round(sec / 60));
  if (m < 60) return `${m} 分`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} 時間${m % 60 ? ` ${m % 60} 分` : ""}`;
  return `${Math.floor(h / 24)} 日 ${h % 24} 時間`;
}
const startOf = (t: Tracked): number => t.listed_at ?? t.first_seen;
/** その日の 0:00 (ローカル) */
function dayStart(sec: number): number {
  const d = new Date(sec * 1000);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

interface Row {
  id: string;
  cond: string;
  /** 出品者。オーナー指示 (2026-09-17):「大事なのは出品者の名前と売値」 */
  account: string;
  amount: number | null | undefined;
  currency: string | null | undefined;
  listedAt: number | null;
  firstSeen: number;
  goneAt: number;
  /** 出品されてから消えるまで */
  life: number;
  /** こちらが見ていられた時間 (初めて見てから消えるまで) */
  watched: number;
  /** 出品時刻が取れていない (寿命は「初めて見てから」で数えた) */
  estimated: boolean;
  /** 同じ回の巡回で一緒に消えた件数 */
  batch: number;
  /** そのうち同じ出品者だった件数 (1 人のまとめ引き上げを見分ける) */
  sameSeller: number;
}

/** 条件ごとのまとめ (表の上に出す) */
const summaries = computed(() =>
  props.keys.map((k) => {
    const st = props.store?.states?.[k.key];
    const f = summarizeFlow(st);
    return {
      key: k.key,
      label: k.label,
      verdict: f.label || (f.gone + f.alive > 0 ? "判定待ち" : "記録なし"),
      tone: f.tone,
      gone: f.gone,
      alive: f.alive,
      total: st?.total ?? null,
      cheapest: st?.cheapest_amount ?? null,
      cheapestCur: st?.cheapest_currency ?? null,
      sampledAt: st?.sampled_at ?? 0,
      medianMin: f.medianMin,
      soldIn24h: f.soldIn24h,
      known24: f.known24,
      hit24: f.hit24,
    };
  }),
);

/** 消えた出品 (新しい順)。同じ回にまとめて消えた件数も数える */
const soldRows = computed<Row[]>(() => {
  const rows: Row[] = [];
  for (const k of props.keys) {
    const st = props.store?.states?.[k.key];
    if (!st?.tracked) continue;
    const batchOf = new Map<number, number>();
    const sellerBatch = new Map<string, number>();
    for (const t of st.tracked) {
      if (!t.gone_at) continue;
      batchOf.set(t.gone_at, (batchOf.get(t.gone_at) ?? 0) + 1);
      if (t.account) sellerBatch.set(`${t.gone_at}:${t.account}`, (sellerBatch.get(`${t.gone_at}:${t.account}`) ?? 0) + 1);
    }
    for (const t of st.tracked) {
      if (!t.gone_at) continue;
      rows.push({
        id: t.id,
        cond: k.label,
        account: t.account ?? "",
        amount: t.amount,
        currency: t.currency,
        listedAt: t.listed_at ?? null,
        firstSeen: t.first_seen,
        goneAt: t.gone_at,
        life: t.gone_at - startOf(t),
        watched: t.gone_at - t.first_seen,
        estimated: t.listed_at == null,
        batch: batchOf.get(t.gone_at) ?? 1,
        sameSeller: t.account ? (sellerBatch.get(`${t.gone_at}:${t.account}`) ?? 1) : 0,
      });
    }
  }
  return rows.sort((a, b) => b.goneAt - a.goneAt);
});

/** 通貨ごとに足す (神とカオスが混ざるので合算はしない) */
function sumBy(list: { amount?: number | null; currency?: string | null }[]): [string, number][] {
  const m = new Map<string, number>();
  for (const r of list) {
    if (r.amount == null || !r.currency) continue;
    m.set(r.currency, (m.get(r.currency) ?? 0) + r.amount);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** 日付で束ねる (取引履歴と同じ見せ方。その日の合計つき) */
const dayGroups = computed(() => {
  const map = new Map<number, Row[]>();
  for (const r of soldRows.value) {
    const d = dayStart(r.goneAt);
    const list = map.get(d);
    if (list) list.push(r);
    else map.set(d, [r]);
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([start, list]) => ({ start, list, totals: sumBy(list) }));
});
/** 全期間の合計 */
const grandTotal = computed(() => sumBy(soldRows.value));

/** 出品者ごとの内訳 (多い順)。1 人の在庫がまとめて動いただけなのかを見る */
const sellerBreakdown = computed(() => {
  const m = new Map<string, number>();
  for (const r of soldRows.value) {
    const who = r.account || "出品者不明";
    m.set(who, (m.get(who) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
});
/** 登録元のメモ (「完成品 12 / 47 人」など) */
const note = computed(() => props.store?.watches?.find((w) => props.keys.some((k) => k.key === w.key))?.note ?? "");

/** まだ出品されている分 (古い順 = 滞留している順) */
const aliveRows = computed(() => {
  const now = nowSec();
  const rows: { id: string; cond: string; account: string; amount: number | null | undefined; currency: string | null | undefined; listedAt: number | null; age: number; estimated: boolean }[] = [];
  for (const k of props.keys) {
    const st = props.store?.states?.[k.key];
    if (!st?.tracked) continue;
    for (const t of st.tracked) {
      if (t.gone_at) continue;
      rows.push({ id: t.id, cond: k.label, account: t.account ?? "", amount: t.amount, currency: t.currency, listedAt: t.listed_at ?? null, age: now - startOf(t), estimated: t.listed_at == null });
    }
  }
  return rows.sort((a, b) => b.age - a.age);
});

function toneClass(tone: string): string {
  switch (tone) {
    case "fast":
      return "text-emerald-300 border-emerald-400/50";
    case "normal":
      return "text-amber-200 border-amber-300/40";
    case "slow":
      return "text-rose-300 border-rose-400/40";
    default:
      return "text-[var(--exile-color-text-tertiary)] border-[var(--exile-color-border-subtle)]";
  }
}
const pct = (v: number | null): string => (v == null ? "—" : `${Math.round(v * 100)}%`);
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-black/80" @click.self="emit('close')">
    <div class="w-full max-w-4xl my-8 rounded-lg border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-surface)] shadow-xl">
      <div class="flex items-baseline justify-between gap-3 p-4 pb-2">
        <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">
          売れたリスト<span class="text-[12px] text-[var(--exile-color-text-secondary)] tracking-normal"> · {{ title }}</span>
          <span v-if="note" class="ml-2 text-[11px] text-[var(--exile-color-text-tertiary)] tracking-normal">{{ note }}</span>
        </h2>
        <button type="button" class="text-[12px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" @click="emit('close')">閉じる</button>
      </div>

      <!-- 条件ごとのまとめ -->
      <div class="px-4 grid grid-cols-1 @2xl:grid-cols-3 sm:grid-cols-3 gap-2">
        <div v-for="s in summaries" :key="s.key" class="rounded border border-[var(--exile-color-border-subtle)] p-2 text-[11px]">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[var(--exile-color-text-secondary)]">{{ s.label }}</span>
            <span class="px-1.5 py-0.5 rounded border text-[10px] font-display tracking-[0.06em] leading-none" :class="toneClass(s.tone)">{{ s.verdict }}</span>
          </div>
          <dl class="mt-1 space-y-0.5 tabular-nums text-[var(--exile-color-text-tertiary)]">
            <div class="flex justify-between gap-2"><dt>売れた / 追跡中</dt><dd>{{ s.gone }} / {{ s.alive }} 件</dd></div>
            <div class="flex justify-between gap-2"><dt>1 日で売れた率</dt><dd>{{ pct(s.soldIn24h) }} <span v-if="s.known24">({{ s.hit24 }}/{{ s.known24 }})</span></dd></div>
            <div class="flex justify-between gap-2"><dt>売れるまで (中央値)</dt><dd>{{ s.medianMin != null ? fmtSpan(s.medianMin * 60) : "—" }}</dd></div>
            <div class="flex justify-between gap-2"><dt>今の出品数 / 最安</dt><dd>{{ s.total ?? "—" }} 件 / {{ fmtAmount(s.cheapest) }} {{ curLabel(s.cheapestCur) }}</dd></div>
            <div class="flex justify-between gap-2"><dt>最後に見た</dt><dd>{{ fmtClock(s.sampledAt) }}</dd></div>
          </dl>
        </div>
      </div>

      <!-- 売れた (消えた) 一覧 -->
      <div class="p-4 pt-3">
        <div class="rounded-lg border border-[var(--exile-color-border-subtle)] p-3 text-[12px] overflow-x-auto">
          <p v-if="soldRows.length === 0" class="text-[var(--exile-color-text-tertiary)]">
            まだ 1 件も消えていません。追跡中の出品が売れるか取り下げられると、ここに値段つきで並びます。
          </p>
          <table v-else class="w-full">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1 whitespace-nowrap">消えた時刻</th>
                <th class="text-left font-normal pb-1 pl-3">条件</th>
                <th class="text-right font-normal pb-1 pl-3">値段</th>
                <th class="text-left font-normal pb-1 pl-3">出品者</th>
                <th class="text-left font-normal pb-1 pl-3 whitespace-nowrap">出品時刻</th>
                <th class="text-right font-normal pb-1 pl-3 whitespace-nowrap">出品から</th>
                <th class="text-right font-normal pb-1 pl-3 whitespace-nowrap">見ていた時間</th>
                <th class="text-left font-normal pb-1 pl-3">備考</th>
              </tr>
            </thead>
            <tbody v-for="g in dayGroups" :key="g.start">
              <tr class="border-t border-[var(--exile-color-border-brass)]">
                <td colspan="8" class="pt-3 pb-1">
                  <div class="flex items-baseline gap-3 flex-wrap">
                    <span class="font-display tracking-[0.06em] text-[13px] text-[var(--exile-color-accent-focus)]">{{ fmtDay(g.start) }}</span>
                    <span v-for="[c, amt] in g.totals" :key="c" class="tabular-nums text-emerald-300">{{ fmtAmount(amt) }} {{ curLabel(c) }}</span>
                    <span class="text-[11px] text-[var(--exile-color-text-tertiary)] tabular-nums">{{ g.list.length }} 件</span>
                  </div>
                </td>
              </tr>
              <tr v-for="r in g.list" :key="r.id" class="border-t border-[var(--exile-color-border-subtle)]">
                <td class="py-1 tabular-nums whitespace-nowrap text-[var(--exile-color-text-secondary)]">{{ fmtClock(r.goneAt) }}</td>
                <td class="py-1 pl-3 whitespace-nowrap">{{ r.cond }}</td>
                <td class="py-1 pl-3 text-right tabular-nums whitespace-nowrap">{{ fmtAmount(r.amount) }} {{ curLabel(r.currency) }}</td>
                <td class="py-1 pl-3 max-w-[10rem] truncate" :title="r.account">{{ r.account || "—" }}</td>
                <td class="py-1 pl-3 tabular-nums whitespace-nowrap text-[var(--exile-color-text-secondary)]">{{ fmtClock(r.listedAt ?? r.firstSeen) }}<span v-if="r.estimated" class="text-[10px] text-[var(--exile-color-text-tertiary)]"> (推定)</span></td>
                <td class="py-1 pl-3 text-right tabular-nums whitespace-nowrap">{{ fmtSpan(r.life) }}</td>
                <td class="py-1 pl-3 text-right tabular-nums whitespace-nowrap text-[var(--exile-color-text-secondary)]">{{ fmtSpan(r.watched) }}</td>
                <td class="py-1 pl-3 text-[10px] text-[var(--exile-color-text-tertiary)]">
                  <span v-if="r.sameSeller > 1" class="text-amber-300" :title="`同じ出品者の ${r.sameSeller} 件が同時に消えました。1 人がまとめて引き上げた (または 1 人がまとめ買いした) 可能性が高く、件数ぶん売れたとは数えない方が安全です`">
                    同じ出品者 {{ r.sameSeller }} 件が同時
                  </span>
                  <span v-else-if="r.batch > 1" class="text-[var(--exile-color-text-tertiary)]" title="同じ回の確認で一緒に消えました (出品者は別々)">同時に {{ r.batch }} 件</span>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="soldRows.length > 0" class="mt-2 text-[11px] flex items-baseline gap-3 flex-wrap">
            <span class="text-[var(--exile-color-text-secondary)]">消えた分の合計</span>
            <span v-for="[c, amt] in grandTotal" :key="c" class="tabular-nums text-emerald-300">{{ fmtAmount(amt) }} {{ curLabel(c) }}</span>
            <span class="text-[var(--exile-color-text-tertiary)] tabular-nums">{{ soldRows.length }} 件</span>
            <span class="text-[10px] text-[var(--exile-color-text-tertiary)]">(全部が売れたとは限りません。下の注意を参照)</span>
          </p>
          <p v-if="sellerBreakdown.length > 0" class="mt-1 text-[11px] flex items-baseline gap-3 flex-wrap">
            <span class="text-[var(--exile-color-text-secondary)]">出品者の内訳</span>
            <span v-for="[who, n] in sellerBreakdown" :key="who" class="tabular-nums text-[var(--exile-color-text-tertiary)]">
              {{ who }} <span :class="n >= 3 ? 'text-amber-300' : ''">{{ n }} 件</span>
            </span>
          </p>
          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
            「消えた」は公式の検索結果から居なくなったという意味で、売れたのか取り下げたのかは区別できません。値段は最後に見えていた時の出品価格です。
            1 時間ごと (手動取得ならそのたび) に確認しているので、消えた時刻はその間隔ぶんの誤差があります。
            <span class="text-amber-300">同時に複数件</span>が同じ回で消えている場合は、1 人が並べていた在庫をまとめて引き上げた (または 1 人がまとめ買いした) 可能性が高いので、件数ぶん売れたとは数えない方が安全です。
          </p>
        </div>

        <!-- 出品中 -->
        <div class="mt-3 rounded-lg border border-[var(--exile-color-border-subtle)] p-3 text-[12px] overflow-x-auto">
          <h3 class="text-[11px] text-[var(--exile-color-text-secondary)] mb-1">追跡中 (まだ売れていない出品・古い順)</h3>
          <p v-if="aliveRows.length === 0" class="text-[var(--exile-color-text-tertiary)]">追跡中の出品はありません。</p>
          <table v-else class="w-full">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">条件</th>
                <th class="text-right font-normal pb-1 pl-3">値段</th>
                <th class="text-left font-normal pb-1 pl-3">出品者</th>
                <th class="text-left font-normal pb-1 pl-3 whitespace-nowrap">出品時刻</th>
                <th class="text-right font-normal pb-1 pl-3 whitespace-nowrap">出品からの経過</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in aliveRows" :key="r.id" class="border-t border-[var(--exile-color-border-subtle)]">
                <td class="py-1 whitespace-nowrap">{{ r.cond }}</td>
                <td class="py-1 pl-3 text-right tabular-nums whitespace-nowrap">{{ fmtAmount(r.amount) }} {{ curLabel(r.currency) }}</td>
                <td class="py-1 pl-3 max-w-[10rem] truncate" :title="r.account">{{ r.account || "—" }}</td>
                <td class="py-1 pl-3 tabular-nums whitespace-nowrap text-[var(--exile-color-text-secondary)]">{{ fmtClock(r.listedAt) }}<span v-if="r.estimated" class="text-[10px] text-[var(--exile-color-text-tertiary)]"> (推定)</span></td>
                <td class="py-1 pl-3 text-right tabular-nums whitespace-nowrap" :class="r.age >= 48 * 3600 ? 'text-rose-300' : ''">{{ fmtSpan(r.age) }}</td>
              </tr>
            </tbody>
          </table>
          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
            出品から 48 時間を超えて残っている物は赤字にしています。値段の割に売れていない = その値段では高いという目安です。
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
