<script setup lang="ts">
/**
 * SoldListDialog.vue — 売れたリスト (2026-09-17)
 *
 * 判定の根拠になった出品を 1 件ずつ見る画面。
 *
 * 2026-09-17 の作り直し (オーナー指摘:「同時に 14 件とか何のことってなる」):
 *   - 一覧は「確認した時刻」でまとめる。周期 (既定 8 時間) ごとに確認しているので、
 *     1 回の確認で何件もまとめて消えているのが普通。それが分かる見出しを出す
 *   - 判定は実測そのままを書く (「速い · 3 時間で売れる」「14 件が売れました (売れるまで 3 時間)」)
 */
import { computed, ref } from "vue";
import { flowSentence, fmtSellTime, summarizeFlow, verifyFlow, type FlowStore, type Tracked, type VerifyResult } from "../services/market-flow";
import { averageExalted, currencyJa, displayCurrency, setDisplayCurrency, type DisplayCurrency } from "../state/display-currency";
import { fmtClock, fmtSpan } from "../utils/format-time";

const props = defineProps<{
  open: boolean;
  /** 見出し (ジェムの日本語名) */
  title: string;
  /** 見る銘柄。ジェムなら 3 条件ぶん */
  keys: { key: string; label: string }[];
  store: FlowStore | null;
}>();
const emit = defineEmits<{ (e: "close"): void }>();

const curLabel = currencyJa;
const nowSec = (): number => Math.floor(Date.now() / 1000);

function fmtAmount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n >= 100 ? String(Math.round(n)) : n.toFixed(n < 10 ? 1 : 0).replace(/\.0$/, "");
}
const startOf = (t: Tracked): number => t.listed_at ?? t.first_seen;

interface Row {
  id: string;
  cond: string;
  account: string;
  amount: number | null | undefined;
  currency: string | null | undefined;
  listedAt: number | null;
  firstSeen: number;
  goneAt: number;
  /** 出品されてから消えるまで (並んでいた時間) */
  life: number;
  /** 出品時刻が取れていない (並んでいた時間は「初めて見てから」で数えた) */
  estimated: boolean;
  /** 値段の付け替え (消えた直後に同じ出品者が並べ直した) */
  relisted: boolean;
}

/** 条件ごとのまとめ */
const summaries = computed(() =>
  props.keys.map((k) => {
    const st = props.store?.states?.[k.key];
    const f = summarizeFlow(st);
    const watched = props.store?.watches?.some((w) => w.key === k.key);
    return {
      key: k.key,
      label: k.label,
      verdict: f.label || (f.gone + f.alive > 0 ? "判定待ち" : watched ? "巡回待ち" : "記録なし"),
      sentence: flowSentence(f),
      tone: f.tone,
      gone: f.gone,
      alive: f.alive,
      medianMin: f.medianMin,
      olderThanMedian: f.olderThanMedian,
      avgSold: averageExalted(f.soldPrices),
      droppedUnsold: f.droppedUnsold,
      truncated: f.truncated,
      total: st?.total ?? null,
      cheapest: st?.cheapest_amount ?? null,
      cheapestCur: st?.cheapest_currency ?? null,
      sampledAt: st?.sampled_at ?? 0,
      stale: f.stale,
    };
  }),
);

/** 消えた出品 (新しい順) */
const soldRows = computed<Row[]>(() => {
  const rows: Row[] = [];
  for (const k of props.keys) {
    const st = props.store?.states?.[k.key];
    if (!st?.tracked) continue;
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
        estimated: t.listed_at == null,
        relisted: !!t.relisted,
      });
    }
  }
  return rows.sort((a, b) => b.goneAt - a.goneAt);
});

/** 通貨ごとに足す (神とカオスが混ざるので合算しない) */
function sumBy(list: { amount?: number | null; currency?: string | null }[]): [string, number][] {
  const m = new Map<string, number>();
  for (const r of list) {
    if (r.amount == null || !r.currency) continue;
    m.set(r.currency, (m.get(r.currency) ?? 0) + r.amount);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * 「確認した時刻」でまとめる。
 *
 * 周期ごとに確認しているので、その間に売れた分は同じ時刻でまとめて出てくる。
 * 「同時に 14 件消えた」ように見えるのはそのため、というのが分かる形にする。
 * 1 巡の中で 3 条件は数秒〜数十秒ずれて取られるので、秒ではなく分でまとめる
 * (秒で分けていた頃は同じ確認が 2〜3 つの見出しに割れていた。2026-09-18 レビュー指摘)
 */
const checkGroups = computed(() => {
  const map = new Map<number, Row[]>();
  for (const r of soldRows.value) {
    const at = Math.floor(r.goneAt / 60) * 60;
    const list = map.get(at);
    if (list) list.push(r);
    else map.set(at, [r]);
  }
  const times = [...map.keys()].sort((a, b) => b - a);
  return times.map((at, i) => {
    const list = map.get(at)!;
    const sellers = new Map<string, number>();
    for (const r of list) sellers.set(r.account || "不明", (sellers.get(r.account || "不明") ?? 0) + 1);
    const top = [...sellers.entries()].sort((a, b) => b[1] - a[1])[0];
    void i;
    return {
      at,
      list,
      totals: sumBy(list.filter((r) => !r.relisted)),
      sold: list.filter((r) => !r.relisted).length,
      relisted: list.filter((r) => r.relisted).length,
      topSeller: top && top[1] > 1 ? { name: top[0], n: top[1] } : null,
    };
  });
});

const grandTotal = computed(() => sumBy(soldRows.value.filter((r) => !r.relisted)));
const soldCount = computed(() => soldRows.value.filter((r) => !r.relisted).length);
const relistedCount = computed(() => soldRows.value.filter((r) => r.relisted).length);

/** まだ出品されている分 (並んでいる時間が長い順) */
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

/** 登録元のメモ (「品質 23% を 12 / 47 人」など) */
const note = computed(() => props.store?.watches?.find((w) => props.keys.some((k) => k.key === w.key))?.note ?? "");

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

/** 記録と今の検索結果の突き合わせ (検索 1 回) */
const verifying = ref("");
const verified = ref<Record<string, VerifyResult | null>>({});
async function verify(key: string): Promise<void> {
  if (verifying.value) return;
  verifying.value = key;
  try {
    verified.value = { ...verified.value, [key]: await verifyFlow(key) };
  } finally {
    verifying.value = "";
  }
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-black/80" @click.self="emit('close')">
    <div class="w-full max-w-4xl my-8 rounded-lg border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-surface)] shadow-xl">
      <div class="flex items-baseline justify-between gap-3 p-4 pb-2">
        <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">
          売れたリスト<span class="text-[12px] text-[var(--exile-color-text-secondary)] tracking-normal"> · {{ title }}</span>
          <span v-if="note" class="ml-2 text-[11px] text-[var(--exile-color-text-tertiary)] tracking-normal">{{ note }}</span>
        </h2>
        <div class="flex items-center gap-3 text-[11px]">
          <label class="inline-flex items-center gap-1 text-[var(--exile-color-text-tertiary)]">
            表示通貨
            <select
              class="text-[11px] px-1 py-0.5 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)]"
              :value="displayCurrency.cur.value"
              @change="setDisplayCurrency(($event.target as HTMLSelectElement).value as DisplayCurrency)"
            >
              <option value="exalted">高貴</option>
              <option value="chaos">カオス</option>
              <option value="divine">神</option>
            </select>
          </label>
          <button type="button" class="text-[12px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" @click="emit('close')">閉じる</button>
        </div>
      </div>

      <!-- 条件ごとの判定 -->
      <div class="px-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div v-for="s in summaries" :key="s.key" class="rounded border border-[var(--exile-color-border-subtle)] p-2 text-[11px]">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[var(--exile-color-text-secondary)]">{{ s.label }}</span>
            <span class="px-1.5 py-0.5 rounded border text-[10px] font-display tracking-[0.06em] leading-none whitespace-nowrap" :class="toneClass(s.tone)">
              {{ s.verdict }}<template v-if="s.medianMin != null"> · {{ fmtSellTime(s.medianMin) }}で売れる</template>
            </span>
          </div>
          <p class="mt-1 text-[var(--exile-color-text-secondary)] leading-relaxed">{{ s.sentence }}</p>
          <dl class="mt-1 space-y-0.5 tabular-nums text-[var(--exile-color-text-tertiary)]">
            <div class="flex justify-between gap-2"><dt>売れた</dt><dd>{{ s.gone }} 件</dd></div>
            <div v-if="s.avgSold != null" class="flex justify-between gap-2 text-[var(--exile-color-text-secondary)]"><dt>平均売値</dt><dd>{{ displayCurrency.money(s.avgSold) }}</dd></div>
            <div class="flex justify-between gap-2"><dt>まだ並んでいる</dt><dd>{{ s.alive }} 件<span v-if="s.stale"> (うち 2 日超 {{ s.stale }})</span></dd></div>
            <div v-if="s.olderThanMedian > 0" class="flex justify-between gap-2 text-amber-300"><dt>うち表示より長い</dt><dd>{{ s.olderThanMedian }} 件</dd></div>
            <div v-if="s.droppedUnsold > 0" class="flex justify-between gap-2"><dt>7 日で打ち切り</dt><dd>{{ s.droppedUnsold }} 件</dd></div>
            <div v-if="s.truncated" class="flex justify-between gap-2 text-amber-300"><dt>判定不可</dt><dd>出品 100 件超</dd></div>
            <div class="flex justify-between gap-2"><dt>売れるまで (真ん中の値)</dt><dd>{{ s.medianMin != null ? fmtSpan(s.medianMin * 60) : "—" }}</dd></div>
            <div class="flex justify-between gap-2"><dt>今の出品数 / 最安</dt><dd>{{ s.total ?? "—" }} 件 / {{ fmtAmount(s.cheapest) }} {{ curLabel(s.cheapestCur) }}</dd></div>
            <div class="flex justify-between gap-2"><dt>最後に確認</dt><dd>{{ fmtClock(s.sampledAt) }}</dd></div>
          </dl>
          <button
            type="button"
            class="mt-1 text-[10px] underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-accent-focus)] disabled:opacity-40"
            :disabled="verifying !== ''"
            title="今この条件で検索を 1 回投げ、記録している出品が今も一覧に載っているかを数えます (判定の土台の確認)"
            @click="verify(s.key)"
          >
            {{ verifying === s.key ? "突き合わせ中…" : "今の検索と突き合わせる" }}
          </button>
          <p v-if="verified[s.key]" class="text-[10px] mt-0.5 tabular-nums" :class="verified[s.key]!.ids >= verified[s.key]!.total ? 'text-[var(--exile-color-text-secondary)]' : 'text-amber-300'">
            今の出品 {{ verified[s.key]!.total }} 件 (ID が取れた分 {{ verified[s.key]!.ids }} 件)<br />
            追跡中 {{ verified[s.key]!.tracked }} 件のうち、今も並んでいるのが {{ verified[s.key]!.matched }} 件 / 消えたのが {{ verified[s.key]!.missing.length }} 件<br />
            まだ追跡していない出品 {{ verified[s.key]!.untracked }} 件
          </p>
          <p v-else-if="verified[s.key] === null" class="text-[10px] mt-0.5 text-amber-300">突き合わせに失敗しました (レート制限か通信)</p>
        </div>
      </div>

      <div class="p-4 pt-3">
        <!-- 売れた一覧 -->
        <div class="rounded-lg border border-[var(--exile-color-border-subtle)] p-3 text-[12px] overflow-x-auto">
          <div class="flex items-baseline gap-3 flex-wrap mb-2">
            <h3 class="font-display tracking-[0.06em] text-[13px] text-[var(--exile-color-accent-focus)]">売れた出品</h3>
            <span class="tabular-nums text-[var(--exile-color-text-secondary)]">{{ soldCount }} 件</span>
            <span v-for="[c, amt] in grandTotal" :key="c" class="tabular-nums text-emerald-300">{{ fmtAmount(amt) }} {{ curLabel(c) }}</span>
            <span v-if="relistedCount" class="text-[11px] text-[var(--exile-color-text-tertiary)]">値段の付け替え {{ relistedCount }} 件は除外</span>
          </div>

          <p v-if="soldRows.length === 0" class="text-[var(--exile-color-text-tertiary)]">
            まだ 1 件も売れていません。追跡中の出品が一覧から消えると、ここに値段つきで並びます。
          </p>

          <table v-else class="w-full">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">条件</th>
                <th class="text-right font-normal pb-1 pl-3">値段</th>
                <th class="text-left font-normal pb-1 pl-3">出品者</th>
                <th class="text-right font-normal pb-1 pl-3 whitespace-nowrap">並んでいた時間</th>
                <th class="text-left font-normal pb-1 pl-3 whitespace-nowrap">出品時刻</th>
              </tr>
            </thead>
            <tbody v-for="g in checkGroups" :key="g.at">
              <!-- 確認 1 回ぶんの見出し。まとめて消えて見える理由をここで説明する -->
              <tr class="border-t border-[var(--exile-color-border-brass)]">
                <td colspan="5" class="pt-3 pb-1">
                  <div class="flex items-baseline gap-2 flex-wrap">
                    <span class="font-display tracking-[0.06em] text-[13px] text-[var(--exile-color-accent-focus)]">{{ fmtClock(g.at) }} の確認</span>
                    <span class="tabular-nums text-[var(--exile-color-text-secondary)]">{{ g.sold }} 件が売れていた</span>
                    <!-- 「前の確認」の時刻は記録に無い (売れた物があった確認しか分からない) ので、間隔は出さない -->
                    <span class="text-[10px] text-[var(--exile-color-text-tertiary)]">(前の確認からこの時刻までの間に売れた)</span>
                    <span v-if="g.topSeller" class="text-[10px] text-amber-300">同じ出品者 {{ g.topSeller.name }} が {{ g.topSeller.n }} 件</span>
                    <span v-if="g.relisted" class="text-[10px] text-[var(--exile-color-text-tertiary)]">値段の付け替え {{ g.relisted }} 件を含む (除外済み)</span>
                  </div>
                </td>
              </tr>
              <tr v-for="r in g.list" :key="r.id" class="border-t border-[var(--exile-color-border-subtle)]" :class="r.relisted ? 'text-[var(--exile-color-text-tertiary)]' : ''">
                <td class="py-1 whitespace-nowrap">
                  {{ r.cond }}<span v-if="r.relisted" class="text-[10px]"> · 付け替え</span>
                </td>
                <td class="py-1 pl-3 text-right tabular-nums whitespace-nowrap">{{ fmtAmount(r.amount) }} {{ curLabel(r.currency) }}</td>
                <td class="py-1 pl-3 max-w-[12rem] truncate" :title="r.account">{{ r.account || "—" }}</td>
                <td class="py-1 pl-3 text-right tabular-nums whitespace-nowrap">{{ fmtSpan(r.life) }}</td>
                <td class="py-1 pl-3 tabular-nums whitespace-nowrap text-[var(--exile-color-text-secondary)]">
                  {{ fmtClock(r.listedAt ?? r.firstSeen) }}<span v-if="r.estimated" class="text-[10px] text-[var(--exile-color-text-tertiary)]"> (推定)</span>
                </td>
              </tr>
            </tbody>
          </table>

          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2 leading-relaxed">
            出品の一覧は自動取得の周期ごと (「再取得」や「一括取得」を押した時はその時も) に見ています。見た時に消えていれば売れたと数えるので、
            <span class="text-[var(--exile-color-text-secondary)]">1 回の確認で何件もまとめて出てくるのが普通</span>です。
            消えた正確な時刻は分からないので、「並んでいた時間」は出品時刻から確認時刻までの長さです (実際はもっと短い可能性があります)。
            消えたのと同時に同じ出品者が並べ直していた分は、値段の付け替えとみなして売れた件数から外しています。
            追跡しているのは<span class="text-[var(--exile-color-text-secondary)]">その時点で最安 10 件の出品</span>なので、
            「売れるまで ◯ 時間」は<span class="text-[var(--exile-color-text-secondary)]">最安帯に並べた場合の時間</span>です。
            それより高い値段で並んでいる物は「まだ並んでいる出品」に残り続けます。
          </p>
        </div>

        <!-- まだ並んでいる -->
        <div class="mt-3 rounded-lg border border-[var(--exile-color-border-subtle)] p-3 text-[12px] overflow-x-auto">
          <h3 class="font-display tracking-[0.06em] text-[13px] text-[var(--exile-color-accent-focus)] mb-1">まだ並んでいる出品 ({{ aliveRows.length }} 件・長い順)</h3>
          <p v-if="aliveRows.length === 0" class="text-[var(--exile-color-text-tertiary)]">追跡中の出品はありません。</p>
          <table v-else class="w-full">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">条件</th>
                <th class="text-right font-normal pb-1 pl-3">値段</th>
                <th class="text-left font-normal pb-1 pl-3">出品者</th>
                <th class="text-right font-normal pb-1 pl-3 whitespace-nowrap">並んでいる時間</th>
                <th class="text-left font-normal pb-1 pl-3 whitespace-nowrap">出品時刻</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in aliveRows" :key="r.id" class="border-t border-[var(--exile-color-border-subtle)]">
                <td class="py-1 whitespace-nowrap">{{ r.cond }}</td>
                <td class="py-1 pl-3 text-right tabular-nums whitespace-nowrap">{{ fmtAmount(r.amount) }} {{ curLabel(r.currency) }}</td>
                <td class="py-1 pl-3 max-w-[12rem] truncate" :title="r.account">{{ r.account || "—" }}</td>
                <td class="py-1 pl-3 text-right tabular-nums whitespace-nowrap" :class="r.age >= 48 * 3600 ? 'text-rose-300' : ''">{{ fmtSpan(r.age) }}</td>
                <td class="py-1 pl-3 tabular-nums whitespace-nowrap text-[var(--exile-color-text-secondary)]">
                  {{ fmtClock(r.listedAt) }}<span v-if="r.estimated" class="text-[10px] text-[var(--exile-color-text-tertiary)]"> (推定)</span>
                </td>
              </tr>
            </tbody>
          </table>
          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
            2 日以上並んだままの出品は赤字にしています。その値段では買い手が付いていないという目安です。
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
